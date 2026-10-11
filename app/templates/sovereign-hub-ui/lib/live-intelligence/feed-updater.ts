import { createHash } from "node:crypto"
import { fetchResearchResponse } from "../malik-research/bounded-fetch"
import { evidenceDate, safeEvidenceUrl, sanitizeEvidenceText, sourceAuthority } from "./evidence"
import { emptyKnowledgeIndex, modelsFromItems, type KnowledgeIndex, type KnowledgeItem } from "./knowledge-index"

export type KnowledgeFeed = { id: string; url: string; topic: string; kind: "rss" | "html" | "huggingface" | "releases" }
const hf = (author: string): KnowledgeFeed => ({ id: `hf-${author}`, topic: "ai", kind: "huggingface", url: `https://huggingface.co/api/models?author=${author}&sort=lastModified&direction=-1&limit=12&full=true` })
const news = (id: string, query: string): KnowledgeFeed => ({ id, topic: id, kind: "rss", url: `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:1d")}&hl=ru&gl=KZ&ceid=KZ:ru` })
export const KNOWLEDGE_FEEDS: KnowledgeFeed[] = [
  { id: "openai", url: "https://openai.com/news/rss.xml", topic: "ai", kind: "rss" },
  { id: "anthropic", url: "https://www.anthropic.com/news", topic: "ai", kind: "html" },
  { id: "deepmind", url: "https://deepmind.google/blog/rss.xml", topic: "ai", kind: "rss" },
  { id: "mistral", url: "https://mistral.ai/news", topic: "ai", kind: "html" },
  { id: "xai", url: "https://x.ai/news", topic: "ai", kind: "html" },
  ...["openai", "google", "meta-llama", "deepseek-ai", "Qwen", "mistralai"].map(hf),
  { id: "nextjs", url: "https://api.github.com/repos/vercel/next.js/releases?per_page=12", topic: "software", kind: "releases" },
  { id: "react", url: "https://api.github.com/repos/facebook/react/releases?per_page=8", topic: "software", kind: "releases" },
  news("kazakhstan", "Казахстан технологии"), news("world", "мировые новости"), news("science", "научное исследование открытие"),
  news("space", "космос NASA ESA"), news("business", "экономика бизнес"), news("international", "международные события"),
  news("products", "новый продукт запуск"), news("apis", "API changelog"), news("technology", "программирование технологии"),
]

const xmlText = (value: string) => sanitizeEvidenceText(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1").replace(/<[^>]*>/gu, " ").replace(/&amp;/gu, "&").replace(/&quot;/gu, '"').replace(/&lt;/gu, "<").replace(/&gt;/gu, ">"))
export function parseKnowledgeFeed(feed: KnowledgeFeed, raw: string, checkedAt: string): KnowledgeItem[] {
  const now = Date.parse(checkedAt)
  const make = (title: string, link: string, snippet: string, published: unknown, dateKind: KnowledgeItem["dateKind"] = "publication"): KnowledgeItem | null => {
    const url = safeEvidenceUrl(link), publishedAt = dateKind === "publication" ? evidenceDate(published, now) : undefined
    if (!url || !title.trim()) return null
    const authority = sourceAuthority(feed.topic === "ai" ? "AI model" : feed.topic === "software" ? "library version" : feed.topic, url)
    return { id: createHash("sha256").update(url).digest("hex").slice(0, 24), topic: feed.topic, title: sanitizeEvidenceText(title, 180), url, domain: new URL(url).hostname, snippet: sanitizeEvidenceText(snippet.trim() ? snippet : `Feed headline only; article text not fetched: ${title}`, 1800), publishedAt, ...(dateKind === "repository-update" ? { updatedAt: evidenceDate(published, now) } : {}), checkedAt, dateKind: publishedAt ? "publication" : dateKind === "repository-update" ? dateKind : "unknown", authority, provider: feed.id }
  }
  const out: KnowledgeItem[] = []
  if (feed.kind === "rss") {
    for (const match of raw.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/giu)) {
      const block = match[1], tag = (name: string) => block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "iu"))?.[1] || ""
      const link = xmlText(tag("link")) || block.match(/<link[^>]+href=["']([^"']+)["']/iu)?.[1] || ""
      const item = make(xmlText(tag("title")), link, xmlText(tag("description") || tag("summary") || tag("content:encoded")), xmlText(tag("pubDate") || tag("published")))
      if (item) out.push(item)
      if (out.length >= 25) break
    }
  } else if (feed.kind === "html") {
    const base = new URL(feed.url)
    for (const match of raw.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
      let url: URL
      try { url = new URL(match[1], base) } catch { continue }
      if (url.hostname !== base.hostname || !/^\/news\/.+/u.test(url.pathname)) continue
      // A listing without an explicit publication date is only a primary mention.
      const item = make(xmlText(match[2]), url.href, "Official news listing; publication date not established", undefined, "unknown")
      if (item) out.push(item)
      if (out.length >= 20) break
    }
  } else {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) throw new Error("Unexpected feed format")
    for (const record of data.slice(0, 25)) {
      if (feed.kind === "releases") {
        if (record.draft || record.prerelease) continue
        const item = make(String(record.name || record.tag_name || ""), String(record.html_url || ""), String(record.body || ""), record.published_at)
        if (item) out.push(item)
      } else {
        if (typeof record.id !== "string" || record.private) continue
        const item = make(record.id, "https://huggingface.co/" + record.id, `Model repository. Pipeline: ${String(record.pipeline_tag || "not supplied")}. Repository modification is NOT announcement or availability.`, record.lastModified, "repository-update")
        if (item) out.push(item)
      }
    }
  }
  return [...new Map(out.map((item) => [item.id, item])).values()]
}

