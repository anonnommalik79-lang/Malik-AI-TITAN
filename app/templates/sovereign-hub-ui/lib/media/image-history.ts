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
const MAX_HISTORY = 60

function hash(value: string) {
  let h = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0).toString(36)
}

function cleanItem(value: unknown): MalikImageHistoryItem | null {
  if (!value || typeof value !== "object") return null
  const item = value as Partial<MalikImageHistoryItem>
  const src = String(item.src || "").trim()
  if (!src) return null
  return {
    id: String(item.id || `img_${hash(src)}`),
    src,
    prompt: String(item.prompt || "").trim().slice(0, 1400),
    provider: String(item.provider || "").trim().slice(0, 120),
    quality: String(item.quality || "").trim().slice(0, 40) || undefined,
    createdAt: String(item.createdAt || new Date().toISOString()),
    favorite: Boolean(item.favorite),
  }
}

export function readMalikImageHistory(): MalikImageHistoryItem[] {
  if (typeof window === "undefined") return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.map(cleanItem).filter((item): item is MalikImageHistoryItem => Boolean(item)).slice(0, MAX_HISTORY)
  } catch {
    return []
  }
}

function write(items: MalikImageHistoryItem[]) {
  if (typeof window === "undefined") return
  const safe = items.slice(0, MAX_HISTORY)
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe)) } catch {}
  window.dispatchEvent(new CustomEvent(MALIK_IMAGE_HISTORY_EVENT, { detail: safe }))
}

export function rememberMalikImage(input: Omit<MalikImageHistoryItem, "id" | "createdAt" | "favorite"> & { id?: string }) {
  const src = String(input.src || "").trim()
  if (!src) return null
  const current = readMalikImageHistory()
  const id = input.id || `img_${hash(src)}`
  const existing = current.find((item) => item.id === id || item.src === src)
  const next: MalikImageHistoryItem = {
    id,
    src,
    prompt: String(input.prompt || "").trim().slice(0, 1400),
    provider: String(input.provider || "").trim().slice(0, 120),
    quality: input.quality,
    createdAt: existing?.createdAt || new Date().toISOString(),
    favorite: existing?.favorite || false,
  }
  write([next, ...current.filter((item) => item.id !== id && item.src !== src)])
  return next
}

export function toggleMalikImageFavorite(src: string) {
  const current = readMalikImageHistory()
  const found = current.find((item) => item.src === src)
  if (!found) return false
  const favorite = !found.favorite
  write(current.map((item) => item.src === src ? { ...item, favorite } : item))
  return favorite
}

export function isMalikImageFavorite(src: string) {
  return readMalikImageHistory().some((item) => item.src === src && item.favorite)
}
