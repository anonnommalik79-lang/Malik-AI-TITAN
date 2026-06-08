import { applyFreeModeRequest } from "@/lib/ai/free-mode"
import { routeAI } from "@/lib/ai/router"
import { buildBusinessPrompt, getBusinessMode } from "@/lib/business/modes"
import type { BusinessRunContext } from "@/lib/business/types"
import { publicEngineForProvider, publicErrorMessage, sanitizePublicText } from "@/lib/brand-provider-map"
import { checkPromptLength } from "@/lib/limits/rate-limit"
import { resolveUserTier } from "@/lib/limits/user-plan"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export type BusinessRunBody = {
  mode?: string
  input?: string
  prompt?: string
  message?: string
  context?: BusinessRunContext
  language?: "ru" | "kz" | "en"
}

export async function runBusinessEngine(request: Request, body: BusinessRunBody) {
  const modeId = String(body?.mode || "").trim()
  const input = String(body?.input || body?.prompt || body?.message || "").trim()
  const mode = getBusinessMode(modeId)

  if (!mode) {
    return Response.json({ ok: false, error: "unknown_business_mode", code: "MODE_NOT_FOUND" }, { status: 400 })
  }
  if (!input) {
    return Response.json({ ok: false, error: "input_required", code: "INPUT_REQUIRED" }, { status: 400 })
  }

  const entitlement = await resolveRequestEntitlement(request)
  const tier = resolveUserTier(entitlement.userId, entitlement.plan)
  const promptCheck = checkPromptLength(input, tier)
  if (!promptCheck.ok) {
    return Response.json(
      { ok: false, error: promptCheck.error, code: promptCheck.code },
      { status: 400 },
    )
  }

  const context: BusinessRunContext = {
    ...(body?.context || {}),
    language: body?.language || body?.context?.language || "ru",
  }

  const fullPrompt = buildBusinessPrompt(mode, input, context)
  const result = await routeAI(
    applyFreeModeRequest({
      prompt: fullPrompt,
      task: "research",
      userId: entitlement.userId,
      userEmail: entitlement.userId,
      plan: entitlement.plan,
      signal: request.signal,
      metadata: { businessMode: mode.id, businessSection: mode.sectionId },
    }),
  )

  const engine = publicEngineForProvider(result.provider, "research")
  const fallbackUsed = !result.success || Boolean(result.fallbackUsed)

  return Response.json(
    {
      ok: result.success,
      mode: mode.id,
      modeTitle: mode.titleRu,
      sectionId: mode.sectionId,
      engine: engine.title,
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