export async function updateKnowledgeIndex(previous: KnowledgeIndex | null, options: {
  now?: Date; feeds?: KnowledgeFeed[]; runId?: string
  fetcher?: (feed: KnowledgeFeed, headers: Record<string, string>) => Promise<Response>
} = {}): Promise<KnowledgeIndex> {
  const now = options.now || new Date(), checkedAt = now.toISOString()
  const next = structuredClone(previous || emptyKnowledgeIndex(checkedAt))
  next.lastAttemptAt = checkedAt; next.runId = options.runId || checkedAt.slice(0, 13)
  const items = new Map(next.items.map((item) => [item.id, item]))
  const feeds = options.feeds || KNOWLEDGE_FEEDS
  let cursor = 0, successful = 0
  const fetcher = options.fetcher || ((feed, headers) => fetchResearchResponse(feed.url, { headers: { accept: "application/json,application/rss+xml,text/html", "user-agent": "Malik-Live-Knowledge/1.0", ...headers }, redirect: "error", cache: "no-store" }, 6000, 1024 * 1024))
  async function worker() {
    while (cursor < feeds.length) {
      const feed = feeds[cursor++], prior = next.feeds[feed.id]
      try {
        const headers: Record<string, string> = {}
        if (prior?.etag) headers["if-none-match"] = prior.etag
        if (prior?.modified) headers["if-modified-since"] = prior.modified
        const response = await fetcher(feed, headers)
        if (response.status === 304 && prior?.lastSuccessAt) {
          next.feeds[feed.id] = { ...prior, checkedAt, lastSuccessAt: checkedAt, error: undefined }
          // Revalidation refreshes check time, never publication/announcement time.
          for (const [id, item] of items) if (item.provider === feed.id) items.set(id, { ...item, checkedAt })
          successful++; continue
        }
        if (!response.ok) throw new Error(`HTTP_${response.status}`)
        const fresh = parseKnowledgeFeed(feed, await response.text(), checkedAt)
        if (!fresh.length) throw new Error("NO_USABLE_ENTRIES")
        for (const item of fresh) items.set(item.id, item)
        next.feeds[feed.id] = { checkedAt, lastSuccessAt: checkedAt, count: fresh.length, etag: response.headers.get("etag") || undefined, modified: response.headers.get("last-modified") || undefined }
        successful++
      } catch (error) {
        const reason = error instanceof Error && /^HTTP_\d{3}$|^NO_USABLE_ENTRIES$|^Unexpected feed format$/u.test(error.message) ? error.message : "FETCH_OR_PARSE_FAILED"
        next.feeds[feed.id] = { checkedAt, lastSuccessAt: prior?.lastSuccessAt || null, count: prior?.count || 0, error: reason, etag: prior?.etag, modified: prior?.modified }
        next.errors.push({ feed: feed.id, at: checkedAt, reason })
      }
    }
  }
  await Promise.all([worker(), worker()])
  next.items = [...items.values()].filter((item) => Date.parse(item.checkedAt) <= now.getTime() && now.getTime() - Date.parse(item.checkedAt) < 90 * 86_400_000).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt) || a.id.localeCompare(b.id)).slice(0, 500)
  next.models = modelsFromItems(next.items); next.errors = next.errors.slice(-50)
  if (successful) next.lastSuccessAt = checkedAt
  return next
}
