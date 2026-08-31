export const MALIK_MEMORY_COOKIE = "malik_memory_context_v1"
export const MALIK_MEMORY_COOKIE_MAX_ENCODED_CHARS = 3000
export const MALIK_MEMORY_SERVER_MAX_ITEMS = 24
export const MALIK_MEMORY_SERVER_MAX_ITEM_CHARS = 420

export function sanitizeMalikMemoryText(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MALIK_MEMORY_SERVER_MAX_ITEM_CHARS)
}

export function encodeMalikMemoryCookie(values: unknown[]): string {
  const clean = values
    .map(sanitizeMalikMemoryText)
    .filter(Boolean)
    .slice(0, MALIK_MEMORY_SERVER_MAX_ITEMS)

  const accepted: string[] = []
  for (const item of clean) {
    const next = [...accepted, item]
    const encoded = encodeURIComponent(JSON.stringify(next))
    if (encoded.length > MALIK_MEMORY_COOKIE_MAX_ENCODED_CHARS) break
    accepted.push(item)
  }

  return encodeURIComponent(JSON.stringify(accepted))
}

export function decodeMalikMemoryCookie(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return []
  try {
    const decoded = decodeURIComponent(value)
    const parsed: unknown = JSON.parse(decoded)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(sanitizeMalikMemoryText)
      .filter(Boolean)
      .slice(0, MALIK_MEMORY_SERVER_MAX_ITEMS)
  } catch {
    return []
  }
}
