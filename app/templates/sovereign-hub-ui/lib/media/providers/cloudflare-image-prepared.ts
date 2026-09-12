import {
  DEFAULT_MALIK_IMAGE_MODEL_ID,
  getMalikImageModel,
  type MalikImageModelId,
} from "../image-models"
import { imageProviderTimeoutMs } from "../config"
import type { ProviderQualityTuning } from "../image-quality-presets"
import type { ImageAspectRatio } from "../types"

type Slot = "primary" | "secondary" | "tertiary"
type Account = { slot: Slot; accountId: string; token: string }

const cooldownUntil = new Map<Slot, number>()
const QUOTA_ERROR = /daily free allocation|used up your daily free allocation|10[,. ]?000\s+neurons|workers paid plan|quota[^\n]*(?:exhaust|limit|used up)/i

function account(slot: Slot): Account | null {
  if (slot === "primary") {
    const accountId = process.env.CLOUDFLARE_IMAGE_ACCOUNT_ID?.trim() || ""
    const token = process.env.CLOUDFLARE_IMAGE_API_TOKEN?.trim() || ""
    return accountId && token ? { slot, accountId, token } : null
  }
  if (slot === "secondary") {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || process.env.CF_ACCOUNT_ID?.trim() || ""
    const token = process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CF_API_TOKEN?.trim() || ""
    return accountId && token ? { slot, accountId, token } : null
  }
  const accountId = process.env.CLOUDFLARE_IMAGE_ACCOUNT_ID_3?.trim() || ""
  const token = process.env.CLOUDFLARE_IMAGE_API_TOKEN_3?.trim() || ""
  return accountId && token ? { slot, accountId, token } : null
}

function qualityAccounts() {
  return [account("primary"), account("secondary")].filter((value): value is Account => Boolean(value))
}

export function preparedCloudflareImageConfigured() {
  return qualityAccounts().length > 0
}

export function tertiaryCloudflareImageConfigured() {
  return Boolean(account("tertiary"))
}

function nextReset() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 5)
}

function cooling(slot: Slot) {
  const until = cooldownUntil.get(slot) || 0
  if (!until) return false
  if (Date.now() >= until) {
    cooldownUntil.delete(slot)
    return false
  }
  return true
}

function size(aspect: ImageAspectRatio = "1:1") {
  if (aspect === "16:9") return { width: 1344, height: 768 }
  if (aspect === "9:16") return { width: 768, height: 1344 }
  if (aspect === "4:5") return { width: 896, height: 1120 }
  if (aspect === "4:3") return { width: 1152, height: 864 }
  return { width: 1024, height: 1024 }
}

function envNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] || fallback)
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function parentAttemptTimedOut(signal?: AbortSignal) {
  const reason = signal?.reason instanceof Error ? signal.reason.message : String(signal?.reason || "")
  return Boolean(signal?.aborted && /IMAGE_PROVIDER_ATTEMPT_TIMEOUT/i.test(reason))
}

async function runAccount(current: Account, model: string, init: RequestInit, signal?: AbortSignal) {
  const controller = new AbortController()
  const followParent = Boolean(signal && !parentAttemptTimedOut(signal))
  const abort = () => controller.abort(signal?.reason)
  if (followParent && signal) {
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
  }
  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${current.token}`)
  const timeout = Math.min(imageProviderTimeoutMs(), 60_000)
  const timer = setTimeout(() => controller.abort(new Error("CLOUDFLARE_ACCOUNT_TIMEOUT")), timeout)
  try {
    return await fetch(`https://api.cloudflare.com/client/v4/accounts/${current.accountId}/ai/run/${model}`, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    })
  } finally {
    clearTimeout(timer)
    if (followParent && signal) signal.removeEventListener("abort", abort)
  }
}

async function failure(response: Response) {
  if (response.ok && (response.headers.get("content-type") || "").startsWith("image/")) return { failed: false, message: "" }
  const text = await response.clone().text().catch(() => "")
  let payload: any = null
  try { payload = text ? JSON.parse(text) : null } catch {}
  const message = payload?.errors?.[0]?.message || payload?.error?.message || payload?.message || text || ""
  return { failed: !response.ok || payload?.success === false, message: String(message) }
}

async function runQuality(model: string, init: RequestInit, signal?: AbortSignal) {
  let lastResponse: Response | undefined
  let lastError: unknown
  for (const current of qualityAccounts()) {
    if (cooling(current.slot)) continue
    try {
      const response = await runAccount(current, model, init, signal)
      const state = await failure(response)
      if (!state.failed) return { response, slot: current.slot }
      lastResponse = response
      if (QUOTA_ERROR.test(state.message)) cooldownUntil.set(current.slot, nextReset())
      console.warn("[malik-image][quality-failover]", { slot: current.slot, model, status: response.status })
    } catch (error) {
      lastError = error
      if (signal?.aborted && !parentAttemptTimedOut(signal)) throw error
      console.warn("[malik-image][quality-failover]", { slot: current.slot, model, status: 0 })
    }
  }
  if (lastResponse) return { response: lastResponse, slot: "secondary" as Slot }
  if (lastError) throw lastError
  throw new Error("Cloudflare quality pool unavailable")
}

