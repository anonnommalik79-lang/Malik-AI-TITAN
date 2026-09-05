import { applyFreeModeRequest } from "@/lib/ai/free-mode"
import { canUseMalikModel, getMalikModel, isMalikModelId } from "@/lib/ai/malik-models"
import { routeAI } from "@/lib/ai/router"
import type { AIRequest } from "@/lib/ai/types"
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
  /** Malik model the caller asked for. Ignored when unknown, or not on the caller's plan. */
  modelId?: string
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
  const base: AIRequest = applyFreeModeRequest({
    prompt: fullPrompt,
    task: "research",
    userId: entitlement.userId,
    userEmail: entitlement.userId,
    plan: entitlement.plan,
    signal: request.signal,
    metadata: { businessMode: mode.id, businessSection: mode.sectionId },
  })

  /*
   * A chosen model is a preference, not a promise.
   *
   * routeAI applies `model` to whichever provider ends up running, so setting
   * it globally would hand a Groq model id to Gemini the moment Groq fails and
   * poison the fallback chain that has always made this endpoint reliable.
   * So the pinned model is tried alone, against its own provider, and if that
   * attempt fails the original automatic call runs exactly as before. The
   * response reports the provider and model that actually answered, so the UI
   * can show what ran rather than what was asked for.
   */
  const requested = body?.modelId
  const pinned = isMalikModelId(requested) && canUseMalikModel(requested, entitlement.plan)
    ? getMalikModel(requested)
    : null
  const freeModeAllows = Array.isArray(base.metadata?.allowedProviders)
    ? (base.metadata?.allowedProviders as string[]).includes(pinned?.provider || "")
    : true

  let result = pinned && freeModeAllows
    ? await routeAI({
      ...base,
      provider: pinned.provider,
      model: pinned.providerModel,
      metadata: { ...base.metadata, allowedProviders: [pinned.provider], pinnedModelId: pinned.id },
    })
    : null

  // A rate limit is the same answer from every provider; retrying only burns time.
  if (!result || (!result.success && result.error !== "DAILY_LIMIT_REACHED" && result.error !== "RATE_LIMIT")) {
    result = await routeAI(base)
  }

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
