import { imageFreeMode, imageGodOrder } from "./config"
import { generateWithPollinations } from "./providers/pollinations"
import { generateWithStability, stabilityConfigured } from "./providers/stability"
import { awsImageConfigured, falImageConfigured, generateAwsImage, generateFalImage } from "./providers/titan-image"
import { cloudflareImageConfigured, generateCloudflareImage } from "./providers/cloudflare-image"
import { DEFAULT_MALIK_IMAGE_MODEL_ID } from "./image-models"
import type { ImageGenerateInput, ImageGenerateResult } from "./types"

function modeStyle(mode?: ImageGenerateInput["mode"]): string {
  if (!mode) return ""
  return ` [${mode}]`
}

const handlers: Record<string, () => boolean> = {
  cloudflare: cloudflareImageConfigured,
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

  // First honor the exact photo model chosen by the user. A transient provider
  // failure must not end the whole request, though: after the exact attempt we
  // continue through real image fallbacks instead of returning a dead card.
  if (requestedModelId) {
    if (!cloudflareImageConfigured()) {
      errors.push("cloudflare: selected image model is not configured")
    } else {
      try {
        const result = await generateCloudflareImage({
          prompt: input.prompt,
          aspectRatio: input.aspectRatio,
          mode: input.mode,
          modelId: requestedModelId,
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
        errors.push(`cloudflare/${requestedModelId}: ${error instanceof Error ? error.message : "failed"}`)
      }
    }
  }

  const prompt = `${input.prompt}${modeStyle(input.mode)}`.trim()
  const order = requestedModelId
    ? uniqueProviders(["cloudflare", ...effectiveImageOrder(), "pollinations"])
    : effectiveImageOrder()

  for (const provider of order) {
    if (!handlers[provider]?.()) {
      if (provider !== "pollinations") errors.push(`${provider}: not configured`)
      continue
    }

    try {
      if (provider === "cloudflare") {
        // If the selected model failed, retry through Malik AI's fast default
        // Cloudflare image model. This is still a real generation, not a demo.
        const result = await generateCloudflareImage({
          prompt: input.prompt,
          aspectRatio: input.aspectRatio,
          mode: input.mode,
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
        const result = await generateWithStability({ prompt, aspectRatio: input.aspectRatio, mode: input.mode, signal: options?.signal })
        return { ok: true, provider: "stability", imageUrl: result.imageUrl, base64: result.base64, remainingDailyImages: 0 }
      }
      if (provider === "fal") {
        const result = await generateFalImage({ prompt, aspectRatio: input.aspectRatio, signal: options?.signal })
        return { ok: true, provider: "fal", imageUrl: result.imageUrl, remainingDailyImages: 0 }
      }
      if (provider === "aws-bedrock") {
        const result = await generateAwsImage({ prompt, mode: input.mode, signal: options?.signal })
        return { ok: true, provider: "aws-bedrock", imageUrl: result.imageUrl, base64: result.base64, remainingDailyImages: 0 }
      }
      if (provider === "pollinations") {
        // Final real-image safety net. This prevents a mobile network/provider
        // hiccup from degrading to raw "Load failed" with no generated media.
        const result = await generateWithPollinations({ prompt, aspectRatio: input.aspectRatio, mode: input.mode, signal: options?.signal })
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
