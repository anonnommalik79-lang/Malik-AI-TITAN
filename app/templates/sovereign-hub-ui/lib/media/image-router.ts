import { imageFreeMode, imageGodOrder } from "./config"
import { generateWithPollinations } from "./providers/pollinations"
import { generateWithStability, stabilityConfigured } from "./providers/stability"
import { awsImageConfigured, falImageConfigured, generateAwsImage, generateFalImage } from "./providers/titan-image"
import {
  generatePreparedCloudflareImage,
  preparedCloudflareImageConfigured,
} from "./providers/cloudflare-image-prepared"
import { DEFAULT_MALIK_IMAGE_MODEL_ID, MALIK_IMAGE_MODELS, type MalikImageModelId } from "./image-models"
import { buildVisualPrompt } from "./visual-prompt"
import type { ImageGenerateInput, ImageGenerateResult } from "./types"

/**
 * One prompt is prepared once, then handed unchanged to whichever provider is
 * available. Providers no longer reinterpret it or append rules of their own:
 * a diffusion model draws the words it is given, so the only words it is given
 * are the ones describing the picture.
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

export async function routeImageGeneration(
  input: ImageGenerateInput,
  options?: { signal?: AbortSignal },
): Promise<ImageGenerateResult> {
  const errors: string[] = []
  const requestedModelId = input.modelId

  const visual = await buildVisualPrompt(input.prompt, input.mode)
  if (!visual.prompt) {
    return {
      ok: false,
      provider: "pollinations",
      imageUrl: "",
      remainingDailyImages: 0,
      error: "EMPTY_VISUAL_REQUEST",
    }
  }

  const prompt = visual.prompt
  const negativePrompt = visual.negativePrompt

  if (requestedModelId) {
    if (!preparedCloudflareImageConfigured()) {
      errors.push("cloudflare: not configured")
    } else {
      // Image models are automatic. Try the preferred one, then the other free
      // Cloudflare engines, before leaving the provider entirely.
      const automaticModels = [
        requestedModelId,
        ...MALIK_IMAGE_MODELS.filter((model) => model.tier === "free").map((model) => model.id),
      ].filter((modelId, index, list): modelId is MalikImageModelId => list.indexOf(modelId) === index)

      for (const automaticModelId of automaticModels) {
        try {
          const result = await generatePreparedCloudflareImage({
            strictPrompt: prompt,
            negativePrompt,
            aspectRatio: input.aspectRatio,
            modelId: automaticModelId,
            signal: options?.signal,
          })
          return {
            ok: true,
            provider: "cloudflare",
            imageUrl: result.imageUrl,
            modelId: result.modelId,
            providerModel: result.providerModel,
            remainingDailyImages: 0,
          }
        } catch (error) {
          errors.push(`cloudflare/${automaticModelId}: ${error instanceof Error ? error.message : "failed"}`)
        }
      }
    }
  }

  const order = requestedModelId
    ? uniqueProviders([...effectiveImageOrder(), "pollinations"]).filter((provider) => provider !== "cloudflare")
    : effectiveImageOrder()

  for (const provider of order) {
    if (!handlers[provider]?.()) {
      if (provider !== "pollinations") errors.push(`${provider}: not configured`)
      continue
    }

    try {
      if (provider === "cloudflare") {
        const result = await generatePreparedCloudflareImage({
          strictPrompt: prompt,
          negativePrompt,
          aspectRatio: input.aspectRatio,
          modelId: DEFAULT_MALIK_IMAGE_MODEL_ID,
          signal: options?.signal,
        })
        return {
          ok: true,
          provider: "cloudflare",
          imageUrl: result.imageUrl,
          modelId: result.modelId,
          providerModel: result.providerModel,
          remainingDailyImages: 0,
        }
      }

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
          remainingDailyImages: 0,
        }
      }

      if (provider === "fal") {
        const result = await generateFalImage({
          prompt,
          aspectRatio: input.aspectRatio,
          signal: options?.signal,
        })
        return { ok: true, provider: "fal", imageUrl: result.imageUrl, remainingDailyImages: 0 }
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
        return { ok: true, provider: "pollinations", imageUrl: result.imageUrl, remainingDailyImages: 0 }
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
    error: errors.join(" → ") || "No image provider available",
  }
}
