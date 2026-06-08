import { detectTask } from "./detect-task"
import { routeAI } from "./router"
import { applyFreeModeRequest } from "./free-mode"
import { isFreeModeEnabled } from "./provider-status"
import { checkUsageLimit, checkPromptLength, recordChatUsage, incrementUploadUsage } from "@/lib/limits/rate-limit"
import { resolveUserTier } from "@/lib/limits/user-plan"
import { buildThinkingPipeline, advanceThinkingStep, type ThinkingStep, type ThinkingStepId } from "./safe-thinking"
import type { AIFileAttachment, AIRequest, AIResponse, AITaskType } from "./types"

export type BrainMode =
  | "fast"
  | "smart"
  | "deep"
  | "ultra"
  | "code"
  | "photo"
  | "video"
  | "vision"
  | "free"
  | "fallback"

export type BrainResult = AIResponse & {
  mode: BrainMode
  thinkingSteps: ThinkingStep[]
  safeMode: boolean
  plan: string
}

function resolveBrainMode(
  prompt: string,
  attachments?: AIFileAttachment[],
  task?: AITaskType,
  responseDepth?: unknown,
): BrainMode {
  if (responseDepth === "ultra") return "ultra"
  if (responseDepth === "fast") return "fast"
  if (responseDepth === "deep") return "deep"

  const detected = detectTask(prompt, attachments)
  const t = task || detected.task
  if (attachments?.some((a) => a.kind === "image" || a.mime?.startsWith("image/"))) return "vision"
  if (t === "code" || t === "debug" || t === "project") return "code"
  if (t === "image") return "photo"
  if (t === "video") return "video"
  if (t === "file_analysis") return "vision"
  if (isFreeModeEnabled()) return "free"
  if (/deep|research|analyze|архитект|подробн/i.test(prompt)) return "deep"
  if (/quick|fast|коротко|быстро/i.test(prompt)) return "fast"
  return "smart"
}

function providerForMode(mode: BrainMode, freeMode: boolean): string | undefined {
  if (!freeMode) return "auto"
  if (mode === "code") return "groq"
  if (mode === "vision") return "gemini"
  return "auto"
}

export async function runMalikBrain(input: AIRequest, onStep?: (step: ThinkingStepId) => void): Promise<BrainResult> {
  const userId = input.userId || input.userEmail || "guest"
  const plan = input.plan || "free"
  const tier = resolveUserTier(userId, plan)
  const attachments = input.attachments || []
  const mode = resolveBrainMode(input.prompt, attachments, input.task, input.metadata?.responseDepth)
  const freeMode = isFreeModeEnabled()

  let thinkingSteps = buildThinkingPipeline({ hasAttachments: attachments.length > 0 })
  const emit = (id: ThinkingStepId) => {
    thinkingSteps = advanceThinkingStep(thinkingSteps, id)
    onStep?.(id)
  }

  emit("received")
  emit("analyzing")

  const promptCheck = checkPromptLength(input.prompt, tier)
  if (!promptCheck.ok) {
    return {
      success: false,
      provider: "local",
      model: "limit-guard",
      type: "chat",
      output: promptCheck.error,
      error: promptCheck.code,
      latencyMs: 0,
      mode,
      thinkingSteps: advanceThinkingStep(thinkingSteps, "done"),
      safeMode: true,
      plan: tier,
    }
  }

  if (attachments.length) {
    emit("reading_files")
    incrementUploadUsage(userId, attachments.length)
  }

  emit("checking_providers")

  const limit = await checkUsageLimit({
    userId,
    plan,
    task: input.task || "chat",
    uploadCount: attachments.length ? 0 : undefined,
  })

  if (!limit.ok) {
    return {
      success: false,
      provider: "local",
      model: "rate-limit",
      type: "chat",
      output: JSON.stringify({ ok: false, error: limit.error, resetAt: limit.resetAt, plan: limit.plan }),
      error: limit.code,
      latencyMs: 0,
      mode,
      thinkingSteps: advanceThinkingStep(thinkingSteps, "done"),
      safeMode: true,
      plan: tier,
    }
  }

  emit("selecting_model")
  emit("generating")

  const request = applyFreeModeRequest({
    ...input,
    task: input.task || detectTask(input.prompt, attachments).task,
    provider: (providerForMode(mode, freeMode) as AIRequest["provider"]) || input.provider,
    userId,
    plan,
  })

  const result = await routeAI(request)

  if (result.fallbackUsed) emit("fallback")
  emit("finalizing")
  emit("done")

  if (result.success) await recordChatUsage(userId, plan, request.task || "chat")

  return {
    ...result,
    mode,
    thinkingSteps,
    safeMode: !result.success || result.provider === "local" || Boolean(result.fallbackUsed),
    plan: tier,
  }
}
