import type { ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"
import { lookupReferenceImages, readReferenceJson, sanitizeReferenceImages, type MalikVisualImage } from "./reference-catalog"

type CacheEntry = { images: MalikVisualImage[]; expires: number }
type Listener = (images: MalikVisualImage[]) => void
type Job = { controller: AbortController; listeners: Set<Listener> }
const STORAGE_KEY = "malik-reference-catalog-v9"
export const REFERENCE_LOOKUP_BUDGET_MS = 8000
const MAX_ENTRIES = 60
const cache = new Map<string, CacheEntry>()
const pending = new Map<string, Job>()
const failedImages = new Map<string, Set<string>>()
let activeLookups = 0
const waitingLookups: Array<() => void> = []
let hydrated = false

/** Large comparisons must not flood public catalogues with simultaneous searches. */
function acquireLookup(signal: AbortSignal): Promise<(() => void) | null> {
  if (signal.aborted) return Promise.resolve(null)
  return new Promise((resolve) => {
    const cancel = () => {
      const index = waitingLookups.indexOf(grant)
      if (index >= 0) waitingLookups.splice(index, 1)
      resolve(null)
    }
    const grant = () => {
      signal.removeEventListener("abort", cancel)
      if (signal.aborted) { resolve(null); waitingLookups.shift()?.(); return }
      activeLookups += 1
      resolve(() => { activeLookups -= 1; waitingLookups.shift()?.() })
    }
    if (activeLookups < 3) grant()
    else { waitingLookups.push(grant); signal.addEventListener("abort", cancel, { once: true }) }
  })
}

export function referenceCacheKey(plan: ReferenceVisualPlan): string {
  return [plan.kind || "reference", plan.entity ? "entity" : "", plan.person ? "person" : "", plan.logo ? "logo" : "", plan.visualDevice?.join(",") || "", plan.visualTerms?.join(",") || "", ...plan.queries].join("|").toLocaleLowerCase().slice(0, 240)
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
  cache.set(key, { images, expires: Date.now() + (images.length ? 86400000 : 10000) })
  for (const [oldKey, entry] of cache) if (entry.expires <= Date.now()) cache.delete(oldKey)
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  try {
    const records = [...cache.entries()].filter(([, entry]) => entry.images.length)
    let text = JSON.stringify(records)
    while (text.length > 128 * 1024 && records.length) { records.shift(); text = JSON.stringify(records) }
    localStorage.setItem(STORAGE_KEY, text)
  } catch { /* Keep the bounded memory cache. */ }
}

export function invalidateReferenceImages(plan: ReferenceVisualPlan) {
  cache.delete(referenceCacheKey(plan))
}

/** A failed image must not be served repeatedly from a successful metadata cache. */
export function reportReferenceImageFailure(plan: ReferenceVisualPlan, url: string): boolean {
  const key = referenceCacheKey(plan)
  const failed = failedImages.get(key) || new Set<string>()
  if (failed.has(url) || failed.size >= 3) return false
  failed.add(url)
  failedImages.delete(key)
  failedImages.set(key, failed)
  while (failedImages.size > MAX_ENTRIES) failedImages.delete(failedImages.keys().next().value!)
  invalidateReferenceImages(plan)
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  return true
}

async function lookupWithFallback(plan: ReferenceVisualPlan, signal: AbortSignal): Promise<MalikVisualImage[]> {
  const excludedUrls = [...(failedImages.get(referenceCacheKey(plan)) || [])]
  // A hedged metadata read: give the direct catalogue a head start, but don't
  // wait 9 + 24 seconds before trying a server where CORS/ISP blocks differ.
  // The first relevant result wins, cancels its competitor and never waits
  // for image bytes. Tutorials retain their exact device/feature policy.
  const controller = new AbortController()
  const budget = AbortSignal.any([signal, controller.signal])
  return new Promise((resolve) => {
    let settled = false, directDone = false, fallbackDone = false, fallbackStarted = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (images: MalikVisualImage[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      budget.removeEventListener("abort", aborted)
      controller.abort()
      resolve(images)
    }
    const aborted = () => finish([])
    const deliver = (images: MalikVisualImage[]) => {
      if (images.length) finish(images)
      else if (directDone && fallbackDone) finish([])
    }
    const fallback = async () => {
      if (fallbackStarted || settled) return
      fallbackStarted = true
      clearTimeout(timer)
      const params = new URLSearchParams({ q: (plan.kind === "tutorial" ? "Как настроить " : "Покажи фото ") + plan.topic, entity: plan.entity ? "1" : "0", person: plan.person ? "1" : "0" })
      if (plan.queries[0]) params.set("topic", plan.queries[0])
      if (plan.logo) params.set("logo", "1")
      if (excludedUrls.length) params.set("skipOfficial", "1")
      let images: MalikVisualImage[] = []
      try {
        const response = await fetch("/api/chat/reference-images?" + params, { headers: { Accept: "application/json" }, signal: budget })
        const data = await readReferenceJson(response) as { images?: unknown } | null
        images = sanitizeReferenceImages(data?.images).filter((image) => !excludedUrls.includes(image.url))
      } catch { /* The direct catalogue may still succeed. */ }
      fallbackDone = true
      deliver(images)
    }
    budget.addEventListener("abort", aborted, { once: true })
    if (budget.aborted) { finish([]); return }
    timer = setTimeout(() => { void fallback() }, 350)
    void lookupReferenceImages(plan, budget, { excludedUrls, fast: true }).catch(() => []).then((images) => {
      directDone = true
      deliver(images)
      if (!settled) void fallback()
    })
  })
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
    void Promise.resolve().then(async () => {
      // Waiting for an earlier photo must not consume this photo's network budget.
      const queueSignal = AbortSignal.any([current.controller.signal, AbortSignal.timeout(30_000)])
      const release = await acquireLookup(queueSignal)
      if (!release) return []
      const signal = AbortSignal.any([current.controller.signal, AbortSignal.timeout(REFERENCE_LOOKUP_BUDGET_MS)])
      try { return await lookupWithFallback(plan, signal) } finally { release() }
    })
      .then((images) => {
        if (current.controller.signal.aborted) return
        // A reader may retry synchronously on delivery; it needs a fresh job.
        if (pending.get(key) === current) pending.delete(key)
        saveCache(key, images)
        for (const subscriber of current.listeners) subscriber(images)
      }).catch(() => {
        if (current.controller.signal.aborted) return
        if (pending.get(key) === current) pending.delete(key)
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
