import type { ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"

export type MalikVisualImage = { url: string; alt: string; sourceUrl?: string; credit?: string; license?: string }
export const REFERENCE_METADATA_LIMIT = 48 * 1024
export const REFERENCE_RESULT_LIMIT = 8 * 1024
const IMAGE_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org", "images.unsplash.com", "images.pexels.com", "cdn.pixabay.com", "i.imgur.com", "ipcdn-web.apple.com"])

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
        && ["commons.wikimedia.org", "unsplash.com", "support.apple.com", "en.wikipedia.org", "ru.wikipedia.org", "kk.wikipedia.org"].includes(source.hostname)) sourceUrl = source.href
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

/** Verified official screen examples. URLs only; no screenshots stored on Render. */
function officialScreen(plan: ReferenceVisualPlan): MalikVisualImage[] {
  if (plan.kind !== "tutorial" || !plan.visualDevice?.some((term) => ["iphone", "ios", "ipad"].includes(term))) return []
  const screens = [
    { terms: ["haptic", "vibrat", "вибрац", "тактил", "ringtone"], id: "f56abde2-8ea5-4060-a1eb-ea260b86ce19", alt: "iPhone · Звуки и тактильные сигналы" },
    { terms: ["privacy", "приватност"], id: "d6aea7a7-a42a-456a-9826-c34ecb72b8c6", alt: "iPhone · Конфиденциальность и безопасность" },
  ]
  const screen = screens.find((entry) => entry.terms.some((term) => plan.visualTerms?.includes(term)))
  return screen ? [{ url: "https://ipcdn-web.apple.com/assets/v2/web/" + screen.id, alt: screen.alt,
    sourceUrl: "https://support.apple.com/guide/iphone/make-your-iphone-your-own-iphefb3daa42/ios", credit: "Apple Support" }] : []
}

async function lookupArticleImages(plan: ReferenceVisualPlan, signal: AbortSignal): Promise<MalikVisualImage[]> {
  // Article thumbnails improve coverage for RU/KZ questions and abstract concepts.
  // An article photo is never passed off as a settings screenshot.
  if (plan.kind === "tutorial") return []
  for (const topic of plan.queries.slice(0, 2)) {
    if (signal.aborted) break
    const language = /[әғқңөұүһі]/iu.test(topic) ? "kk" : /[а-яё]/iu.test(topic) ? "ru" : "en"
    const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", generator: "search", gsrsearch: topic,
      gsrnamespace: "0", gsrlimit: "3", prop: "pageimages|info", inprop: "url", piprop: "thumbnail", pithumbsize: "480", pilicense: "free" })
    try {
      const response = await fetch("https://" + language + ".wikipedia.org/w/api.php?" + params, {
        headers: { Accept: "application/json" }, credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
      })
      const data = await readReferenceJson(response) as { query?: { pages?: Array<{ title?: string; index?: number; fullurl?: string; thumbnail?: { source?: string } }> } } | null
      const images = sanitizeReferenceImages((data?.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0)).flatMap((page) => page.thumbnail?.source && page.fullurl
        ? [{ url: page.thumbnail.source, alt: page.title || plan.topic, sourceUrl: page.fullurl, credit: "Wikipedia · Wikimedia Commons" }] : []))
      if (images.length) return images
    } catch { /* Keep the text answer usable. */ }
  }
  return []
}

/** Runs in the browser for chat: neither metadata nor image bytes touch Render. */
export async function lookupReferenceImages(plan: ReferenceVisualPlan, signal?: AbortSignal): Promise<MalikVisualImage[]> {
  if (signal?.aborted) return []
  const official = officialScreen(plan)
  if (official.length) return sanitizeReferenceImages(official)
  const totalSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(14000)])
  for (const topic of plan.queries.slice(0, 2)) {
    if (totalSignal.aborted) break
    const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", generator: "search",
      gsrsearch: topic, gsrnamespace: "6", gsrlimit: "6", prop: "imageinfo", iiprop: "url|mime|extmetadata",
      iiextmetadatafilter: "Artist|LicenseShortName", iiurlwidth: "480" })
    try {
      const response = await fetch("https://commons.wikimedia.org/w/api.php?" + params, {
        headers: { Accept: "application/json" }, credentials: "omit", referrerPolicy: "no-referrer",
        // Reserve time for article thumbnails even when both Commons queries stall.
        signal: AbortSignal.any([totalSignal, AbortSignal.timeout(3000)]),
      })
      const data = await readReferenceJson(response) as { query?: { pages?: CommonsPage[] } } | null
      const pages = Array.isArray(data?.query?.pages) ? data.query.pages : []
      const images = sanitizeReferenceImages(pages.sort((a, b) => (a.index || 0) - (b.index || 0)).flatMap((page) => {
        const media = page.imageinfo?.[0]
        // For interface tutorials, reject random product photos and screenshots
        // of unrelated settings (even if Commons ranked them highly).
        const fileTitle = String(page.title || "").toLocaleLowerCase()
        if (plan.kind === "tutorial" && (!plan.visualDevice?.some((term) => fileTitle.includes(term))
          || !plan.visualTerms?.some((term) => fileTitle.includes(term)))) return []
        // Never fall back to the multi-megabyte original when a thumbnail is missing.
        if (!media?.thumburl || !/^image\/(?:jpeg|png|webp)$/i.test(media.mime || "") || !media.descriptionurl) return []
        return [{ url: media.thumburl, sourceUrl: media.descriptionurl,
          alt: (page.title || plan.topic).replace(/^File:/i, "").replace(/\.[a-z\d]+$/i, "").replace(/_/g, " "),
          credit: media.extmetadata?.Artist?.value || "Wikimedia Commons", license: media.extmetadata?.LicenseShortName?.value || "" }]
      })).filter((image) => Boolean(image.sourceUrl))
      if (images.length) return images
    } catch { /* A catalogue outage must not interrupt the answer. */ }
  }
  return lookupArticleImages(plan, totalSignal)
}
