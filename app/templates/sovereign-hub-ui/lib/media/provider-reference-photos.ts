import type { ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"
import { cleanReferenceLabel, isPublicReferenceUrl, readReferenceJson, referencePhotoQuality, referenceTopicMatches, referenceContextMatches, sanitizeReferenceImages, type MalikVisualImage } from "./reference-catalog"
import { referencePhotoTarget, referencePhotoTicket } from "./reference-photo-ticket"

type Provider = "brave" | "serper" | "tavily" | "serpapi" | "pixabay" | "openverse"
type Photo = { image?: string; alternates?: string[]; title?: string; link?: string; unsafe?: boolean; width?: number; height?: number; credit?: string; license?: string }
const PROVIDERS: Array<[Provider, string | null]> = [
  ["brave", "BRAVE_SEARCH_API_KEY"], ["serper", "SERPER_API_KEY"],
  ["tavily", "TAVILY_API_KEY"], ["serpapi", "SERPAPI_API_KEY"],
  ["pixabay", "PIXABAY_API_KEY"], ["openverse", null],
]
const health = new Map<Provider, { window: number; calls: number; blockedUntil: number }>()
const candidateCache = new Map<string, { expires: number; photos: Photo[] }>()
let quotaWindow = 0, totalCalls = 0
let active = 0
const waiting: Array<() => void> = []
function takeQuota(provider: Provider): boolean {
  const now = Date.now(), entry = health.get(provider) || { window: now, calls: 0, blockedUntil: 0 }
  if (now - entry.window >= 60000) { entry.window = now; entry.calls = 0 }
  health.set(provider, entry)
  if (entry.blockedUntil > now || entry.calls >= 24) return false
  if (now - quotaWindow >= 60000) { quotaWindow = now; totalCalls = 0 }
  if (totalCalls >= 24) return false
  totalCalls++
  entry.calls++
  return true
}
function pause(provider: Provider, status = 0) {
  const entry = health.get(provider)
  if (entry) entry.blockedUntil = Date.now() + (status === 401 || status === 403 ? 300000 : status === 429 ? 60000 : 10000)
}
function slot(signal: AbortSignal): Promise<(() => void) | null> {
  if (signal.aborted || waiting.length >= 16) return Promise.resolve(null)
  return new Promise((resolve) => {
    const cancel = () => { const index = waiting.indexOf(grant); if (index >= 0) waiting.splice(index, 1); resolve(null) }
    const grant = () => {
      signal.removeEventListener("abort", cancel)
      if (signal.aborted) { resolve(null); waiting.shift()?.(); return }
      active++
      let released = false
      resolve(() => { if (released) return; released = true; active--; waiting.shift()?.() })
    }
    if (active < 2) grant()
    else { waiting.push(grant); signal.addEventListener("abort", cancel, { once: true }) }
  })
}
function photoIdentity(value: string): string {
  const url = new URL(value)
  url.hash = ""
  for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key)
  return url.href
}
function normalize(plan: ReferenceVisualPlan, provider: Provider, candidates: Photo[], excluded: ReadonlySet<string>): MalikVisualImage[] {
  const usable = candidates.map((item) => ({ ...item, image: [item.image, ...(item.alternates || [])].find((url) => url && isPublicReferenceUrl(url) && !excluded.has(photoIdentity(url))) }))
  const images = usable.filter((item) => !item.unsafe && item.image && isPublicReferenceUrl(item.image)
    && !excluded.has(photoIdentity(item.image)) && Boolean(item.title) && referenceContextMatches(plan, item.title || "") && plan.queries.some((q) => referenceTopicMatches(q, item.title || ""))
    && !(item.width && item.height && Math.max(item.width, item.height) < 320))
    .sort((a, b) => referencePhotoQuality(plan.queries[0], b.title || "", b) - referencePhotoQuality(plan.queries[0], a.title || "", a))
    .flatMap((item) => {
      const url = referencePhotoTicket(item.image!)
      if (!url) return []
      const link = item.link && isPublicReferenceUrl(item.link) ? item.link : item.image
      return [{ url, alt: cleanReferenceLabel(item.title || plan.topic), sourceUrl: link,
        credit: item.credit || ({ brave: "Brave Images", serper: "Serper Images", tavily: "Tavily Images", serpapi: "SerpApi Images", pixabay: "Pixabay", openverse: "Openverse" })[provider],
        ...(item.license ? { license: item.license } : {}) }]
    })
  return sanitizeReferenceImages(images).slice(0, plan.person ? 1 : 3)
}
async function request(provider: Provider, key: string, query: string, signal: AbortSignal): Promise<Photo[]> {
  const shared = { signal, cache: "no-store" as const, referrerPolicy: "no-referrer" as const, redirect: "error" as const }
  async function json(url: string, options: RequestInit = {}) {
    const response = await fetch(url, { ...shared, ...options })
    if (!response.ok) { pause(provider, response.status); await response.body?.cancel(); return null }
    return readReferenceJson(response, 256 * 1024)
  }
  if (provider === "brave") {
    const params = new URLSearchParams({ q: query, count: "8", safesearch: "strict" })
    const d = await json("https://api.search.brave.com/res/v1/images/search?" + params, { headers: { Accept: "application/json", "X-Subscription-Token": key } }) as { results?: Array<{ title?: string; url?: string; thumbnail?: { src?: string }; properties?: { url?: string; width?: number; height?: number } }> } | null
    return (d?.results || []).slice(0, 8).map((i) => ({ title: i.title, link: i.url,
      image: [i.thumbnail?.src, i.properties?.url].find((x) => x && isPublicReferenceUrl(x)), alternates: [i.properties?.url].filter((x): x is string => Boolean(x)), width: i.properties?.width, height: i.properties?.height }))
  }
  if (provider === "serper") {
    const d = await json("https://google.serper.dev/images", { method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-API-KEY": key },
      body: JSON.stringify({ q: query, num: 8, safe: "active" }) }) as { images?: Array<{ title?: string; link?: string; imageUrl?: string; thumbnailUrl?: string; imageWidth?: number; imageHeight?: number }> } | null
    return (d?.images || []).slice(0, 8).map((i) => ({ title: i.title, link: i.link,
      image: [i.thumbnailUrl, i.imageUrl].find((x) => x && isPublicReferenceUrl(x)), alternates: [i.imageUrl].filter((x): x is string => Boolean(x)), width: i.imageWidth, height: i.imageHeight }))
  }
  if (provider === "tavily") {
    const d = await json("https://api.tavily.com/search", { method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 3, include_images: true, include_image_descriptions: true, include_answer: false, include_raw_content: false }) }) as { images?: Array<string | { url?: string; description?: string }>; results?: Array<{ url?: string; title?: string; images?: Array<string | { url?: string; description?: string }> }> } | null
    const global = (d?.images || []).map((i) => typeof i === "string" ? { image: i } : { image: i.url, title: i.description })
    const linked = (d?.results || []).flatMap((page) => (page.images || []).map((i) => ({ image: typeof i === "string" ? i : i.url,
      title: typeof i === "string" ? page.title : i.description || page.title, link: page.url })))
    return [...linked, ...global].slice(0, 10)
  }
  if (provider === "serpapi") {
    const params = new URLSearchParams({ engine: "google_images", q: query, safe: "active", api_key: key })
    const d = await json("https://serpapi.com/search.json?" + params, { headers: { Accept: "application/json" } }) as { images_results?: Array<{ title?: string; link?: string; thumbnail?: string; original?: string; unsafe?: boolean; original_width?: number; original_height?: number }> } | null
    return (d?.images_results || []).slice(0, 10).map((i) => ({ title: i.title, link: i.link, unsafe: i.unsafe,
      image: [i.thumbnail, i.original].find((x) => x && isPublicReferenceUrl(x)), alternates: [i.original].filter((x): x is string => Boolean(x)), width: i.original_width, height: i.original_height }))
  }
  if (provider === "pixabay") {
    const params = new URLSearchParams({ key, q: query, image_type: "photo", safesearch: "true", per_page: "8", min_width: "640" })
    const d = await json("https://pixabay.com/api/?" + params) as { hits?: Array<{ tags?: string; pageURL?: string; webformatURL?: string; imageWidth?: number; imageHeight?: number; user?: string }> } | null
    return (d?.hits || []).slice(0, 8).map((i) => ({ title: i.tags, image: i.webformatURL, link: i.pageURL, width: i.imageWidth, height: i.imageHeight,
      credit: "Pixabay" + (i.user ? " · " + cleanReferenceLabel(i.user) : ""), license: "Pixabay Content License" }))
  }
  const params = new URLSearchParams({ q: query, page_size: "8", mature: "false", category: "photograph" })
  const d = await json("https://api.openverse.org/v1/images/?" + params) as { results?: Array<{ title?: string; url?: string; thumbnail?: string; foreign_landing_url?: string; mature?: boolean; width?: number; height?: number; creator?: string; license?: string; license_version?: string }> } | null
  return (d?.results || []).slice(0, 8).map((i) => ({ title: i.title, image: [i.thumbnail, i.url].find((x) => x && isPublicReferenceUrl(x)), alternates: [i.url].filter((x): x is string => Boolean(x)), link: i.foreign_landing_url,
    unsafe: i.mature, width: i.width, height: i.height, credit: "Openverse" + (i.creator ? " · " + cleanReferenceLabel(i.creator) : ""),
    license: [i.license?.toUpperCase(), i.license_version].filter(Boolean).join(" ") }))
}

