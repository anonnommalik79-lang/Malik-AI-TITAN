import { imageFreeMode, imageGodOrder } from "./config"
import { generateWithPollinations } from "./providers/pollinations"
import { generateWithStability, stabilityConfigured } from "./providers/stability"
import { awsImageConfigured, falImageConfigured, generateAwsImage, generateFalImage } from "./providers/titan-image"
import { compileImagePrompt } from "./providers/cloudflare-image"
import {
  generatePreparedCloudflareImage,
  preparedCloudflareImageConfigured,
} from "./providers/cloudflare-image-prepared"
import { DEFAULT_MALIK_IMAGE_MODEL_ID } from "./image-models"
import { buildUnifiedNegativePrompt, buildUnifiedStrictImagePrompt } from "./strict-image-rules"
import type { ImageGenerateInput, ImageGenerateResult } from "./types"

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

async function prepareStrictPrompt(input: ImageGenerateInput, signal?: AbortSignal) {
  let compiled = input.prompt
  let compilerError = ""

  try {
    compiled = await compileImagePrompt(input.prompt, input.mode, signal)
  } catch (error) {
    compilerError = error instanceof Error ? error.message : "prompt compiler failed"
  }

  return {
    strictPrompt: buildUnifiedStrictImagePrompt(compiled, input.prompt, input.mode),
    negativePrompt: buildUnifiedNegativePrompt(input.prompt),
    compilerError,
  }
}

export async function routeImageGeneration(
  input: ImageGenerateInput,
  options?: { signal?: AbortSignal },
): Promise<ImageGenerateResult> {
  const errors: string[] = []
  const requestedModelId = input.modelId

  // Compile exactly ONCE. Every image model and every fallback below receives
  // this same locked prompt. Providers are not allowed to append their own
  // semantic rewrite, translation, subject substitution or style instruction.
  const prepared = await prepareStrictPrompt(input, options?.signal)
  if (prepared.compilerError) errors.push(`prompt-compiler: ${prepared.compilerError}`)

  if (requestedModelId) {
    if (!preparedCloudflareImageConfigured()) {
      errors.push("cloudflare: selected image model is not configured")
    } else {
      try {
        const result = await generatePreparedCloudflareImage({
          strictPrompt: prepared.strictPrompt,
          negativePrompt: prepared.negativePrompt,
          aspectRatio: input.aspectRatio,
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

  for (const provider of order) {
    if (!handlers[provider]?.()) {
      if (provider !== "pollinations") errors.push(`${provider}: not configured`)
      continue
    }

    try {
      if (provider === "cloudflare") {
        const result = await generatePreparedCloudflareImage({
          strictPrompt: prepared.strictPrompt,
          negativePrompt: prepared.negativePrompt,
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
          prompt: prepared.strictPrompt,
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
          prompt: prepared.strictPrompt,
          aspectRatio: input.aspectRatio,
          signal: options?.signal,
        })
        return { ok: true, provider: "fal", imageUrl: result.imageUrl, remainingDailyImages: 0 }
      }

      if (provider === "aws-bedrock") {
        const result = await generateAwsImage({
          prompt: prepared.strictPrompt,
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
          prompt: prepared.strictPrompt,
          negativePrompt: prepared.negativePrompt,
          aspectRatio: input.aspectRatio,
          mode: input.mode,
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
