import type { ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"

export type MalikVisualImage = { url: string; alt: string; sourceUrl?: string; credit?: string; license?: string }
export const REFERENCE_METADATA_LIMIT = 48 * 1024
export const REFERENCE_RESULT_LIMIT = 8 * 1024
const IMAGE_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org", "images.unsplash.com", "images.pexels.com", "cdn.pixabay.com", "i.imgur.com"])

export function isSafeVisualUrl(value: string): boolean {
  try {
    if (!value || value.length > 1500) return false
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && IMAGE_HOSTS.has(url.hostname.toLowerCase())
  } catch { return false }
}

export function cleanReferenceLabel(value: string): string {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim().slice(0, 115)
}

/** Streaming size guard: never buffer an unbounded catalogue response. */
export async function readReferenceJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) return null
  if (Number(response.headers.get("content-length")) > REFERENCE_METADATA_LIMIT) {
    await response.body.cancel()
    return null
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ""
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > REFERENCE_METADATA_LIMIT) { await reader.cancel(); return null }
      text += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as unknown
  } finally { reader.releaseLock() }
}

/** Bounded and safe even when metadata is restored from browser storage. */
export function sanitizeReferenceImages(value: unknown): MalikVisualImage[] {
  if (!Array.isArray(value)) return []
  const images: MalikVisualImage[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.url !== "string" || typeof item.alt !== "string" || !isSafeVisualUrl(item.url)) continue
    const url = new URL(item.url)
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key)
    if (seen.has(url.href)) continue
    let sourceUrl: string | undefined
    try {
      const source = new URL(item.sourceUrl)
      if (source.protocol === "https:" && !source.username && !source.password && source.href.length < 1500
        && ["commons.wikimedia.org", "unsplash.com"].includes(source.hostname)) sourceUrl = source.href
    } catch { /* Attribution can be absent on model-authored Markdown. */ }
    const image = { url: url.href, alt: cleanReferenceLabel(item.alt), sourceUrl,
      credit: cleanReferenceLabel(item.credit || ""), license: cleanReferenceLabel(item.license || "") }
    if (new TextEncoder().encode(JSON.stringify([...images, image])).byteLength > REFERENCE_RESULT_LIMIT) break
    images.push(image)
    seen.add(url.href)
    if (images.length === 3) break
  }
  return images
}

type CommonsPage = { title?: string; index?: number; imageinfo?: Array<{ mime?: string; thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }> }

/** Runs in the browser for chat: neither metadata nor image bytes touch Render. */
export async function lookupReferenceImages(plan: ReferenceVisualPlan, signal?: AbortSignal): Promise<MalikVisualImage[]> {
  const totalSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(14000)])
  for (const topic of plan.queries.slice(0, 2)) {
    if (totalSignal.aborted) break
    const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", generator: "search",
      gsrsearch: topic, gsrnamespace: "6", gsrlimit: "6", prop: "imageinfo", iiprop: "url|mime|extmetadata",
      iiextmetadatafilter: "Artist|LicenseShortName", iiurlwidth: "480" })
    try {
      const response = await fetch("https://commons.wikimedia.org/w/api.php?" + params, {
        headers: { Accept: "application/json" }, credentials: "omit", referrerPolicy: "no-referrer",
        signal: AbortSignal.any([totalSignal, AbortSignal.timeout(7000)]),
      })
      const data = await readReferenceJson(response) as { query?: { pages?: CommonsPage[] } } | null
      const pages = Array.isArray(data?.query?.pages) ? data.query.pages : []
      const images = sanitizeReferenceImages(pages.sort((a, b) => (a.index || 0) - (b.index || 0)).flatMap((page) => {
        const media = page.imageinfo?.[0]
        // Never fall back to the multi-megabyte original when a thumbnail is missing.
        if (!media?.thumburl || !/^image\/(?:jpeg|png|webp)$/i.test(media.mime || "") || !media.descriptionurl) return []
        return [{ url: media.thumburl, sourceUrl: media.descriptionurl,
          alt: (page.title || plan.topic).replace(/^File:/i, "").replace(/\.[a-z\d]+$/i, "").replace(/_/g, " "),
          credit: media.extmetadata?.Artist?.value || "Wikimedia Commons", license: media.extmetadata?.LicenseShortName?.value || "" }]
      })).filter((image) => Boolean(image.sourceUrl))
      if (images.length) return images
    } catch { /* A catalogue outage must not interrupt the answer. */ }
  }
  return []
}
