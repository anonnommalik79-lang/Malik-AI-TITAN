import type { AIProviderId, ProviderError } from "./types"

export function normalizeProviderError(provider: AIProviderId, error: unknown): ProviderError {
  const raw = error instanceof Error ? error.message : String(error || "")
  const value = raw.toLowerCase()

  if (value.includes("api key") || value.includes("not configured") || value.includes("missing")) {
    return { code: "MISSING_API_KEY", provider, message: `${provider} API key is not configured.`, retryable: false }
  }

  if (value.includes("timeout") || value.includes("aborted")) {
    return { code: "PROVIDER_TIMEOUT", provider, message: `${provider} request timed out.`, retryable: true }
  }

  if (value.includes("429") || value.includes("quota") || value.includes("rate limit") || value.includes("too many")) {
    return { code: "QUOTA_EXCEEDED", provider, message: `${provider} quota or rate limit exceeded.`, retryable: true, status: 429 }
  }

  if (value.includes("model") && (value.includes("not") || value.includes("unavailable") || value.includes("enabled"))) {
    return { code: "MODEL_UNAVAILABLE", provider, message: `${provider} model is unavailable or not enabled.`, retryable: true }
  }

  if (value.includes("401") || value.includes("403") || value.includes("unauthorized") || value.includes("forbidden")) {
    return { code: "ACCESS_DENIED", provider, message: `${provider} access denied.`, retryable: false }
  }

  if (value.includes("empty")) {
    return { code: "EMPTY_RESPONSE", provider, message: `${provider} returned empty response.`, retryable: true }
  }

  return { code: "UNKNOWN_PROVIDER_ERROR", provider, message: raw || `${provider} failed.`, retryable: true }
}

export function safeErrorMessage(error: ProviderError) {
  return {
    code: error.code,
    message: error.code === "QUOTA_EXCEEDED"
      ? "High-demand engine is busy."
      : error.code === "PROVIDER_TIMEOUT"
        ? "Engine request timed out."
        : "Engine is temporarily unavailable.",
    retryable: error.retryable,
  }
}

/**
 * Public error messages are prose, never backend JSON, internal status codes or
 * storage paths. A failed Compute admission is still a real failed request:
 * this helper changes presentation only and never claims the operation worked.
 */
export function chatVisibleErrorMessage(value: unknown): string {
  const raw = String(value ?? "").trim()
  if (!raw) return "Не удалось получить ответ. Попробуйте отправить запрос снова."
  if (/MALIK_COMPUTE_STORAGE_UNAVAILABLE/u.test(raw)) {
    return "Сервис временно не может проверить лимит запросов. Попробуйте ещё раз немного позже."
  }
  if (/MALIK_COMPUTE_STORE_BUSY/u.test(raw)) {
    return "Сервис проверяет лимит запросов. Повторите через несколько секунд."
  }
  if (/^\s*[{[]/u.test(raw)) {
    try {
      const payload = JSON.parse(raw) as unknown
      const item = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
      const candidate = typeof item.message === "string" ? item.message
        : typeof item.error === "string" ? item.error
        : typeof (item.error as { message?: unknown })?.message === "string"
          ? String((item.error as { message: string }).message) : ""
      if (!candidate || /MALIK_[A-Z_]+|\{\s*"ok"/u.test(candidate)) {
        return "Не удалось получить ответ. Попробуйте отправить запрос снова."
      }
      return chatVisibleErrorMessage(candidate)
    } catch {
      return "Не удалось получить ответ. Попробуйте отправить запрос снова."
    }
  }
  if (raw.length > 600 || /<\/?[a-z!][^>]*>/iu.test(raw)) {
    return "Не удалось получить ответ. Попробуйте отправить запрос снова."
  }
  return raw
}

/** Proxy error pages are documents, not chat replies. */
export function chatHttpErrorMessage(status: number, body: string, contentType = ""): string {
  const fallback = status === 403
    ? "Защита сайта заблокировала запрос. Попробуйте отправить его позже."
    : status === 401
      ? "Сессия истекла. Войдите снова, чтобы продолжить."
      : status === 429
        ? "Слишком много запросов. Подождите немного и повторите."
        : "Не удалось получить ответ. Попробуйте отправить запрос снова."
  if (!body.trim() || body.length > 64_000 || /text\/html/i.test(contentType)) return fallback
  let candidate: unknown = body
  try {
    const payload = JSON.parse(body)
    candidate = typeof payload === "string" ? payload : payload?.message || payload?.error
    if (typeof candidate === "object" && candidate) candidate = (candidate as { message?: unknown }).message
  } catch {}
  if (typeof candidate !== "string" || /<\/?[a-z!][^>]*>/i.test(candidate)) return fallback
  const message = candidate.trim()
  return message && message.length <= 600 ? chatVisibleErrorMessage(message) : fallback
}
