import { imageFreeMode, imageGodOrder } from "./config"
import { generateWithPollinations } from "./providers/pollinations"
import { generateWithStability, stabilityConfigured } from "./providers/stability"
import { awsImageConfigured, falImageConfigured, generateAwsImage, generateFalImage } from "./providers/titan-image"
import {
  generatePreparedCloudflareImage,
  preparedCloudflareImageConfigured,
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

/**
 * One prompt is prepared once, then handed unchanged to whichever provider is
 * available. Malik's quality layer changes fidelity terms and provider knobs,
 * never the subject, count, colour, action or location the user asked for.
 */

const handlers: Record<string, () => boolean> = {
  cloudflare: preparedCloudflareImageConfigured,
  stability: stabilityConfigured,
  fal: falImageConfigured,
  "aws-bedrock": awsImageConfigured,
  pollinations: () => true,
}

const FREE_IMAGE_PROVIDERS = new Set(["cloudflare", "pollinations"])

function effectiveImageOrder(): string[] {
  const order = imageGodOrder()
  if (!imageFreeMode()) return order
  const free = order.filter((provider) => FREE_IMAGE_PROVIDERS.has(provider))
  return free.length ? free : ["pollinations"]
}

function uniqueProviders(values: string[]) {
  return values.filter((provider, index, list) => Boolean(provider) && list.indexOf(provider) === index)
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return undefined
  return Math.min(max, Math.max(min, number))
}

function tunedForModel(
  modelId: MalikImageModelId,
  input: ImageGenerateInput,
): ProviderQualityTuning {
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

  if (preparedCloudflareImageConfigured()) {
    // Start with the model chosen for this exact quality/mode, then fail over
    // through every free Cloudflare model. This preserves availability without
    // downgrading the entire product to one hard-coded engine.
    const automaticModels = [
      preferredModelId,
      ...MALIK_IMAGE_MODELS.filter((model) => model.tier === "free").map((model) => model.id),
    ].filter((modelId, index, list): modelId is MalikImageModelId => list.indexOf(modelId) === index)

    for (const automaticModelId of automaticModels) {
      try {
        const tuning = tunedForModel(automaticModelId, { ...input, quality })
        const result = await generatePreparedCloudflareImage({
          strictPrompt: prompt,
          negativePrompt,
          aspectRatio: input.aspectRatio,
          modelId: automaticModelId,
          tuning,
          signal: options?.signal,
        })
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
          routeReason: automaticModelId === preferredModelId ? decision.reason : `${decision.reason}; cloudflare fallback`,
          remainingDailyImages: 0,
        }
      } catch (error) {
        errors.push(`cloudflare/${automaticModelId}: ${error instanceof Error ? error.message : "failed"}`)
      }
    }
  } else {
    errors.push("cloudflare: not configured")
  }

  const order = uniqueProviders([...effectiveImageOrder(), "pollinations"]).filter((provider) => provider !== "cloudflare")

  for (const provider of order) {
    if (!handlers[provider]?.()) {
      if (provider !== "pollinations") errors.push(`${provider}: not configured`)
      continue
    }

    try {
      if (provider === "stability") {
        const result = await generateWithStability({
          prompt,
          aspectRatio: input.aspectRatio,
          mode: input.mode,
          signal: options?.signal,
        })
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
        const result = await generateFalImage({
          prompt,
          aspectRatio: input.aspectRatio,
          signal: options?.signal,
        })
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
        const result = await generateAwsImage({
          prompt,
          mode: input.mode,
          signal: options?.signal,
        })
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
        const result = await generateWithPollinations({
          prompt,
          negativePrompt,
          aspectRatio: input.aspectRatio,
          signal: options?.signal,
        })
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
