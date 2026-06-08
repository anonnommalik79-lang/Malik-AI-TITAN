import type { AIProviderId, ProviderError, ProviderErrorCode } from "./types"

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

