import type { ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"
import { cleanReferenceLabel, isSafeVisualUrl, readReferenceJson, referenceTopicMatches, sanitizeReferenceImages, type MalikVisualImage } from "./reference-catalog"

// Server-only image discovery. Indexing a photograph does not grant reuse rights.
type Provider = "brave" | "serper" | "tavily" | "serpapi"
type Photo = { image?: string; title?: string; link?: string; unsafe?: boolean }
const PROVIDERS: Array<[Provider, string]> = [
  ["brave", "BRAVE_SEARCH_API_KEY"], ["serper", "SERPER_API_KEY"],
  ["tavily", "TAVILY_API_KEY"], ["serpapi", "SERPAPI_API_KEY"],
]
let started = 0
let count = 0
function quota(): boolean {
  if (Date.now() - started > 60000) { started = Date.now(); count = 0 }
  return ++count <= 24
}
function publicPage(value?: string): string | undefined {
  try {
    const parsed = new URL(value || "")
    const host = parsed.hostname.toLowerCase()
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.href.length > 1500 ||
      !host.includes(".") || host.endsWith(".local") || /^\d+(?:\.\d+){3}$/u.test(host)) return
    return parsed.href
  } catch { return }
}
function normalize(plan: ReferenceVisualPlan, provider: Provider, candidates: Photo[]): MalikVisualImage[] {
  const images = candidates.filter((item) => !item.unsafe && item.image && isSafeVisualUrl(item.image) &&
    Boolean(item.title) && plan.queries.some((q) => referenceTopicMatches(q, item.title || "")))
    .map((item) => ({
      url: item.image!, alt: cleanReferenceLabel(item.title || plan.topic),
      sourceUrl: publicPage(item.link), credit: provider === "brave" ? "Brave Images" :
        provider === "serper" ? "Serper Images" : provider === "tavily" ? "Tavily Images" : "SerpApi Images",
    }))
  return sanitizeReferenceImages(images).slice(0, plan.person ? 1 : 3)
}
async function request(provider: Provider, key: string, query: string, signal: AbortSignal): Promise<Photo[]> {
  const shared = { signal: AbortSignal.any([signal, AbortSignal.timeout(2400)]), cache: "no-store" as const, referrerPolicy: "no-referrer" as const }
  if (provider === "brave") {
    const params = new URLSearchParams({ q: query, count: "8", safesearch: "strict" })
    const r = await fetch("https://api.search.brave.com/res/v1/images/search?" + params, { ...shared, headers: { Accept: "application/json", "X-Subscription-Token": key } })
    const d = await readReferenceJson(r, 192 * 1024) as { results?: Array<{ title?: string; url?: string; thumbnail?: { src?: string }; properties?: { url?: string } }> } | null
    return (d?.results || []).slice(0, 8).map((i) => ({ title: i.title, link: i.url,
      image: [i.properties?.url, i.thumbnail?.src].find((x) => x && isSafeVisualUrl(x)) }))
  }
  if (provider === "serper") {
    const r = await fetch("https://google.serper.dev/images", { ...shared, method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-API-KEY": key },
      body: JSON.stringify({ q: query, num: 8, safe: "active" }) })
    const d = await readReferenceJson(r, 192 * 1024) as { images?: Array<{ title?: string; link?: string; imageUrl?: string; thumbnailUrl?: string }> } | null
    return (d?.images || []).slice(0, 8).map((i) => ({ title: i.title, link: i.link,
      image: [i.imageUrl, i.thumbnailUrl].find((x) => x && isSafeVisualUrl(x)) }))
  }
  if (provider === "tavily") {
    const r = await fetch("https://api.tavily.com/search", { ...shared, method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 3, include_images: true, include_image_descriptions: true, include_answer: false, include_raw_content: false }) })
    const d = await readReferenceJson(r, 192 * 1024) as { images?: Array<string | { url?: string; description?: string }>;
      results?: Array<{ url?: string; title?: string; images?: Array<string | { url?: string; description?: string }> }> } | null
    const global = (d?.images || []).map((i) => typeof i === "string" ? { image: i } : { image: i.url, title: i.description })
    const linked = (d?.results || []).flatMap((page) => (page.images || []).map((i) => ({
      image: typeof i === "string" ? i : i.url, title: typeof i === "string" ? page.title : i.description || page.title, link: page.url,
    })))
    return [...linked, ...global].slice(0, 10)
  }
  const params = new URLSearchParams({ engine: "google_images", q: query, safe: "active", api_key: key })
  const r = await fetch("https://serpapi.com/search.json?" + params, { ...shared, headers: { Accept: "application/json" } })
  const d = await readReferenceJson(r, 256 * 1024) as { images_results?: Array<{ title?: string; link?: string; thumbnail?: string; original?: string; unsafe?: boolean }> } | null
  return (d?.images_results || []).slice(0, 10).map((i) => ({ title: i.title, link: i.link, unsafe: i.unsafe,
    image: [i.original, i.thumbnail].find((x) => x && isSafeVisualUrl(x)) }))
}
/** Sequential bounded fallback: do not bill every provider on every request. */
export async function findProviderReferenceImages(plan: ReferenceVisualPlan, signal: AbortSignal): Promise<MalikVisualImage[]> {
  if (signal.aborted || plan.kind === "tutorial" || plan.logo || !plan.queries[0]) return []
  const query = plan.queries[0].slice(0, 180)
  for (const [provider, env] of PROVIDERS) {
    if (signal.aborted) break
    const key = process.env[env]?.trim()
    if (!key || !quota()) continue
    try {
      const images = normalize(plan, provider, await request(provider, key, query, signal))
      if (images.length) return images
    } catch { /* Provider unavailable, exhausted or slow. Try the next configured key. */ }
  }
  return []
}
