import "server-only"

const SECRET_KEY = /(api.?key|secret|password|token|authorization|cookie|credential|session)/i
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi
const KEY_LIKE = /\b(?:sk|rk|pk|ghp|github_pat|AIza|xai|gsk|hf)_[A-Za-z0-9._-]{8,}\b/g

export function redactSecretText(value: unknown) {
  return String(value ?? "")
    .replace(BEARER, "Bearer [REDACTED]")
    .replace(KEY_LIKE, "[REDACTED]")
    .slice(0, 4_000)
}

export function redactMetadata(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]"
  if (value == null || typeof value === "boolean" || typeof value === "number") return value
  if (typeof value === "string") return redactSecretText(value)
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactMetadata(item, depth + 1))
  if (typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      output[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactMetadata(item, depth + 1)
    }
    return output
  }
  return redactSecretText(value)
}

export function publicFailure(error: unknown, diagnosticId: string) {
  const raw = error instanceof Error ? error.message : String(error || "")
  const lowered = raw.toLowerCase()
  const timeout = /timeout|timed out|abort/.test(lowered)
  const rate = /rate.?limit|too many requests/.test(lowered)
  const unavailable = /unavailable|overloaded|capacity/.test(lowered)
  return {
    code: timeout ? "TIMEOUT" : rate ? "RATE_LIMITED" : unavailable ? "TEMPORARILY_UNAVAILABLE" : "REQUEST_FAILED",
    error: timeout
      ? "Операция заняла слишком много времени. Попробуйте ещё раз."
      : rate
        ? "Сервис временно ограничил частоту запросов. Malik AI повторит позже."
        : unavailable
          ? "Один из AI-сервисов временно недоступен. Попробуйте ещё раз."
          : "Не удалось завершить операцию. Повторите попытку.",
    diagnosticId,
  }
}
