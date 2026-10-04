import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { planReferenceVisuals } from "@/lib/ai/reference-visual-policy"
import { cleanReferenceLabel, isSafeVisualUrl, lookupReferenceImages, readReferenceJson, sanitizeReferenceImages, type MalikVisualImage } from "@/lib/media/reference-catalog"

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
  const key = [skipOfficial ? "retry" : "", plan.entity ? "entity" : "", plan.person ? "person" : "", plan.logo ? "logo" : "", ...plan.queries].join("|").toLowerCase()
  let entry = cache.get(key)
  if (!entry || entry.expires <= Date.now()) {
    // Eviction bounds RAM. Concurrent identical lookups share one promise.
    for (const [oldKey, value] of cache) if (value.expires <= Date.now()) cache.delete(oldKey)
    while (cache.size >= 60) cache.delete(cache.keys().next().value!)
    const promise = (async () => {
      const started = Date.now()
      const signal = AbortSignal.timeout(7500)
      let images = await lookupReferenceImages(plan, signal, { skipOfficial, fast: true })
      if (!images.length && !plan.entity && !plan.logo && !signal.aborted) {
        try { images = sanitizeReferenceImages(await unsplash(plan.queries[0], signal)) } catch { /* Optional provider. */ }
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
