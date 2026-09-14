import { applyFreeModeRequest } from "@/lib/ai/free-mode"
import { canUseMalikModel, getMalikModel, isMalikModelId } from "@/lib/ai/malik-models"
import { routeAI } from "@/lib/ai/router"
import type { AIRequest } from "@/lib/ai/types"
import { buildBusinessPrompt, getBusinessMode } from "@/lib/business/modes"
import {
  augmentBusinessInput,
  businessOutputQuality,
  businessOutputTokenBudget,
  businessRetryPrompt,
  businessTaskForMode,
  isAutonomousBusinessMode,
} from "@/lib/business/orchestration"
import type { BusinessOutputQuality } from "@/lib/business/orchestration"
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

function requestWithoutProvider(base: AIRequest, provider?: string): AIRequest {
  if (!provider || !Array.isArray(base.metadata?.allowedProviders)) return base
  const allowed = (base.metadata?.allowedProviders as string[]).filter((item) => item !== provider)
  if (!allowed.length) return base
  return {
    ...base,
    metadata: { ...base.metadata, allowedProviders: allowed },
  }
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

  // Autonomous Company is one continuous run, not eight unrelated chat calls.
  // The protocol makes each stage preserve decisions and emit a compact company
  // state handoff that survives the client's bounded context window.
  const orchestratedInput = augmentBusinessInput(mode.id, input)
  const fullPrompt = buildBusinessPrompt(mode, orchestratedInput, context)
  const task = businessTaskForMode(mode.id)
  const maxTokens = businessOutputTokenBudget(mode.id, entitlement.plan === "owner")

  const base: AIRequest = applyFreeModeRequest({
    prompt: fullPrompt,
    task,
    maxTokens,
    userId: entitlement.userId,
    userEmail: entitlement.userId,
    plan: entitlement.plan,
    signal: request.signal,
    metadata: {
      businessMode: mode.id,
      businessSection: mode.sectionId,
      autonomousCompany: isAutonomousBusinessMode(mode.id),
      businessTask: task,
    },
  })

  /*
   * A chosen model is a preference, not a promise. It is tried against its own
   * provider first. If it is unavailable, rate-limited or returns a generic
   * placeholder, the automatic route gets a chance to complete the stage.
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

  // A user's own daily limit is final. Provider-specific failures and rate
  // limits are not: another provider may still be healthy, so keep routing.
  if (!result || (!result.success && result.error !== "DAILY_LIMIT_REACHED")) {
    const fallbackBase = result && pinned
      ? requestWithoutProvider(base, result.provider)
      : base
    result = await routeAI(fallbackBase)
  }

  // A transport-level success is not enough for an autonomous agent. Generic
  // greetings such as "Как я могу помочь?" must never receive a green check.
  let quality: BusinessOutputQuality = result.success
    ? businessOutputQuality(mode.id, result.output)
    : { ok: false, reason: "empty" }

  if (result.success && !quality.ok && isAutonomousBusinessMode(mode.id)) {
    const retryBase = requestWithoutProvider(base, result.provider)
    result = await routeAI({
      ...retryBase,
      prompt: businessRetryPrompt(fullPrompt, quality.reason),
      metadata: {
        ...retryBase.metadata,
        businessQualityRetry: true,
        rejectedProvider: result.provider,
        rejectedReason: quality.reason,
      },
    })
    quality = result.success
      ? businessOutputQuality(mode.id, result.output)
      : { ok: false, reason: "empty" }
  }

  const accepted = result.success && quality.ok
  const engine = publicEngineForProvider(result.provider, task)
  const fallbackUsed = !accepted || Boolean(result.fallbackUsed) || Boolean(pinned && result.provider !== pinned.provider)
  const qualityError = result.success && !quality.ok
    ? "Агент вернул слишком общий или неполный ответ. Malik AI остановил этап, чтобы не выдавать заглушку за готовую работу."
    : undefined

  return Response.json(
    {
      ok: accepted,
      mode: mode.id,
      modeTitle: mode.titleRu,
      sectionId: mode.sectionId,
      engine: engine.title,
      provider: result.provider,
      model: result.model,
      status: accepted ? (fallbackUsed ? "fallback" : "ready") : "failed",
      fallbackUsed,
      content: accepted ? sanitizePublicText(result.output) : "",
      publicError: accepted ? undefined : (qualityError || publicErrorMessage(result.error)),
      error: accepted ? undefined : (qualityError ? "BUSINESS_OUTPUT_REJECTED" : result.error),
      quality: accepted ? "accepted" : (quality.reason || "provider_error"),
      task,
    },
    { status: result.error === "DAILY_LIMIT_REACHED" ? 429 : 200 },
  )
}
