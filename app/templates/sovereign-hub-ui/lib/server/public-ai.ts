import { applyFreeModeRequest } from "@/lib/ai/free-mode"
import { routeAI } from "@/lib/ai/router"
import type { AITaskType } from "@/lib/ai/types"
import { checkPromptLength } from "@/lib/limits/rate-limit"
import { resolveUserTier } from "@/lib/limits/user-plan"
import { publicEngineForProvider, publicErrorMessage, sanitizePublicText } from "@/lib/brand-provider-map"
import { addRuntimeHistory } from "@/lib/server/runtime-store"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export async function handlePublicTextAI(request: Request, task: AITaskType) {
  const body = await request.json().catch(() => ({}))
  const prompt = String(body?.prompt || body?.message || body?.question || "").trim()
  const entitlement = await resolveRequestEntitlement(request)
  const userId = entitlement.userId
  if (!prompt) return Response.json({ ok: false, error: "prompt_required" }, { status: 400 })

  const tier = resolveUserTier(userId, entitlement.plan)
  const promptCheck = checkPromptLength(prompt, tier)
  if (!promptCheck.ok) {
    return Response.json(
      { ok: false, error: promptCheck.error, code: promptCheck.code },
      { status: 400 },
    )
  }

  const result = await routeAI(
    applyFreeModeRequest({
      prompt,
      task,
      messages: Array.isArray(body?.messages) ? body.messages : undefined,
      userId,
      userEmail: userId,
      plan: entitlement.plan,
      signal: request.signal,
    }),
  )

  const engine = publicEngineForProvider(result.provider, task)
  const fallbackUsed = !result.success || Boolean(result.fallbackUsed)
  addRuntimeHistory(userId, { type: task, engine: engine.title, status: fallbackUsed ? "fallback" : "ready" })
  return Response.json(
    {
      ok: result.success,
      engine: engine.title,
      engineId: engine.id,
      provider: result.provider,
      model: result.model,
      status: fallbackUsed ? "fallback" : "ready",
      fallbackUsed,
      content: sanitizePublicText(result.output),
      publicError: result.success ? undefined : publicErrorMessage(result.error),
    },
    { status: result.error === "DAILY_LIMIT_REACHED" ? 429 : 200 },
  )
}
