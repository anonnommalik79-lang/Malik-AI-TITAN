import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { planReferenceVisuals } from "@/lib/ai/reference-visual-policy"
import { cleanReferenceLabel, isSafeVisualUrl, lookupReferenceImages, readReferenceJson, sanitizeReferenceImages, type MalikVisualImage } from "@/lib/media/reference-catalog"

const cache = new Map<string, { expires: number; promise: Promise<MalikVisualImage[]> }>()

async function unsplash(topic: string): Promise<MalikVisualImage[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (!key) return []
  const params = new URLSearchParams({ query: topic, per_page: "3", content_filter: "high", orientation: "landscape" })
  const response = await fetch("https://api.unsplash.com/search/photos?" + params, {
    headers: { Authorization: "Client-ID " + key, Accept: "application/json" },
    signal: AbortSignal.timeout(5500),
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

/** Compatibility endpoint: bounded metadata only; the chat uses browser-direct lookup. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q") || ""
  if (!raw.trim() || raw.length > 250 || /[\r\n]/.test(raw)) return NextResponse.json({ images: [] }, { status: 400 })
  const plan = planReferenceVisuals(raw)
  if (!plan) return NextResponse.json({ images: [] })
  const key = plan.queries.join("|").toLowerCase()
  let entry = cache.get(key)
  if (!entry || entry.expires <= Date.now()) {
    // Eviction bounds RAM. Concurrent identical lookups share one promise.
    for (const [oldKey, value] of cache) if (value.expires <= Date.now()) cache.delete(oldKey)
    while (cache.size >= 60) cache.delete(cache.keys().next().value!)
    const promise = (async () => {
      let images: MalikVisualImage[] = []
      try { images = sanitizeReferenceImages(await unsplash(plan.queries[0])) } catch { /* Optional provider. */ }
      return images.length ? images : lookupReferenceImages(plan)
    })()
    entry = { expires: Date.now() + 600000, promise }
    cache.set(key, entry)
  }
  const images = await entry.promise
  return NextResponse.json({ images }, { headers: { "Cache-Control": "private, max-age=600" } })
}
