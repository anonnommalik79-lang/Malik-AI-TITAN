import type { AIProvider, AIRequest, AIResponse } from "./types"
import { systemPromptForTask } from "./persona"
import { taskSystemPrompt } from "./task-prompts"
import { detectTask } from "./detect-task"
import { runWithFallback } from "./fallback"
import { providersForTask, providerStatus } from "./providers"
import { checkUsageLimit } from "@/lib/limits/rate-limit"
import { incrementUsage } from "./usage"

function normalize(input: AIRequest): AIRequest {
  const detected = detectTask(input.prompt, input.attachments)
  const task = input.task || detected.task

  return {
    ...input,
    task,
    messages: (() => {
      const windowed = input.messages?.slice(-Number(process.env.CHAT_HISTORY_WINDOW || 12)) || []
      const hasSystem = windowed.some((message) => message.role === "system")
      return hasSystem ? windowed : [{ role: "system" as const, content: taskSystemPrompt(task, input.prompt) }, ...windowed]
    })(),
    maxTokens:
      input.maxTokens ||
      (task === "code" || task === "debug" || task === "project"
        ? Number(process.env.MAX_CODE_OUTPUT_TOKENS || 4000)
        : Number(process.env.MAX_OUTPUT_TOKENS || 1200)),
    metadata: {
      ...input.metadata,
      detection: detected,
    },
  }
}

async function runProvider(provider: AIProvider, input: AIRequest): Promise<AIResponse> {
  if (input.task === "code" || input.task === "debug" || input.task === "project") return provider.generateCode(input)
  if (input.task === "file_analysis") return provider.analyzeFile(input)
  if (input.task === "image") return provider.generateImage(input)
  if (input.task === "video") return provider.generateVideo(input)
  return provider.sendMessage(input)
}

export async function routeAI(input: AIRequest): Promise<AIResponse> {
  const request = normalize(input)
  const userId = request.userId || request.userEmail || "guest"
  const plan = request.plan || "free"

  const rate = await checkUsageLimit({ userId, plan, task: request.task || "chat" })
  if (!rate.ok) {
    return {
      success: false,
      provider: "local",
      model: "rate-limit",
      type: "chat",
      output: rate.error || "Rate limit reached.",
      error: rate.code || "RATE_LIMIT",
      latencyMs: 0,
    }
  }

  const allowedProviders = Array.isArray(request.metadata?.allowedProviders)
    ? (request.metadata?.allowedProviders as string[])
    : undefined
  const providers = providersForTask(request.task || "chat", request.provider, allowedProviders)
  const result = await runWithFallback(providers, request, runProvider)

  if (result.success) {
    const usage = result.usage || {}
    const totalTokens = Number((usage as any).total_tokens || (usage as any).totalTokens || 0)
    incrementUsage(userId, plan, request.task || "chat", totalTokens)
  }

  return result
}

export function getAIStatus() {
  return {
    success: true,
    stage: "provider-router-active",
    providers: providerStatus(),
    routes: {
      activeNextApiRoute: true,
      reason: "Server-side provider routing is active with automatic fallback.",
      recommendedBackendPath: "/api/stream",
    },
  }
}



