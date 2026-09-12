import { imageFreeMode, imageGodOrder } from "./config"
import { generateWithPollinations } from "./providers/pollinations"
import { generateWithStability, stabilityConfigured } from "./providers/stability"
import { awsImageConfigured, falImageConfigured, generateAwsImage, generateFalImage } from "./providers/titan-image"
import {
  generatePreparedCloudflareImage,
  generateRawTertiaryCloudflareImage,
  preparedCloudflareImageConfigured,
  tertiaryCloudflareImageConfigured,
} from "./providers/cloudflare-image-prepared"
import { MALIK_IMAGE_MODELS, type MalikImageModelId } from "./image-models"
import { getMalikImageModelCapability } from "./image-model-capabilities"
import { chooseMalikImageModel } from "./image-auto-router"
import {
  resolveMalikImageQuality,
  tuneImageModelForQuality,
  type ProviderQualityTuning,
} from "./image-quality-presets"
import { enhanceImagePrompt, enhanceNegativePrompt } from "./image-prompt-enhancer"
import { buildVisualPrompt } from "./visual-prompt"
import type { ImageGenerateInput, ImageGenerateResult } from "./types"

const handlers: Record<string, () => boolean> = {
  cloudflare: preparedCloudflareImageConfigured,
  stability: stabilityConfigured,
  fal: falImageConfigured,
  "aws-bedrock": awsImageConfigured,
  pollinations: () => true,
}

const FREE_IMAGE_PROVIDERS = new Set(["cloudflare", "pollinations"])
const TRANSIENT_IMAGE_PROVIDER_ERROR =
  /\b(?:429|500|502|503|504|520|521|522|523|524)\b|fetch failed|network|socket|econnreset|eai_again|temporar(?:y|ily)|upstream/i

const STANDARD_FALLBACK_WARNING = {
  code: "QUALITY_DEGRADED_FALLBACK" as const,
  title: "Включена резервная стандартная модель",
  message: "Два мощных пула временно недоступны, поэтому качество может быть ниже обычного. Malik AI Pro предназначен для приоритетного доступа к мощному режиму.",
  ctaLabel: "Перейти на Pro",
  dismissLabel: "Продолжить",
  severity: "warning" as const,
}

function effectiveImageOrder(): string[] {
  const order = imageGodOrder()
  if (!imageFreeMode()) return order
  const free = order.filter((provider) => FREE_IMAGE_PROVIDERS.has(provider))
  return free.length ? free : ["pollinations"]
}

function uniqueProviders(values: string[]) {
  return values.filter((provider, index, list) => Boolean(provider) && list.indexOf(provider) === index)
}

function shouldRetryImageProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  if (!message || /timeout|timed out|abort|IMAGE_PROVIDER_ATTEMPT_TIMEOUT/i.test(message)) return false
  return TRANSIENT_IMAGE_PROVIDER_ERROR.test(message)
}

async function retryTransientImageProvider<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (attempt > 0 || signal?.aborted || !shouldRetryImageProviderError(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 450))
    }
  }
  throw lastError
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return undefined
  return Math.min(max, Math.max(min, number))
}

function timeoutFromEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] || fallback)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function cloudflareAttemptTimeoutMs(preferred: boolean) {
  return preferred
    ? timeoutFromEnv("IMAGE_PREFERRED_MODEL_TIMEOUT_MS", 50_000, 10_000, 90_000)
    : timeoutFromEnv("IMAGE_FALLBACK_MODEL_TIMEOUT_MS", 8_000, 2_000, 30_000)
}

async function withAttemptSignal<T>(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parentSignal?.reason)
  if (parentSignal) {
    if (parentSignal.aborted) abortFromParent()
    else parentSignal.addEventListener("abort", abortFromParent, { once: true })
  }
  const timer = setTimeout(() => controller.abort(new Error("IMAGE_PROVIDER_ATTEMPT_TIMEOUT")), timeoutMs)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener("abort", abortFromParent)
  }
}

