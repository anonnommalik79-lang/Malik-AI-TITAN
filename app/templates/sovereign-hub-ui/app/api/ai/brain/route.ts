import { runMalikBrain } from "@/lib/ai/brain"
import type { AIFileAttachment, AITaskType } from "@/lib/ai/types"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { withFounderRequestAudit } from "@/lib/server/founder-request-audit"

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

export const POST = withFounderRequestAudit(handlePOST, "chat")

async function handlePOST(request: Request) {
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
