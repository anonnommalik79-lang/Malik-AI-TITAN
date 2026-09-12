import {
  DEFAULT_MALIK_IMAGE_MODEL_ID,
  getMalikImageModel,
  type MalikImageModelId,
} from "../image-models"
import { imageProviderTimeoutMs } from "../config"
import type { ProviderQualityTuning } from "../image-quality-presets"
import type { ImageAspectRatio } from "../types"

type CloudflareImageAccountSlot = "primary" | "secondary"

type CloudflareImageAccount = {
  slot: CloudflareImageAccountSlot
  accountId: string
  token: string
}

const quotaCooldownUntil = new Map<CloudflareImageAccountSlot, number>()
const ACCOUNT_WIDE_QUOTA_ERROR =
  /daily free allocation|used up your daily free allocation|10[,. ]?000\s+neurons|workers paid plan|quota[^\n]*(?:exhaust|limit|used up)/i

function primaryCloudflareAccount(): CloudflareImageAccount | null {
  const accountId = (
    process.env.CLOUDFLARE_IMAGE_ACCOUNT_ID?.trim() ||
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    process.env.CF_ACCOUNT_ID?.trim() ||
    ""
  )
  const token = (
    process.env.CLOUDFLARE_IMAGE_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_API_TOKEN?.trim() ||
    process.env.CF_API_TOKEN?.trim() ||
    ""
  )

  return accountId && token ? { slot: "primary", accountId, token } : null
}

function secondaryCloudflareAccount(): CloudflareImageAccount | null {
  const accountId = (
    process.env.CLOUDFLARE_IMAGE_ACCOUNT_ID_2?.trim() ||
    process.env.CLOUDFLARE_IMAGE_SECONDARY_ACCOUNT_ID?.trim() ||
    process.env.CLOUDFLARE_ACCOUNT_ID_2?.trim() ||
    process.env.CF_ACCOUNT_ID_2?.trim() ||
    ""
  )
  const token = (
    process.env.CLOUDFLARE_IMAGE_API_TOKEN_2?.trim() ||
    process.env.CLOUDFLARE_IMAGE_SECONDARY_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_API_TOKEN_2?.trim() ||
    process.env.CF_API_TOKEN_2?.trim() ||
    ""
  )

  return accountId && token ? { slot: "secondary", accountId, token } : null
}

function cloudflareAccounts(): CloudflareImageAccount[] {
  const accounts = [primaryCloudflareAccount(), secondaryCloudflareAccount()]
    .filter((value): value is CloudflareImageAccount => Boolean(value))

  return accounts.filter((account, index, list) =>
    list.findIndex((candidate) => candidate.accountId === account.accountId && candidate.token === account.token) === index,
  )
}

export function preparedCloudflareImageConfigured(): boolean {
  return cloudflareAccounts().length > 0
}

function nextUtcQuotaResetMs() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 5)
}

function accountQuotaCoolingDown(slot: CloudflareImageAccountSlot) {
  const until = quotaCooldownUntil.get(slot) || 0
  if (!until) return false
  if (Date.now() >= until) {
    quotaCooldownUntil.delete(slot)
    return false
  }
  return true
}

function markAccountQuotaExhausted(slot: CloudflareImageAccountSlot) {
  quotaCooldownUntil.set(slot, nextUtcQuotaResetMs())
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

async function callCloudflareAccount(
  account: CloudflareImageAccount,
  model: string,
  init: RequestInit,
  signal?: AbortSignal,
) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
  }

  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${account.token}`)
  const timer = setTimeout(() => controller.abort(), imageProviderTimeoutMs())

  try {
    return await fetch(`https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${model}`, {
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

async function cloudflareFailure(response: Response): Promise<{ failed: boolean; message: string }> {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.startsWith("image/") && response.ok) return { failed: false, message: "" }

  try {
    const text = await response.clone().text()
    let payload: any = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }

    const message = payload?.errors?.[0]?.message || payload?.error?.message || payload?.message || text || ""
    const failed = !response.ok || payload?.success === false
    return { failed, message: String(message || "") }
  } catch {
    return { failed: !response.ok, message: "" }
  }
}

/**
 * Try the dedicated primary Workers AI account first. Any account-level failure
 * immediately continues the SAME model/request on the second account, so the
 * current user generation can finish instead of surfacing an error. Daily
 * neuron exhaustion is remembered until the next 00:00 UTC reset; after that
 * the primary account automatically becomes first again.
 */
async function callCloudflare(model: string, init: RequestInit, signal?: AbortSignal) {
  const accounts = cloudflareAccounts()
  if (!accounts.length) {
    throw new Error("Cloudflare Workers AI image accounts are not configured")
  }

  let lastResponse: Response | undefined
  let lastError: unknown

  for (const account of accounts) {
    if (accountQuotaCoolingDown(account.slot)) continue

    try {
      const response = await callCloudflareAccount(account, model, init, signal)
      const failure = await cloudflareFailure(response)
      if (!failure.failed) return response

      lastResponse = response
      if (ACCOUNT_WIDE_QUOTA_ERROR.test(failure.message)) {
        markAccountQuotaExhausted(account.slot)
      }
      // Continue immediately on the second Cloudflare account with the same
      // model and same prepared prompt. Do not return the first account error.
    } catch (error) {
      lastError = error
      // Network/auth/account failure on account #1 must not kill the request.
      // Account #2 gets the exact same generation attempt immediately.
    }
  }

  if (lastResponse) return lastResponse
  if (lastError) throw lastError
  throw new Error("All configured Cloudflare Workers AI image accounts are temporarily unavailable")
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
    throw new Error("Cloudflare Workers AI image accounts are not configured")
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
