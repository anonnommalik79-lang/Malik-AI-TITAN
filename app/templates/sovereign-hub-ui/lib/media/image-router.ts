import { imageFreeMode, imageGodOrder } from "./config"
import { generateWithPollinations } from "./providers/pollinations"
import { generateWithStability, stabilityConfigured } from "./providers/stability"
import { awsImageConfigured, falImageConfigured, generateAwsImage, generateFalImage } from "./providers/titan-image"
import { cloudflareImageConfigured, compileImagePrompt, generateCloudflareImage } from "./providers/cloudflare-image"
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

  // First honor the exact image model selected by the user. All Cloudflare image
  // models pass through the same lossless multilingual prompt compiler.
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

  const order = requestedModelId
    ? uniqueProviders(["cloudflare", ...effectiveImageOrder(), "pollinations"])
    : effectiveImageOrder()

  let compiledFallbackPrompt: string | null = null
  const fallbackPrompt = async () => {
    if (compiledFallbackPrompt) return compiledFallbackPrompt
    try {
      compiledFallbackPrompt = await compileImagePrompt(input.prompt, input.mode, options?.signal)
    } catch {
      compiledFallbackPrompt = input.prompt
    }
    return compiledFallbackPrompt
  }

  for (const provider of order) {
    if (!handlers[provider]?.()) {
      if (provider !== "pollinations") errors.push(`${provider}: not configured`)
      continue
    }

    try {
      if (provider === "cloudflare") {
        // If a selected partner model is unavailable, retry with Malik AI's fast
        // default Cloudflare model while preserving the exact same prompt intent.
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

      const exactPrompt = `${await fallbackPrompt()}${modeStyle(input.mode)}`.trim()

      if (provider === "stability") {
        const result = await generateWithStability({ prompt: exactPrompt, aspectRatio: input.aspectRatio, mode: input.mode, signal: options?.signal })
        return { ok: true, provider: "stability", imageUrl: result.imageUrl, base64: result.base64, remainingDailyImages: 0 }
      }
      if (provider === "fal") {
        const result = await generateFalImage({ prompt: exactPrompt, aspectRatio: input.aspectRatio, signal: options?.signal })
        return { ok: true, provider: "fal", imageUrl: result.imageUrl, remainingDailyImages: 0 }
      }
      if (provider === "aws-bedrock") {
        const result = await generateAwsImage({ prompt: exactPrompt, mode: input.mode, signal: options?.signal })
        return { ok: true, provider: "aws-bedrock", imageUrl: result.imageUrl, base64: result.base64, remainingDailyImages: 0 }
      }
      if (provider === "pollinations") {
        // Pollinations is only the final real-image safety net. It receives the
        // already-compiled English fidelity prompt and is not allowed to rewrite it.
        const result = await generateWithPollinations({ prompt: exactPrompt, aspectRatio: input.aspectRatio, mode: input.mode, signal: options?.signal })
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
