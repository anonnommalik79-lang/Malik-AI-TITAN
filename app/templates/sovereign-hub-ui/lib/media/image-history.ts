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
const MAX_HISTORY = 200
const MAX_PROMPT_CHARS = 900
const MASTER_FRAGMENT = "#malik-master="

function hash(value: string) {
  let h = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0).toString(36)
}

function masterReference(value: string) {
  const src = String(value || "").trim()
  const marker = src.lastIndexOf(MASTER_FRAGMENT)
  if (marker < 0) return src
  const encoded = src.slice(marker + MASTER_FRAGMENT.length)
  try { return decodeURIComponent(encoded) || src.slice(0, marker) } catch { return src.slice(0, marker) }
}

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
    id: String(item.id || `img_${hash(src)}`).slice(0, 160),
    src,
    prompt: String(item.prompt || "").replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_CHARS),
    provider: String(item.provider || "").trim().slice(0, 120),
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

    if (safe.length !== parsed.length || raw.length > 1_500_000) writeRaw(safe)
    return safe
  } catch {
    try { window.localStorage.removeItem(STORAGE_KEY) } catch {}
    return []
  }
}

function write(items: MalikImageHistoryItem[]) {
  if (typeof window === "undefined") return
  let safe = items.map(cleanItem).filter((item): item is MalikImageHistoryItem => Boolean(item)).slice(0, MAX_HISTORY)

  if (!writeRaw(safe)) {
    safe = safe.slice(0, 80)
    if (!writeRaw(safe)) {
      try { window.localStorage.removeItem(STORAGE_KEY) } catch {}
      safe = []
    }
  }
  window.dispatchEvent(new CustomEvent(MALIK_IMAGE_HISTORY_EVENT, { detail: safe }))
}

export async function syncMalikImageHistoryFromAccount() {
  const local = readMalikImageHistory()
  if (typeof window === "undefined") return local

  try {
    const response = await fetch("/api/media/library?limit=200", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
    })
    if (!response.ok) return local
    const payload = await response.json().catch(() => null) as { items?: unknown[] } | null
    if (!Array.isArray(payload?.items) || !payload.items.length) return local

    const remote = payload.items.map(cleanItem).filter((item): item is MalikImageHistoryItem => Boolean(item))
    const localByMaster = new Map(local.map((item) => [masterReference(item.src), item] as const))
    const seen = new Set<string>()
    const merged: MalikImageHistoryItem[] = []

    for (const item of remote) {
      const identity = masterReference(item.src)
      if (seen.has(identity)) continue
      seen.add(identity)
      const cached = localByMaster.get(identity)
      merged.push({
        ...item,
        prompt: item.prompt || cached?.prompt || "",
        provider: item.provider || cached?.provider || "MalikImage",
        quality: item.quality || cached?.quality,
        favorite: item.favorite || cached?.favorite || false,
      })
    }

    for (const item of local) {
      const identity = masterReference(item.src)
      if (seen.has(identity)) continue
      seen.add(identity)
      merged.push(item)
    }

    write(merged)
    return readMalikImageHistory()
  } catch {
    return local
  }
}

export function rememberMalikImage(input: Omit<MalikImageHistoryItem, "id" | "createdAt" | "favorite"> & { id?: string }) {
  const src = String(input.src || "").trim()
  if (!isPersistableMalikImageReference(src)) return null
  const current = readMalikImageHistory()
  const id = String(input.id || `img_${hash(src)}`).slice(0, 160)
  const identity = masterReference(src)
  const existing = current.find((item) => item.id === id || item.src === src || masterReference(item.src) === identity)
  const prompt = String(input.prompt || "").replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_CHARS)
  const provider = String(input.provider || "").trim().slice(0, 120)
  const quality = String(input.quality || "").trim().slice(0, 32) || undefined

  if (
    existing &&
    existing.src === src &&
    existing.prompt === prompt &&
    existing.provider === provider &&
    existing.quality === quality
  ) {
    return existing
  }

  const next: MalikImageHistoryItem = {
    id: existing?.id || id,
    src,
    prompt: prompt || existing?.prompt || "",
    provider: provider || existing?.provider || "",
    quality: quality || existing?.quality,
    createdAt: existing?.createdAt || new Date().toISOString(),
    favorite: existing?.favorite || false,
  }
  write([next, ...current.filter((item) => item.id !== next.id && masterReference(item.src) !== identity)])
  return next
}

export function toggleMalikImageFavorite(src: string) {
  if (!isPersistableMalikImageReference(src)) return false
  const identity = masterReference(src)
  const current = readMalikImageHistory()
  const found = current.find((item) => masterReference(item.src) === identity)
  if (!found) return false
  const favorite = !found.favorite
  write(current.map((item) => masterReference(item.src) === identity ? { ...item, favorite } : item))
  return favorite
}

export function isMalikImageFavorite(src: string) {
  if (!isPersistableMalikImageReference(src)) return false
  const identity = masterReference(src)
  return readMalikImageHistory().some((item) => masterReference(item.src) === identity && item.favorite)
}
