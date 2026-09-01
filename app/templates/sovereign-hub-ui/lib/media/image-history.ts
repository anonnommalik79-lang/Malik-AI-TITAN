"use client"

export type MalikImageHistoryItem = {
  id: string
  src: string
  prompt: string
  provider: string
  quality?: string
  createdAt: string
  favorite: boolean
}

const STORAGE_KEY = "malik_image_history_v2"
export const MALIK_IMAGE_HISTORY_EVENT = "malik-image-history-changed"
const MAX_HISTORY = 48
const MAX_PROMPT_CHARS = 900

function hash(value: string) {
  let h = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0).toString(36)
}

/**
 * localStorage is for metadata, never media bytes. A 2K data URI can be several
 * megabytes; storing even one there can exhaust the origin quota, make the chat
 * snapshot fail, and force the browser to keep multiple giant UTF-16 copies in
 * memory. Durable /api URLs, https URLs and IndexedDB handles are tiny and safe.
 */
export function isPersistableMalikImageReference(value: unknown): value is string {
  const src = String(value || "").trim()
  if (!src || src.length > 4096) return false
  if (/^(?:data|blob):/i.test(src)) return false
  return src.startsWith("/") || /^https:\/\//i.test(src) || src.startsWith("malik-image://")
}

function cleanItem(value: unknown): MalikImageHistoryItem | null {
  if (!value || typeof value !== "object") return null
  const item = value as Partial<MalikImageHistoryItem>
  const src = String(item.src || "").trim()
  if (!isPersistableMalikImageReference(src)) return null
  return {
    id: String(item.id || `img_${hash(src)}`).slice(0, 120),
    src,
    prompt: String(item.prompt || "").replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_CHARS),
    provider: String(item.provider || "").trim().slice(0, 80),
    quality: String(item.quality || "").trim().slice(0, 32) || undefined,
    createdAt: String(item.createdAt || new Date().toISOString()).slice(0, 64),
    favorite: Boolean(item.favorite),
  }
}

function writeRaw(items: MalikImageHistoryItem[]) {
  if (typeof window === "undefined") return false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    return true
  } catch {
    return false
  }
}

export function readMalikImageHistory(): MalikImageHistoryItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || "[]"
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const safe = parsed.map(cleanItem).filter((item): item is MalikImageHistoryItem => Boolean(item)).slice(0, MAX_HISTORY)

    // One-time self-heal for builds that used to store data:/blob: image bytes.
    // Rewriting the cleaned list immediately gives that quota back to chat history.
    if (safe.length !== parsed.length || raw.length > 750_000) writeRaw(safe)
    return safe
  } catch {
    try { window.localStorage.removeItem(STORAGE_KEY) } catch {}
    return []
  }
}

function write(items: MalikImageHistoryItem[]) {
  if (typeof window === "undefined") return
  let safe = items.map(cleanItem).filter((item): item is MalikImageHistoryItem => Boolean(item)).slice(0, MAX_HISTORY)

  // Image history is disposable metadata. If the browser quota is tight, shrink
  // this list itself; never consume the space needed by the user's chat history.
  if (!writeRaw(safe)) {
    safe = safe.slice(0, 16)
    if (!writeRaw(safe)) {
      try { window.localStorage.removeItem(STORAGE_KEY) } catch {}
      safe = []
    }
  }
  window.dispatchEvent(new CustomEvent(MALIK_IMAGE_HISTORY_EVENT, { detail: safe }))
}

export function rememberMalikImage(input: Omit<MalikImageHistoryItem, "id" | "createdAt" | "favorite"> & { id?: string }) {
  const src = String(input.src || "").trim()
  if (!isPersistableMalikImageReference(src)) return null
  const current = readMalikImageHistory()
  const id = String(input.id || `img_${hash(src)}`).slice(0, 120)
  const existing = current.find((item) => item.id === id || item.src === src)
  const next: MalikImageHistoryItem = {
    id,
    src,
    prompt: String(input.prompt || "").replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_CHARS),
    provider: String(input.provider || "").trim().slice(0, 80),
    quality: String(input.quality || "").trim().slice(0, 32) || undefined,
    createdAt: existing?.createdAt || new Date().toISOString(),
    favorite: existing?.favorite || false,
  }
  write([next, ...current.filter((item) => item.id !== id && item.src !== src)])
  return next
}

export function toggleMalikImageFavorite(src: string) {
  if (!isPersistableMalikImageReference(src)) return false
  const current = readMalikImageHistory()
  const found = current.find((item) => item.src === src)
  if (!found) return false
  const favorite = !found.favorite
  write(current.map((item) => item.src === src ? { ...item, favorite } : item))
  return favorite
}

export function isMalikImageFavorite(src: string) {
  if (!isPersistableMalikImageReference(src)) return false
  return readMalikImageHistory().some((item) => item.src === src && item.favorite)
}
