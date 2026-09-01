import {
  DEFAULT_MALIK_IMAGE_MODEL_ID,
  getMalikImageModel,
  type MalikImageModelId,
} from "../image-models"
import { imageProviderTimeoutMs } from "../config"
import type { ProviderQualityTuning } from "../image-quality-presets"
import type { ImageAspectRatio } from "../types"

function cloudflareAccountId(): string {
  return (
    process.env.CLOUDFLARE_IMAGE_ACCOUNT_ID?.trim() ||
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    process.env.CF_ACCOUNT_ID?.trim() ||
    ""
  )
}

function cloudflareApiToken(): string {
  return (
    process.env.CLOUDFLARE_IMAGE_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_API_TOKEN?.trim() ||
    process.env.CF_API_TOKEN?.trim() ||
    ""
  )
}

export function preparedCloudflareImageConfigured(): boolean {
  return Boolean(cloudflareAccountId() && cloudflareApiToken())
}

function imageSize(aspectRatio: ImageAspectRatio = "1:1") {
  if (aspectRatio === "16:9") return { width: 1344, height: 768 }
  if (aspectRatio === "9:16") return { width: 768, height: 1344 }
  if (aspectRatio === "4:5") return { width: 896, height: 1120 }
  if (aspectRatio === "4:3") return { width: 1152, height: 864 }
  return { width: 1024, height: 1024 }
}

function numericEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] || fallback)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function extractImage(payload: any): string {
  const result = payload?.result ?? payload
  const candidates = [
    result?.image,
    result?.url,
    result?.imageUrl,
    result?.resultUrl,
    result?.images?.[0],
    result?.images?.[0]?.url,
    payload?.image,
    payload?.url,
  ]

  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim())
  if (!value) return ""
  if (value.startsWith("http") || value.startsWith("data:")) return value
  return `data:image/jpeg;base64,${value}`
}

async function callCloudflare(model: string, init: RequestInit, signal?: AbortSignal) {
  const accountId = cloudflareAccountId()
  const token = cloudflareApiToken()
  if (!accountId || !token) {
    throw new Error("CLOUDFLARE_IMAGE_ACCOUNT_ID and CLOUDFLARE_IMAGE_API_TOKEN are not configured")
  }

  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
  }

  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${token}`)
  const timer = setTimeout(() => controller.abort(), imageProviderTimeoutMs())

  try {
    return await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
}

function jsonRequestBody(
  modelId: MalikImageModelId,
  prompt: string,
  negativePrompt: string,
  width: number,
  height: number,
  tuning?: ProviderQualityTuning,
) {
  if (modelId === "flux-schnell") {
    return {
      prompt,
      steps: tuning?.steps ?? Math.round(numericEnv("MALIK_IMAGE_SCHNELL_STEPS", 4, 1, 8)),
    }
  }

  if (modelId === "leonardo-phoenix") {
    return {
      prompt,
      width,
      height,
      guidance: tuning?.guidance ?? numericEnv("MALIK_IMAGE_PHOENIX_GUIDANCE", 8.5, 2, 10),
      num_steps: tuning?.steps ?? Math.round(numericEnv("MALIK_IMAGE_PHOENIX_STEPS", 30, 1, 50)),
      negative_prompt: negativePrompt,
    }
  }

  return {
    prompt,
    width,
    height,
    guidance: tuning?.guidance ?? numericEnv("MALIK_IMAGE_LUCID_GUIDANCE", 8.5, 0, 10),
    num_steps: tuning?.steps ?? Math.round(numericEnv("MALIK_IMAGE_LUCID_STEPS", 30, 1, 40)),
  }
}

export async function generatePreparedCloudflareImage({
  strictPrompt,
  negativePrompt,
  aspectRatio = "1:1",
  modelId = DEFAULT_MALIK_IMAGE_MODEL_ID,
  tuning,
  signal,
}: {
  strictPrompt: string
  negativePrompt: string
  aspectRatio?: ImageAspectRatio
  modelId?: MalikImageModelId
  tuning?: ProviderQualityTuning
  signal?: AbortSignal
}): Promise<{
  imageUrl: string
  modelId: MalikImageModelId
  providerModel: string
  steps?: number
  guidance?: number
}> {
  if (!preparedCloudflareImageConfigured()) {
    throw new Error("Cloudflare Workers AI image account is not configured")
  }

  const model = getMalikImageModel(modelId)
  const { width, height } = imageSize(aspectRatio)
  let response: Response

  if (model.requestKind === "multipart") {
    const form = new FormData()
    form.append("prompt", strictPrompt)
    form.append("width", String(width))
    form.append("height", String(height))

    if (modelId === "flux-klein-4b") {
      form.append("guidance", String(tuning?.guidance ?? numericEnv("MALIK_IMAGE_KLEIN_GUIDANCE", 7.5, 0, 10)))
    }
    if (modelId === "malik-image-1-premium") {
      form.append("steps", String(tuning?.steps ?? Math.round(numericEnv("MALIK_IMAGE_DEV_STEPS", 16, 1, 50))))
      form.append("guidance", String(tuning?.guidance ?? numericEnv("MALIK_IMAGE_DEV_GUIDANCE", 7, 0, 10)))
    }

    response = await callCloudflare(model.providerModel, { method: "POST", body: form }, signal)
  } else {
    response = await callCloudflare(
      model.providerModel,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(jsonRequestBody(modelId, strictPrompt, negativePrompt, width, height, tuning)),
      },
      signal,
    )
  }

  const contentType = response.headers.get("content-type") || ""
  if (contentType.startsWith("image/")) {
    if (!response.ok) throw new Error(`Cloudflare Workers AI returned ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    return {
      imageUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
      modelId,
      providerModel: model.providerModel,
      steps: tuning?.steps,
      guidance: tuning?.guidance,
    }
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const message = payload?.errors?.[0]?.message || payload?.error?.message || payload?.message
    throw new Error(message || `Cloudflare Workers AI returned ${response.status}`)
  }

  const imageUrl = extractImage(payload)
  if (!imageUrl) throw new Error(`${model.label} returned no image payload`)
  return {
    imageUrl,
    modelId,
    providerModel: model.providerModel,
    steps: tuning?.steps,
    guidance: tuning?.guidance,
  }
}
