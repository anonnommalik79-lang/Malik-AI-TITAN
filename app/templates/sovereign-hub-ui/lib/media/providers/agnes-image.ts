import "server-only"

import type { ImageAspectRatio } from "../types"

export type AgnesImageSize = "1K" | "2K" | "4K"

type AgnesGenerateInput = {
  prompt: string
  size: AgnesImageSize
  aspectRatio?: ImageAspectRatio
}

type AgnesGenerateResult = {
  imageUrl: string
  providerModel: string
}

const DEFAULT_BASE_URL = "https://apihub.agnes-ai.com/v1"
const MODEL = "agnes-image-2.1-flash"

function envNumber(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] || fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function envBoolean(name: string, fallback: boolean) {
  const value = String(process.env[name] ?? "").trim().toLowerCase()
  if (!value) return fallback
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

function apiBaseUrl() {
  return (process.env.AGNES_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "")
}

export function agnesImageKeys() {
  return [
    process.env.AGNES_API_KEY_1,
    process.env.AGNES_API_KEY_2,
    process.env.AGNES_API_KEY_3,
    process.env.AGNES_API_KEY,
  ]
    .map((value) => String(value || "").trim())
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
}

export function agnesImageConfigured() {
  return agnesImageKeys().length > 0
}

function agnesRatio(value?: ImageAspectRatio) {
  if (value === "16:9" || value === "9:16" || value === "4:3" || value === "1:1") return value
  // Agnes does not expose a native 4:5 tier. 3:4 is the closest supported portrait ratio.
  if (value === "4:5") return "3:4"
  return "1:1"
}

function safeProviderError(status: number, payload: any) {
  const code = String(payload?.error?.code || payload?.code || "").slice(0, 80)
  const message = String(payload?.error?.message || payload?.message || "").slice(0, 220)
  return [`HTTP ${status}`, code, message].filter(Boolean).join(" · ")
}

function extractImageUrl(payload: any) {
  const data = payload?.data
  if (Array.isArray(data)) {
    const found = data.find((item) => typeof item?.url === "string" && item.url)
    if (found?.url) return String(found.url)
  }
  if (typeof data?.url === "string" && data.url) return String(data.url)
  if (typeof payload?.url === "string" && payload.url) return String(payload.url)
  if (typeof payload?.output?.url === "string" && payload.output.url) return String(payload.output.url)
  return ""
}

function isRetryableStatus(status: number) {
  return status === 401 || status === 403 || status === 408 || status === 425 || status >= 500
}

async function delay(ms: number) {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function runOneKey(key: string, input: AgnesGenerateInput) {
  const controller = new AbortController()
  const timeoutMs = envNumber("AGNES_REQUEST_TIMEOUT_MS", 45_000, 5_000, 120_000)
  const timer = setTimeout(() => controller.abort(new Error("AGNES_REQUEST_TIMEOUT")), timeoutMs)

  try {
    const response = await fetch(`${apiBaseUrl()}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: input.prompt,
        size: input.size,
        ratio: agnesRatio(input.aspectRatio),
        extra_body: { response_format: "url" },
      }),
      cache: "no-store",
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => ({}))

    if (response.status === 429) {
      // Never rotate accounts to evade a provider quota. Respect Retry-After briefly,
      // then let Malik's provider router continue with its independent fallback.
      const respectRetryAfter = envBoolean("AGNES_RESPECT_RETRY_AFTER", true)
      const retryAfterSeconds = Number(response.headers.get("retry-after") || 0)
      if (respectRetryAfter && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 && retryAfterSeconds <= 5) {
        await delay(retryAfterSeconds * 1000)
      }
      throw new Error("AGNES_RATE_LIMITED")
    }

    if (!response.ok) {
      const error = new Error(`AGNES_PROVIDER_ERROR: ${safeProviderError(response.status, payload)}`)
      ;(error as Error & { status?: number }).status = response.status
      throw error
    }

    const imageUrl = extractImageUrl(payload)
    if (!imageUrl) throw new Error("AGNES_EMPTY_IMAGE_URL")

    return { imageUrl, providerModel: MODEL } satisfies AgnesGenerateResult
  } finally {
    clearTimeout(timer)
  }
}

export async function generateWithAgnesImage(input: AgnesGenerateInput): Promise<AgnesGenerateResult> {
  const keys = agnesImageKeys()
  if (!keys.length) throw new Error("AGNES_NOT_CONFIGURED")

  const failover = envBoolean("AGNES_FAILOVER_ENABLED", true)
  const maxAttempts = Math.min(
    keys.length,
    envNumber("AGNES_MAX_ATTEMPTS", keys.length, 1, Math.max(1, keys.length)),
  )
  const backoffMs = envNumber("AGNES_BACKOFF_MS", 1000, 0, 10_000)
  let lastError: unknown

  for (let index = 0; index < maxAttempts; index += 1) {
    try {
      return await runOneKey(keys[index], input)
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error || "")
      if (message.includes("AGNES_RATE_LIMITED")) throw error

      const status = Number((error as Error & { status?: number })?.status || 0)
      const retryable =
        !status ||
        isRetryableStatus(status) ||
        /timeout|abort|fetch failed|network|socket|econnreset|eai_again/i.test(message)

      if (!failover || !retryable || index >= maxAttempts - 1) throw error
      await delay(backoffMs * Math.max(1, index + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AGNES_IMAGE_GENERATION_FAILED")
}
