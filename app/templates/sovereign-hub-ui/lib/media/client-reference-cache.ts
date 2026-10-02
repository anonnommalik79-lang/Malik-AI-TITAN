import type { ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"
import { lookupReferenceImages, sanitizeReferenceImages, type MalikVisualImage } from "./reference-catalog"

type CacheEntry = { images: MalikVisualImage[]; expires: number }
type Listener = (images: MalikVisualImage[]) => void
type Job = { controller: AbortController; listeners: Set<Listener> }
const STORAGE_KEY = "malik-reference-catalog-v3"
const MAX_ENTRIES = 60
const cache = new Map<string, CacheEntry>()
const pending = new Map<string, Job>()
let hydrated = false

export function referenceCacheKey(plan: ReferenceVisualPlan): string {
  return [plan.kind || "reference", plan.visualDevice?.join(",") || "", plan.visualTerms?.join(",") || "", ...plan.queries].join("|").toLocaleLowerCase().slice(0, 240)
}

function hydrateCache() {
  if (hydrated) return
  hydrated = true
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (!text || text.length > 128 * 1024) return
    const records: unknown = JSON.parse(text)
    if (!Array.isArray(records)) return
    for (const record of records.slice(-MAX_ENTRIES)) {
      if (!Array.isArray(record) || typeof record[0] !== "string" || record[0].length > 240) continue
      const entry = record[1] as CacheEntry | undefined
      if (!entry || typeof entry.expires !== "number" || entry.expires <= Date.now()) continue
      cache.set(record[0], { images: sanitizeReferenceImages(entry.images), expires: Math.min(entry.expires, Date.now() + 86400000) })
    }
  } catch { /* Private browsing/storage exhaustion still allows a live lookup. */ }
}

function saveCache(key: string, images: MalikVisualImage[]) {
  cache.delete(key)
  cache.set(key, { images, expires: Date.now() + (images.length ? 86400000 : 120000) })
  for (const [oldKey, entry] of cache) if (entry.expires <= Date.now()) cache.delete(oldKey)
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  try {
    const records = [...cache.entries()]
    let text = JSON.stringify(records)
    while (text.length > 128 * 1024 && records.length) { records.shift(); text = JSON.stringify(records) }
    localStorage.setItem(STORAGE_KEY, text)
  } catch { /* Keep the bounded memory cache. */ }
}

/** Deduplicate across messages/remounts; abort when the last reader leaves. */
export function subscribeReferenceImages(plan: ReferenceVisualPlan, listener: Listener): () => void {
  hydrateCache()
  const key = referenceCacheKey(plan)
  const existing = cache.get(key)
  if (existing && existing.expires > Date.now()) { listener(existing.images); return () => {} }
  let job = pending.get(key)
  if (!job || job.controller.signal.aborted) {
    job = { controller: new AbortController(), listeners: new Set() }
    pending.set(key, job)
    const current = job
    void Promise.resolve().then(() => lookupReferenceImages(plan, current.controller.signal))
      .then((images) => {
        if (current.controller.signal.aborted) return
        saveCache(key, images)
        for (const subscriber of current.listeners) subscriber(images)
      }).catch(() => {
        if (current.controller.signal.aborted) return
        saveCache(key, [])
        for (const subscriber of current.listeners) subscriber([])
      }).finally(() => { if (pending.get(key) === current) pending.delete(key) })
  }
  job.listeners.add(listener)
  const current = job
  return () => {
    current.listeners.delete(listener)
    // React StrictMode re-subscribes before this microtask; share its request.
    queueMicrotask(() => { if (!current.listeners.size) current.controller.abort() })
  }
}
