import { evidenceDate } from "./evidence"
/** Only explicit page metadata: body years and HTTP Last-Modified are not publication dates. */
export function pageDates(html: string, now = Date.now()) {
  const head = html.slice(0, 200_000)
  const meta = (name: string) => {
    for (const tag of head.matchAll(/<meta\s[^>]+>/giu)) {
      const key = tag[0].match(/(?:property|name)=["']([^"']+)["']/iu)?.[1]
      if (key?.toLowerCase() === name) return evidenceDate(tag[0].match(/content=["']([^"']+)["']/iu)?.[1], now)
    }
    return undefined
  }
  let publishedAt = meta("article:published_time"), updatedAt = meta("article:modified_time")
  for (const block of head.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      const data = JSON.parse(block[1])
      const nodes = Array.isArray(data) ? data : Array.isArray(data?.["@graph"]) ? data["@graph"] : [data]
      for (const node of nodes.slice(0, 50)) if (/Article|NewsArticle|BlogPosting/u.test(String(node?.["@type"]))) {
        publishedAt ||= evidenceDate(node.datePublished, now); updatedAt ||= evidenceDate(node.dateModified, now)
      }
    } catch { /* Broken structured data is not a date. */ }
  }
  return { publishedAt, updatedAt }
}
