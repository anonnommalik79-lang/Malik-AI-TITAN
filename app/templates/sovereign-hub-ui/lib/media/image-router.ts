import { imageFreeMode, imageGodOrder } from "./config"
import { generateWithPollinations } from "./providers/pollinations"
import { generateWithStability, stabilityConfigured } from "./providers/stability"
import { awsImageConfigured, falImageConfigured, generateAwsImage, generateFalImage } from "./providers/titan-image"
import { cloudflareImageConfigured, generateCloudflareImage } from "./providers/cloudflare-image"
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

export async function routeImageGeneration(
  input: ImageGenerateInput,
  options?: { signal?: AbortSignal },
): Promise<ImageGenerateResult> {
  // A deliberately selected Malik image model must run on that exact Cloudflare
  // model. We do not silently replace it with an unrelated provider/model.
  if (input.modelId) {
    if (!cloudflareImageConfigured()) {
      return {
        ok: false,
        provider: "cloudflare",
        modelId: input.modelId,
        imageUrl: "",
        remainingDailyImages: 0,
        error: "Cloudflare Workers AI не настроен: добавьте CLOUDFLARE_ACCOUNT_ID и CLOUDFLARE_API_TOKEN.",
      }
    }

    try {
      const result = await generateCloudflareImage({
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        mode: input.mode,
        modelId: input.modelId,
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
      return {
        ok: false,
        provider: "cloudflare",
        modelId: input.modelId,
        imageUrl: "",
        remainingDailyImages: 0,
        error: error instanceof Error ? error.message : "Cloudflare image generation failed",
      }
    }
  }

  const prompt = `${input.prompt}${modeStyle(input.mode)}`.trim()
  const errors: string[] = []
  const order = effectiveImageOrder()

  for (const provider of order) {
    if (!handlers[provider]?.()) {
      if (provider !== "pollinations") errors.push(`${provider}: not configured`)
      continue
    }

    try {
      if (provider === "cloudflare") {
        const result = await generateCloudflareImage({
          prompt: input.prompt,
          aspectRatio: input.aspectRatio,
          mode: input.mode,
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
        const result = await generateWithPollinations({ prompt, aspectRatio: input.aspectRatio, mode: input.mode, signal: options?.signal })
        return { ok: true, provider: "pollinations", imageUrl: result.imageUrl, remainingDailyImages: 0 }
      }
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : "failed"}`)
    }
  }

  return {
    ok: false,
    provider: "stability",
    imageUrl: "",
    remainingDailyImages: 0,
    error: errors.join(" → ") || "No image provider available",
  }
}