async function runTertiary(model: string, init: RequestInit, signal?: AbortSignal) {
  const current = account("tertiary")
  if (!current) throw new Error("Third Cloudflare image account is not configured")
  if (cooling("tertiary")) throw new Error("Third Cloudflare image account daily quota is exhausted")
  const response = await runAccount(current, model, init, signal)
  const state = await failure(response)
  if (state.failed && QUOTA_ERROR.test(state.message)) cooldownUntil.set("tertiary", nextReset())
  return response
}

function extractImage(payload: any) {
  const result = payload?.result ?? payload
  const value = [result?.image, result?.url, result?.imageUrl, result?.resultUrl, result?.images?.[0], result?.images?.[0]?.url, payload?.image, payload?.url]
    .find((candidate) => typeof candidate === "string" && candidate.trim())
  if (!value) return ""
  if (value.startsWith("http") || value.startsWith("data:")) return value
  return `data:image/jpeg;base64,${value}`
}

async function decode(response: Response, label: string) {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.startsWith("image/")) {
    if (!response.ok) throw new Error(`Cloudflare Workers AI returned ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    return `data:${contentType};base64,${bytes.toString("base64")}`
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const message = payload?.errors?.[0]?.message || payload?.error?.message || payload?.message
    throw new Error(message || `Cloudflare Workers AI returned ${response.status}`)
  }
  const imageUrl = extractImage(payload)
  if (!imageUrl) throw new Error(`${label} returned no image payload`)
  return imageUrl
}

function jsonBody(modelId: MalikImageModelId, prompt: string, negativePrompt: string, width: number, height: number, tuning?: ProviderQualityTuning) {
  if (modelId === "flux-schnell") return { prompt, steps: tuning?.steps ?? envNumber("MALIK_IMAGE_SCHNELL_STEPS", 4, 1, 8) }
  if (modelId === "leonardo-phoenix") return {
    prompt, width, height,
    guidance: tuning?.guidance ?? envNumber("MALIK_IMAGE_PHOENIX_GUIDANCE", 8.5, 2, 10),
    num_steps: tuning?.steps ?? envNumber("MALIK_IMAGE_PHOENIX_STEPS", 30, 1, 50),
    negative_prompt: negativePrompt,
  }
  return {
    prompt, width, height,
    guidance: tuning?.guidance ?? envNumber("MALIK_IMAGE_LUCID_GUIDANCE", 8.5, 0, 10),
    num_steps: tuning?.steps ?? envNumber("MALIK_IMAGE_LUCID_STEPS", 30, 1, 40),
  }
}

export async function generatePreparedCloudflareImage({ strictPrompt, negativePrompt, aspectRatio = "1:1", modelId = DEFAULT_MALIK_IMAGE_MODEL_ID, tuning, signal }: {
  strictPrompt: string
  negativePrompt: string
  aspectRatio?: ImageAspectRatio
  modelId?: MalikImageModelId
  tuning?: ProviderQualityTuning
  signal?: AbortSignal
}) {
  const model = getMalikImageModel(modelId)
  const { width, height } = size(aspectRatio)
  let call: { response: Response; slot: Slot }
  if (model.requestKind === "multipart") {
    const form = new FormData()
    form.append("prompt", strictPrompt)
    form.append("width", String(width))
    form.append("height", String(height))
    if (modelId === "flux-klein-4b") form.append("guidance", String(tuning?.guidance ?? envNumber("MALIK_IMAGE_KLEIN_GUIDANCE", 7.5, 0, 10)))
    if (modelId === "malik-image-1-premium") {
      form.append("steps", String(tuning?.steps ?? envNumber("MALIK_IMAGE_DEV_STEPS", 16, 1, 50)))
      form.append("guidance", String(tuning?.guidance ?? envNumber("MALIK_IMAGE_DEV_GUIDANCE", 7, 0, 10)))
    }
    call = await runQuality(model.providerModel, { method: "POST", body: form }, signal)
  } else {
    call = await runQuality(model.providerModel, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(jsonBody(modelId, strictPrompt, negativePrompt, width, height, tuning)),
    }, signal)
  }
  return {
    imageUrl: await decode(call.response, model.label),
    modelId,
    providerModel: model.providerModel,
    accountSlot: call.slot,
    steps: tuning?.steps,
    guidance: tuning?.guidance,
  }
}

export async function generateRawTertiaryCloudflareImage({ prompt, aspectRatio = "1:1", signal }: {
  prompt: string
  aspectRatio?: ImageAspectRatio
  signal?: AbortSignal
}) {
  const modelId: MalikImageModelId = "flux-klein-4b"
  const model = getMalikImageModel(modelId)
  const { width, height } = size(aspectRatio)
  const guidance = envNumber("MALIK_IMAGE_TERTIARY_KLEIN_GUIDANCE", 7.5, 0, 10)
  const form = new FormData()
  form.append("prompt", String(prompt || "").trim())
  form.append("width", String(width))
  form.append("height", String(height))
  form.append("guidance", String(guidance))
  const response = await runTertiary(model.providerModel, { method: "POST", body: form }, signal)
  return {
    imageUrl: await decode(response, model.label),
    modelId,
    providerModel: model.providerModel,
    accountSlot: "tertiary" as const,
    guidance,
  }
}
