import { imageFreeMode, imageGodOrder } from "./config"
import { generateWithPollinations } from "./providers/pollinations"
import { generateWithStability, stabilityConfigured } from "./providers/stability"
import { awsImageConfigured, falImageConfigured, generateAwsImage, generateFalImage } from "./providers/titan-image"
import type { ImageGenerateInput, ImageGenerateResult } from "./types"

function modeStyle(mode?: ImageGenerateInput["mode"]): string {
  if (!mode) return ""
  return ` [${mode}]`
}

const handlers: Record<string, () => boolean> = {
  stability: stabilityConfigured,
  fal: falImageConfigured,
  "aws-bedrock": awsImageConfigured,
  pollinations: () => true,
}

const FREE_IMAGE_PROVIDERS = new Set(["pollinations"])

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
  const prompt = `${input.prompt}${modeStyle(input.mode)}`.trim()
  const errors: string[] = []
  const order = effectiveImageOrder()

  for (const provider of order) {
    if (!handlers[provider]?.()) {
      if (provider !== "pollinations") errors.push(`${provider}: not configured`)
      continue
    }

    try {
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

  return { ok: false, provider: "stability", imageUrl: "", remainingDailyImages: 0, error: errors.join(" → ") || "No image provider available" }
}
