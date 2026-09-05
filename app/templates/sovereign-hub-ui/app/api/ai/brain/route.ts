import { runMalikBrain } from "@/lib/ai/brain"
import type { AIFileAttachment, AITaskType } from "@/lib/ai/types"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { appendFounderMessage } from "@/lib/server/founder-message-log"

export const runtime = "nodejs"

type BrainBody = {
  prompt?: string
  task?: AITaskType
  files?: AIFileAttachment[]
  attachments?: AIFileAttachment[]
}

function outputText(value: unknown) {
  if (typeof value === "string") return value
  if (value == null) return ""
  try { return JSON.stringify(value) } catch { return String(value) }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as BrainBody
  const prompt = String(body.prompt || "").trim()
  if (!prompt) return Response.json({ ok: false, error: "prompt required" }, { status: 400 })

  const entitlement = await resolveRequestEntitlement(request)
  const result = await runMalikBrain({
    prompt,
    task: body.task || "chat",
    attachments: body.files || body.attachments,
    userId: entitlement.userId,
    userEmail: entitlement.userId,
    plan: entitlement.plan,
  })

  if (entitlement.authenticated) {
    await appendFounderMessage({
      userId: entitlement.userId,
      source: "chat",
      userText: prompt,
      assistantText: outputText(result.output),
      provider: String(result.provider || ""),
      model: String(result.model || ""),
    }).catch((error) => {
      console.warn("[FOUNDER MESSAGE LOG] chat write skipped", error instanceof Error ? error.message : error)
    })
  }

  return Response.json({
    ok: result.success,
    mode: result.mode,
    provider: result.provider,
    model: result.model,
    output: result.output,
    thinkingSteps: result.thinkingSteps,
    safeMode: result.safeMode,
    fallbackUsed: result.fallbackUsed,
    plan: result.plan,
    error: result.error,
  })
}