/** One provider at a time per question; two active network calls per process. */
export async function findProviderReferenceImages(plan: ReferenceVisualPlan, signal: AbortSignal, options: { excludedUrls?: readonly string[] } = {}): Promise<MalikVisualImage[]> {
  if (signal.aborted || plan.kind === "tutorial" || plan.logo || !plan.queries[0]) return []
  const query = plan.queries[0].slice(0, 180)
  const excluded = new Set((options.excludedUrls || []).map(referencePhotoTarget).filter((value): value is string => Boolean(value)).map(photoIdentity))
  for (const [provider, env] of PROVIDERS) {
    if (signal.aborted) break
    const key = env ? process.env[env]?.trim() : ""
    if (env && !key) continue
    const cacheKey = provider + "|" + query.toLowerCase()
    const cached = candidateCache.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      const images = normalize(plan, provider, cached.photos, excluded)
      if (images.length) return images
      continue
    }
    if (!takeQuota(provider)) continue
    const attempt = AbortSignal.any([signal, AbortSignal.timeout(1800)])
    const release = await slot(attempt)
    if (!release) continue
    try {
      const photos = await request(provider, key || "", query, attempt)
      const images = normalize(plan, provider, photos, excluded)
      if (images.length) {
        for (const [oldKey, entry] of candidateCache) if (entry.expires <= Date.now()) candidateCache.delete(oldKey)
        while (candidateCache.size >= 100) candidateCache.delete(candidateCache.keys().next().value!)
        const bounded = photos.slice(0, 10).map((photo) => ({ ...photo, title: cleanReferenceLabel(photo.title || ""),
          image: photo.image?.slice(0, 1500), link: photo.link?.slice(0, 1500), alternates: photo.alternates?.slice(0, 1).map((url) => url.slice(0, 1500)),
          credit: cleanReferenceLabel(photo.credit || ""), license: photo.license?.slice(0, 80) }))
        candidateCache.set(cacheKey, { photos: bounded, expires: Date.now() + (provider === "pixabay" ? 86400000 : 600000) })
      }
      if (images.length) return images
    } catch { if (!signal.aborted) pause(provider) }
    finally { release() }
  }
  return []
}
