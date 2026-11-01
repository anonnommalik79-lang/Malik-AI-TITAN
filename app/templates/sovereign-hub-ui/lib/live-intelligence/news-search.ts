import { classifyFreshness, type FreshnessIntent } from "../ai/freshness-intent"
import type { MalikWebSource } from "../ai/web-research-types"
import { cleanTitle, decodeHtml, domainOf, fetchWithTimeout, stripHtml } from "../malik-research/utils"
import { datedNewsQuery } from "./search-time-filters"
import { assessSources, currentNewsSources } from "./evidence"

/** Existing free news RSS fallback, shared by chat and the research/voice entry points. */
export async function searchNewsFeed(query: string, limit: number, signal?: AbortSignal, intent: FreshnessIntent = classifyFreshness(query)): Promise<MalikWebSource[]> {
  const russian = /[а-яёәіңғүұқөһ]/iu.test(query)
  const url = new URL("https://news.google.com/rss/search")
  url.searchParams.set("q", datedNewsQuery(query, intent))
  url.searchParams.set("hl", russian ? "ru" : "en-US")
  url.searchParams.set("gl", russian ? "KZ" : "US")
  url.searchParams.set("ceid", russian ? "KZ:ru" : "US:en")
  const response = await fetchWithTimeout(url.toString(), {}, 6000, signal)
  if (!response.ok) return []
  const xml = await response.text(), sources: MalikWebSource[] = [], seen = new Set<string>()
  const text = (value: string) => stripHtml(decodeHtml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1"))).replace(/\s+/gu, " ").trim()
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/giu)) {
    const block = match[1]
    const field = (name: string) => text(block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "")
    const link = field("link"), title = cleanTitle(field("title")), publisher = cleanTitle(field("source"))
    if (!/^https?:\/\//iu.test(link) || link.length > 4096 || !title || seen.has(link)) continue
    seen.add(link)
    sources.push({ title, url: link, domain: domainOf(link), snippet: [publisher, field("description") || title].filter(Boolean).join(". ").slice(0, 2400), publishedAt: field("pubDate") || undefined, provider: "google-news" })
    if (sources.length >= 200) break
  }
  // RSS search order is not necessarily chronological. Assess the bounded
  // candidate pool before slicing, so a recent item later in the feed survives.
  return currentNewsSources(query, assessSources(query, sources, intent), intent).slice(0, Math.max(1, Math.min(20, limit)))
}
