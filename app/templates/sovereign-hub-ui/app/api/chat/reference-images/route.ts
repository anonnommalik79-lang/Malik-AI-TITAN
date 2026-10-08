import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { planReferenceVisuals } from "@/lib/ai/reference-visual-policy"
import { cleanReferenceLabel, isSafeVisualUrl, lookupReferenceImages, readReferenceJson, referenceTopicMatches, sanitizeReferenceImages, type MalikVisualImage } from "@/lib/media/reference-catalog"
import { findProviderReferenceImages } from "@/lib/media/provider-reference-photos"

const cache = new Map<string, { expires: number; promise: Promise<MalikVisualImage[]> }>()

async function unsplash(topic: string, signal: AbortSignal): Promise<MalikVisualImage[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (!key) return []
  const params = new URLSearchParams({ query: topic, per_page: "3", content_filter: "high", orientation: "landscape" })
  const response = await fetch("https://api.unsplash.com/search/photos?" + params, {
    headers: { Authorization: "Client-ID " + key, Accept: "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
    next: { revalidate: 3600 },
  })
  if (!response.ok) return []
  const data = await readReferenceJson(response) as {
    results?: Array<{
      urls?: { small?: string }
      links?: { html?: string }
      alt_description?: string | null
      description?: string | null
      user?: { name?: string }
    }>
  }
  return (data?.results || []).flatMap((photo) => {
    const url = photo.urls?.small || ""
    if (!isSafeVisualUrl(url)) return []
    const source = photo.links?.html || "https://unsplash.com/"
    if (!source.startsWith("https://unsplash.com/")) return []
    return [{ url, sourceUrl: source, alt: cleanReferenceLabel(photo.alt_description || photo.description || topic) || topic, credit: photo.user?.name ? "Unsplash · " + cleanReferenceLabel(photo.user.name) : "Unsplash", license: "Unsplash License" }]
  }).slice(0, 3)
}

/** Browser fallback: bounded metadata only, never image bytes or arbitrary URLs. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q") || ""
  if (!raw.trim() || raw.length > 250 || /[\r\n]/.test(raw)) return NextResponse.json({ images: [] }, { status: 400 })
  const plan = planReferenceVisuals(raw)
  if (!plan) return NextResponse.json({ images: [] })
  const params = new URL(request.url).searchParams
  plan.person = plan.person || params.get("person") === "1"
  plan.entity = plan.entity || plan.person || params.get("entity") === "1"
  plan.logo = params.get("logo") === "1" && !plan.person
  const topic = params.get("topic") || ""
  if (topic.length > 120 || /[\r\n<>]|https?:|www\./iu.test(topic)) return NextResponse.json({ images: [] }, { status: 400 })
  if (topic) plan.queries = [...new Set([topic, ...plan.queries])].slice(0, 2)
  const skipOfficial = params.get("skipOfficial") === "1"
  const key = [plan.kind || "reference", plan.visualDevice?.join(",") || "", plan.visualTerms?.join(",") || "", skipOfficial ? "retry" : "", plan.entity ? "entity" : "", plan.person ? "person" : "", plan.logo ? "logo" : "", ...plan.queries].join("|").toLowerCase()
  let entry = cache.get(key)
  if (!entry || entry.expires <= Date.now()) {
    // Eviction bounds RAM. Concurrent identical lookups share one promise.
    for (const [oldKey, value] of cache) if (value.expires <= Date.now()) cache.delete(oldKey)
    while (cache.size >= 60) cache.delete(cache.keys().next().value!)
    const promise = (async () => {
      const started = Date.now()
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(7500)])
      // Prefer trusted official/Commons images. Only after 450ms, hedge with a
      // sequential server-only provider fallback; abort the loser to save quota.
      let images = await new Promise<MalikVisualImage[]>((resolve) => {
        const controller = new AbortController()
        const budget = AbortSignal.any([signal, controller.signal])
        let settled = false
        let failures = 0
        let providerStarted = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const finish = (found: MalikVisualImage[], force = false) => {
          if (settled) return
          if (!found.length && !force && ++failures < 2) return
          settled = true
          clearTimeout(timer)
          signal.removeEventListener("abort", aborted)
          controller.abort()
          resolve(found)
        }
        const aborted = () => finish([], true)
        const provider = () => {
          if (providerStarted || settled || budget.aborted) return
          providerStarted = true
          void findProviderReferenceImages(plan, budget).then((found) => finish(found)).catch(() => finish([]))
        }
        if (signal.aborted) { finish([], true); return }
        signal.addEventListener("abort", aborted, { once: true })
        timer = setTimeout(provider, 450)
        void lookupReferenceImages(plan, budget, { skipOfficial, fast: true })
          .then((found) => { finish(found); if (!found.length) provider() })
          .catch(() => { finish([]); provider() })
      })
      if (!images.length && plan.kind !== "tutorial" && !plan.entity && !plan.logo && !signal.aborted) {
        try { images = sanitizeReferenceImages(await unsplash(plan.queries[0], signal)).filter((image) => plan.queries.some((query) => referenceTopicMatches(query, image.alt))) } catch { /* Optional provider. */ }
      }
      // Timings/counts only: never log the user's prompt, identity or keys.
      if (!images.length || Date.now() - started > 1500) console.info("[reference-images]", { durationMs: Date.now() - started, count: images.length, timedOut: signal.aborted })
      return images
    })()
    entry = { expires: Date.now() + 600000, promise }
    cache.set(key, entry)
  }
  const images = await entry.promise
  if (!images.length) entry.expires = Math.min(entry.expires, Date.now() + 10000)
  return NextResponse.json({ images }, { headers: { "Cache-Control": images.length ? "private, max-age=600" : "no-store" } })
}