function tunedForModel(modelId: MalikImageModelId, input: ImageGenerateInput): ProviderQualityTuning {
  const quality = resolveMalikImageQuality(input.quality)
  const capability = getMalikImageModelCapability(modelId)
  const base = tuneImageModelForQuality(modelId, quality)
  const steps = capability.maxSteps > 0
    ? clampNumber(input.steps, capability.minSteps, capability.maxSteps) ?? base.steps
    : undefined
  const guidance = capability.maxGuidance > 0
    ? clampNumber(input.guidance, 0, capability.maxGuidance) ?? base.guidance
    : undefined

  return {
    ...base,
    steps,
    guidance,
    detailBoost: typeof input.detailBoost === "boolean" ? input.detailBoost : base.detailBoost,
    artifactCleanup: typeof input.artifactCleanup === "boolean" ? input.artifactCleanup : base.artifactCleanup,
    preserveFaces: typeof input.preserveFaces === "boolean" ? input.preserveFaces : base.preserveFaces,
  }
}

export async function routeImageGeneration(
  input: ImageGenerateInput,
  options?: { signal?: AbortSignal },
): Promise<ImageGenerateResult> {
  const errors: string[] = []
  const quality = resolveMalikImageQuality(input.quality)
  const decision = chooseMalikImageModel({
    requestedModelId: input.modelId,
    plan: input.plan,
    quality,
    mode: input.mode,
  })
  const preferredModelId = decision.modelId
  const preferredTuning = tunedForModel(preferredModelId, { ...input, quality })

  const visual = await buildVisualPrompt(input.prompt, input.mode, input.understood)
  if (!visual.prompt) {
    return {
      ok: false,
      provider: "pollinations",
      imageUrl: "",
      remainingDailyImages: 0,
      quality,
      error: "EMPTY_VISUAL_REQUEST",
    }
  }

  const prompt = enhanceImagePrompt(visual.prompt, {
    mode: input.mode,
    quality,
    detailBoost: preferredTuning.detailBoost,
  })
  const negativePrompt = enhanceNegativePrompt(visual.negativePrompt, quality)

  // Accounts #1 and #2 are the quality pool. They keep Malik's full prompt
  // compiler and automatic model routing. Account #3 is deliberately excluded
  // here so it keeps its capacity for the standard reserve path below.
  if (preparedCloudflareImageConfigured()) {
    const automaticModels = [
      preferredModelId,
      ...MALIK_IMAGE_MODELS.filter((model) => model.tier === "free").map((model) => model.id),
    ].filter((modelId, index, list): modelId is MalikImageModelId => list.indexOf(modelId) === index)

    for (const automaticModelId of automaticModels) {
      const preferred = automaticModelId === preferredModelId
      try {
        const tuning = tunedForModel(automaticModelId, { ...input, quality })
        const result = await withAttemptSignal(
          options?.signal,
          cloudflareAttemptTimeoutMs(preferred),
          (signal) => retryTransientImageProvider(
            () => generatePreparedCloudflareImage({
              strictPrompt: prompt,
              negativePrompt,
              aspectRatio: input.aspectRatio,
              modelId: automaticModelId,
              tuning,
              signal,
            }),
            signal,
          ),
        )
        return {
          ok: true,
          provider: "cloudflare",
          imageUrl: result.imageUrl,
          modelId: result.modelId,
          providerModel: result.providerModel,
          understood: visual.understood,
          enhancedPrompt: prompt,
          negativePrompt,
          quality,
          steps: result.steps ?? tuning.steps,
          guidance: result.guidance ?? tuning.guidance,
          routeReason: preferred ? decision.reason : `${decision.reason}; cloudflare quality fallback`,
          generationTier: "quality",
          generationSource: `cloudflare-${result.accountSlot}`,
          remainingDailyImages: 0,
        }
      } catch (error) {
        errors.push(`cloudflare-quality/${automaticModelId}: ${error instanceof Error ? error.message : "failed"}`)
      }
    }
  } else {
    errors.push("cloudflare-quality: not configured")
  }

  // Account #3 is a cheap continuity pool. It receives the normalized user
  // request directly, always renders with FLUX.2 Klein 4B, and then still goes
  // through Malik's local delivery/upscale stage in generate-photo-route.
  if (tertiaryCloudflareImageConfigured()) {
    try {
      const result = await withAttemptSignal(
        options?.signal,
        timeoutFromEnv("IMAGE_TERTIARY_MODEL_TIMEOUT_MS", 45_000, 10_000, 90_000),
        (signal) => retryTransientImageProvider(
          () => generateRawTertiaryCloudflareImage({
            prompt: input.prompt,
            aspectRatio: input.aspectRatio,
            signal,
          }),
          signal,
        ),
      )
      const warningText = `⚠ ${STANDARD_FALLBACK_WARNING.title}. ${STANDARD_FALLBACK_WARNING.message}`
      return {
        ok: true,
        provider: "cloudflare",
        imageUrl: result.imageUrl,
        modelId: result.modelId,
        providerModel: result.providerModel,
        understood: visual.understood ? `${visual.understood} · ${warningText}` : warningText,
        enhancedPrompt: input.prompt,
        quality,
        guidance: result.guidance,
        routeReason: `${decision.reason}; tertiary raw Klein reserve`,
        generationTier: "standard-fallback",
        generationSource: "cloudflare-tertiary-raw-klein",
        fallbackWarning: STANDARD_FALLBACK_WARNING,
        remainingDailyImages: 0,
      }
    } catch (error) {
      errors.push(`cloudflare-tertiary/flux-klein-4b: ${error instanceof Error ? error.message : "failed"}`)
    }
  } else {
    errors.push("cloudflare-tertiary: not configured")
  }

  const order = uniqueProviders([...effectiveImageOrder(), "pollinations"]).filter((provider) => provider !== "cloudflare")

  for (const provider of order) {
    if (!handlers[provider]?.()) {
      if (provider !== "pollinations") errors.push(`${provider}: not configured`)
      continue
    }

    try {
      if (provider === "stability") {
        const result = await retryTransientImageProvider(() => generateWithStability({
          prompt,
          aspectRatio: input.aspectRatio,
          mode: input.mode,
          signal: options?.signal,
        }), options?.signal)
        return {
          ok: true,
          provider: "stability",
          imageUrl: result.imageUrl,
          base64: result.base64,
          understood: visual.understood,
          enhancedPrompt: prompt,
          negativePrompt,
          quality,
          modelId: preferredModelId,
          steps: preferredTuning.steps,
          guidance: preferredTuning.guidance,
          routeReason: `${decision.reason}; provider fallback stability`,
          remainingDailyImages: 0,
        }
      }

      if (provider === "fal") {
        const result = await retryTransientImageProvider(() => generateFalImage({
          prompt,
          aspectRatio: input.aspectRatio,
          signal: options?.signal,
        }), options?.signal)
        return {
          ok: true,
          provider: "fal",
          imageUrl: result.imageUrl,
          understood: visual.understood,
          enhancedPrompt: prompt,
          negativePrompt,
          quality,
          modelId: preferredModelId,
          steps: preferredTuning.steps,
          guidance: preferredTuning.guidance,
          routeReason: `${decision.reason}; provider fallback fal`,
          remainingDailyImages: 0,
        }
      }

      if (provider === "aws-bedrock") {
        const result = await retryTransientImageProvider(() => generateAwsImage({
          prompt,
          mode: input.mode,
          signal: options?.signal,
        }), options?.signal)
        return {
          ok: true,
          provider: "aws-bedrock",
          imageUrl: result.imageUrl,
          base64: result.base64,
          understood: visual.understood,
          enhancedPrompt: prompt,
          negativePrompt,
          quality,
          modelId: preferredModelId,
          steps: preferredTuning.steps,
          guidance: preferredTuning.guidance,
          routeReason: `${decision.reason}; provider fallback aws-bedrock`,
          remainingDailyImages: 0,
        }
      }

      if (provider === "pollinations") {
        const result = await retryTransientImageProvider(() => generateWithPollinations({
          prompt,
          negativePrompt,
          aspectRatio: input.aspectRatio,
          signal: options?.signal,
        }), options?.signal)
        return {
          ok: true,
          provider: "pollinations",
          imageUrl: result.imageUrl,
          understood: visual.understood,
          enhancedPrompt: prompt,
          negativePrompt,
          quality,
          modelId: preferredModelId,
          steps: preferredTuning.steps,
          guidance: preferredTuning.guidance,
          routeReason: `${decision.reason}; provider fallback pollinations`,
          remainingDailyImages: 0,
        }
      }
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : "failed"}`)
    }
  }

  return {
    ok: false,
    provider: "pollinations",
    imageUrl: "",
    remainingDailyImages: 0,
    quality,
    enhancedPrompt: prompt,
    negativePrompt,
    modelId: preferredModelId,
    routeReason: decision.reason,
    error: errors.join(" → ") || "No image provider available",
  }
}
