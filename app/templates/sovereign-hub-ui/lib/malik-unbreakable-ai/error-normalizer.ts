export function normalizeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "")
  const value = raw.toLowerCase()

  if (value.includes("401") || value.includes("unauthorized")) return "Secure runtime authorization failed. Проверь server configuration."
  if (value.includes("402") || value.includes("balance") || value.includes("credit")) return "Runtime billing requires attention."
  if (value.includes("429") || value.includes("rate limit")) return "Rate limit. Подожди и повтори."
  if (value.includes("timeout") || value.includes("aborted")) return "Timeout. Увеличь poll/timeout или повтори."
  if (value.includes("failed to fetch") || value.includes("network")) return "Network/backend unavailable."
  if (value.includes("refresh token") || value.includes("already used")) return "Session expired. Нужно clean logout/login."
  return "Runtime request failed. Проверь server logs."
}

export function errorCode(error: unknown) {
  const value = String(error || "").toLowerCase()
  if (value.includes("401")) return "AUTH_401"
  if (value.includes("402")) return "BILLING_402"
  if (value.includes("429")) return "RATE_LIMIT_429"
  if (value.includes("timeout")) return "TIMEOUT"
  if (value.includes("network") || value.includes("fetch")) return "NETWORK"
  return "UNKNOWN"
}

