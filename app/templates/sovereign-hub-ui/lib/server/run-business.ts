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
  ensureAutonomousCompanyState,
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

const BUSINESS_RETRY_PROVIDERS = [
  "aihubmix",
  "gemini",
  "mistral",
  "nvidia-nim",
  "groq",
  "modelscope",
  "openrouter",
  "deepseek",
  "openai",
  "claude",
  "cerebras",
  "aws-bedrock",
  "azure",
]

function requestWithoutProviders(base: AIRequest, rejected: Set<string>): AIRequest {
  const configured = Array.isArray(base.metadata?.allowedProviders)
    ? (base.metadata?.allowedProviders as string[])
    : BUSINESS_RETRY_PROVIDERS
  const allowed = configured.filter((item) => !rejected.has(item))
  if (!allowed.length) return base
  return {
    ...base,
    provider: undefined,
    model: undefined,
    metadata: { ...base.metadata, allowedProviders: allowed },
  }
}

function normalizeAutonomousResult(modeId: Parameters<typeof ensureAutonomousCompanyState>[0], result: Awaited<ReturnType<typeof routeAI>>) {
  if (result.success && typeof result.output === "string") {
    result.output = ensureAutonomousCompanyState(modeId, result.output)
  }
  return result
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

  if (!result || (!result.success && result.error !== "DAILY_LIMIT_REACHED")) {
    const rejected = new Set<string>()
    if (result?.provider) rejected.add(result.provider)
    result = await routeAI(requestWithoutProviders(base, rejected))
  }

  result = normalizeAutonomousResult(mode.id, result)
  let quality: BusinessOutputQuality = result.success
    ? businessOutputQuality(mode.id, result.output)
    : { ok: false, reason: "empty" }

  const rejectedProviders = new Set<string>()
  if (result.provider) rejectedProviders.add(result.provider)

  // A provider may return HTTP 200 while still giving a greeting, tiny answer or
  // malformed handoff. Retry across alternate providers instead of asking the
  // same weak route twice. Two repair attempts keeps latency bounded while
  // making a single flaky model unable to kill the entire 8-agent company.
  for (let attempt = 1; result.success && !quality.ok && isAutonomousBusinessMode(mode.id) && attempt <= 2; attempt += 1) {
    console.warn("[BUSINESS_AGENT_REJECTED]", {
      mode: mode.id,
      reason: quality.reason,
      provider: result.provider,
      model: result.model,
      chars: typeof result.output === "string" ? result.output.length : 0,
      attempt,
    })

    const retryBase = requestWithoutProviders(base, rejectedProviders)
    result = await routeAI({
      ...retryBase,
      prompt: businessRetryPrompt(fullPrompt, quality.reason),
      metadata: {
        ...retryBase.metadata,
        businessQualityRetry: true,
        businessQualityAttempt: attempt,
        rejectedProviders: Array.from(rejectedProviders),
        rejectedReason: quality.reason,
      },
    })

    if (result.provider) rejectedProviders.add(result.provider)
    result = normalizeAutonomousResult(mode.id, result)
    quality = result.success
      ? businessOutputQuality(mode.id, result.output)
      : { ok: false, reason: "empty" }
  }

  const accepted = result.success && quality.ok
  const engine = publicEngineForProvider(result.provider, task)
  const fallbackUsed = !accepted || Boolean(result.fallbackUsed) || Boolean(pinned && result.provider !== pinned.provider)
  const qualityError = result.success && !quality.ok
    ? "Агент не смог сформировать полноценный результат даже после резервных маршрутов. Нажми «Повторить» — следующий запуск попробует доступные модели заново."
    : undefined

  if (!accepted) {
    console.warn("[BUSINESS_AGENT_FAILED]", {
      mode: mode.id,
      reason: quality.reason || result.error || "provider_error",
      provider: result.provider,
      model: result.model,
      rejectedProviders: Array.from(rejectedProviders),
    })
  }

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
