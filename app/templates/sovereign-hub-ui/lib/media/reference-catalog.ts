import type { ReferenceVisualPlan } from "@/lib/ai/reference-visual-policy"
import { officialIPhonePhoto } from "./official-product-photos"
import { verifiedPortrait } from "./verified-portraits"
import { referenceBrandAsset } from "./reference-brand-assets"

export type MalikVisualImage = { url: string; alt: string; sourceUrl?: string; credit?: string; license?: string; role?: "logo" }
export const REFERENCE_METADATA_LIMIT = 48 * 1024
export const REFERENCE_RESULT_LIMIT = 8 * 1024
const IMAGE_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org", "images.unsplash.com", "images.pexels.com", "cdn.pixabay.com", "i.imgur.com", "ipcdn-web.apple.com", "cdsassets.apple.com"])

export function isSafeVisualUrl(value: string): boolean {
  if (value === "/reference-photos/elon-musk.jpg") return true
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
    const url = new URL(item.url, "https://malikaiworld.world")
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key)
    if (seen.has(url.href)) continue
    let sourceUrl: string | undefined
    try {
      const source = new URL(item.sourceUrl)
      if (source.protocol === "https:" && !source.username && !source.password && source.href.length < 1500
        && ["commons.wikimedia.org", "unsplash.com", "support.apple.com", "en.wikipedia.org", "ru.wikipedia.org", "kk.wikipedia.org"].includes(source.hostname)) sourceUrl = source.href
    } catch { /* Attribution can be absent on model-authored Markdown. */ }
    const safeUrl = item.url.startsWith("/") ? url.pathname : url.href
    const image = { url: safeUrl, alt: cleanReferenceLabel(item.alt), sourceUrl,
      credit: cleanReferenceLabel(item.credit || ""), license: cleanReferenceLabel(item.license || ""), ...(item.role === "logo" ? { role: "logo" as const } : {}) }
    if (new TextEncoder().encode(JSON.stringify([...images, image])).byteLength > REFERENCE_RESULT_LIMIT) break
    images.push(image)
    seen.add(url.href)
    if (images.length === 3) break
  }
  return images
}

type CommonsPage = { title?: string; index?: number; imageinfo?: Array<{ mime?: string; thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }> }

function titleWords(text: string): string[] {
  return text.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/^file:/u, "").split(/[^\p{L}\p{N}]+/u).filter((word) => (word.length > 1 || /^\d+$/u.test(word)) && !["the", "of", "in", "and"].includes(word))
}

function unrelatedNamesake(query: string, title: string): boolean {
  const namesakes = /(?:airport|university|station|statue|museum|autograph|signature|аэропорт|университет|памятник|станци[яи]|автограф|подпись|мұражай|әуежай)/giu
  const words = title.toLowerCase().match(namesakes) || []
  return words.some((word) => !query.toLowerCase().includes(word))
}

function catalogueHeaders(): Record<string, string> {
  return typeof window === "undefined"
    ? { Accept: "application/json", "User-Agent": "MalikAI/1.0 (https://malikaiworld.world)" }
    : { Accept: "application/json" }
}

/** Identity/model searches must not return an airport, namesake or another model. */
export function referenceTitleScore(query: string, title: string): number {
  const wanted = titleWords(query), actual = titleWords(title)
  if (!wanted.length || !actual.length) return 0
  if (/(?:iphone|galaxy|pixel)/iu.test(query)) {
    const variants = ["pro", "max", "plus", "ultra", "mini", "air", "fold", "flip"]
    if (variants.some((word) => wanted.includes(word) !== actual.includes(word))) return 0
  }
  const matched = wanted.filter((word) => actual.includes(word)).length
  return matched === wanted.length ? matched / actual.length : 0
}

/** Search rank alone is insufficient: every subject word must occur in metadata. */
export function referenceTitleCoverage(query: string, title: string): number {
  const wanted = [...new Set(titleWords(query))]
  const actual = new Set(titleWords(title))
  return wanted.length ? wanted.filter((word) => actual.has(word)).length / wanted.length : 0
}

export function referenceTopicMatches(query: string, metadata: string): boolean {
  const descriptors = new Set(["photo", "photos", "image", "images", "picture", "pictures", "diagram", "illustration", "фото", "фотографии", "схема"])
  const wanted = titleWords(query).filter((word) => !descriptors.has(word))
  const actual = titleWords(metadata.replace(/<[^>]*>/gu, " ").slice(0, 4096))
  return Boolean(wanted.length && wanted.every((word) => actual.includes(word)
    || (word.length > 4 && actual.some((term) => term === word.replace(/s$/u, "") || term.replace(/s$/u, "") === word))))
}

type LookupOptions = { excludedUrls?: string[]; skipOfficial?: boolean; fast?: boolean }

function wasExcluded(url: string, options: LookupOptions): boolean {
  if (!options.excludedUrls?.length) return false
  try {
    const normalized = new URL(url, "https://malikaiworld.world")
    for (const key of [...normalized.searchParams.keys()]) if (key.startsWith("utm_")) normalized.searchParams.delete(key)
    return options.excludedUrls.includes(url.startsWith("/") ? normalized.pathname : normalized.href)
  } catch { return true }
}

type ArticlePage = { title?: string; index?: number; fullurl?: string; thumbnail?: { source?: string }; pageprops?: Record<string, unknown>; langlinks?: Array<{ lang?: string; title?: string }> }

function canonicalArticleTitle(topic: string, redirects: Array<{ from?: string; to?: string }>): string {
  const normalize = (value: string) => value.replace(/_/gu, " ").normalize("NFKC").toLowerCase().trim()
  let name = topic
  for (let count = 0; count < 6; count++) {
    const next = redirects.find((entry) => normalize(entry.from || "") === normalize(name))?.to
    if (!next || normalize(next) === normalize(name)) break
    name = next
  }
  return name
}

/** Same file on Wikimedia's other thumbnail host; never an unrelated replacement. */
export function referenceThumbnailVariants(url: string): string[] {
  if (!isSafeVisualUrl(url) || url.startsWith("/")) return [url]
  const parsed = new URL(url)
  if (parsed.hostname !== "thumb.wikimedia.org" || !/^\/wikipedia\/[a-z]+\/thumb\//u.test(parsed.pathname)) return [url]
  const alternate = new URL(parsed)
  alternate.hostname = "upload.wikimedia.org"
  return [url, alternate.href]
}

function hasRasterThumbnail(mime: string, url: string): boolean {
  if (!isSafeVisualUrl(url)) return false
  if (/^image\/(?:jpeg|png|webp)$/iu.test(mime)) return true
  // Science and how-to illustrations often originate as SVG/GIF, but Wikimedia
  // serves a small raster preview. Accept that preview, never the original SVG.
  return /^image\/(?:svg\+xml|gif)$/iu.test(mime) && /\.(?:png|jpe?g|webp)$/iu.test(new URL(url).pathname)
}

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

async function lookupArticleImages(plan: ReferenceVisualPlan, signal: AbortSignal, options: LookupOptions): Promise<MalikVisualImage[]> {
  // Article thumbnails improve coverage for RU/KZ questions and abstract concepts.
  // An article photo is never passed off as a settings screenshot.
  if (plan.kind === "tutorial") return []
  const topics = [...plan.queries.slice(0, 2)]
  for (const topic of topics) {
    if (signal.aborted) break
    const language = /[әғқңөұүһі]/iu.test(topic) ? "kk" : /[а-яё]/iu.test(topic) ? "ru" : "en"
    const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", generator: "search", gsrsearch: topic,
      gsrnamespace: "0", gsrlimit: "3", prop: "pageimages|info|pageprops|langlinks", inprop: "url", piprop: "thumbnail", pithumbsize: "480", pilicense: "free", lllang: "en", lllimit: "1" })
    if (plan.entity) {
      // Canonical article/redirect lookup avoids searching for similarly named places.
      for (const field of ["generator", "gsrsearch", "gsrnamespace", "gsrlimit"]) params.delete(field)
      params.set("titles", topic)
      params.set("redirects", "1")
    }
    try {
      const response = await fetch("https://" + language + ".wikipedia.org/w/api.php?" + params, {
        headers: catalogueHeaders(), credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]),
      })
      const data = await readReferenceJson(response) as { query?: { pages?: ArticlePage[]; redirects?: Array<{ from?: string; to?: string }>; normalized?: Array<{ from?: string; to?: string }> } } | null
      const canonical = canonicalArticleTitle(topic, [...(data?.query?.normalized || []), ...(data?.query?.redirects || [])])
      const pages = (data?.query?.pages || []).sort((a, b) => plan.entity
        ? referenceTitleScore(topic, b.title || "") - referenceTitleScore(topic, a.title || "") || (a.index || 0) - (b.index || 0)
        : (a.index || 0) - (b.index || 0))
      const relevant = pages.filter((page) => !Object.hasOwn(page.pageprops || {}, "disambiguation") && (plan.entity
        ? (referenceTitleScore(canonical, page.title || "") >= 0.65 && !unrelatedNamesake(topic, page.title || "")) : referenceTopicMatches(topic, page.title || "")))
      const images = sanitizeReferenceImages(relevant.flatMap((page) => {
        if (!page.thumbnail?.source || !page.fullurl) return []
        const url = referenceThumbnailVariants(page.thumbnail.source).find((candidate) => !wasExcluded(candidate, options))
        return url ? [{ url, alt: page.title || plan.topic, sourceUrl: page.fullurl, credit: "Wikipedia · Wikimedia Commons" }] : []
      }))
      if (images.length) return plan.entity ? images.slice(0, 1) : images
      // The English article often has a free portrait when the local edition does not.
      if (plan.person && topics.length < 3) for (const page of relevant) {
        const english = page.langlinks?.find((link) => link.lang === "en")?.title
        if (english && !topics.includes(english)) { topics.push(english); break }
      }
    } catch { /* Keep the text answer usable. */ }
  }
  return []
}

/** Resolve full/middle names through article search, with the full name in source text. */
async function lookupPersonSearchImages(plan: ReferenceVisualPlan, signal: AbortSignal, options: LookupOptions): Promise<MalikVisualImage[]> {
  for (const topic of plan.queries.slice(0, 2)) {
    if (signal.aborted) break
    const language = /[әғқңөұүһі]/iu.test(topic) ? "kk" : /[а-яё]/iu.test(topic) ? "ru" : "en"
    const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", list: "search",
      srsearch: '"' + topic + '"', srnamespace: "0", srlimit: "3", srprop: "snippet" })
    try {
      const response = await fetch("https://" + language + ".wikipedia.org/w/api.php?" + params, {
        headers: catalogueHeaders(), credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      })
      const data = await readReferenceJson(response) as { query?: { search?: Array<{ title?: string; snippet?: string }> } } | null
      const words = titleWords(topic), core = [words[0], words.at(-1)].filter((word): word is string => Boolean(word))
      const titles = (data?.query?.search || []).filter((page) => {
        const title = page.title || ""
        return !unrelatedNamesake(topic, title) && !/(?:\bfilm\b|\bmovie\b|\bbook\b|\bmap\b|фильм|книга|карта)/iu.test(title)
          && (referenceTitleCoverage(topic, title) >= 0.65 || (core.length === 2 && core.every((word) => titleWords(title).includes(word))))
          && referenceTopicMatches(topic, title + " " + (page.snippet || ""))
      }).flatMap((page) => page.title ? [page.title] : []).slice(0, 2)
      if (titles.length) {
        const images = await lookupArticleImages({ ...plan, queries: titles }, signal, options)
        if (images.length) return images.slice(0, 1)
      }
    } catch { /* Retry from cache/server without interrupting the answer. */ }
  }
  return []
}

/** Company logos are searched as logos, never replaced by an office/photo. */
async function lookupLogoImages(plan: ReferenceVisualPlan, signal: AbortSignal, options: LookupOptions): Promise<MalikVisualImage[]> {
  for (const topic of plan.queries.slice(0, 2)) {
    if (signal.aborted) break
    const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", generator: "search",
      gsrsearch: topic + " logo", gsrnamespace: "6", gsrlimit: "5", prop: "imageinfo", iiprop: "mime|url|extmetadata",
      iiurlwidth: "250", iiextmetadatafilter: "Artist|LicenseShortName" })
    try {
      const response = await fetch("https://commons.wikimedia.org/w/api.php?" + params, { headers: catalogueHeaders(),
        credentials: "omit", referrerPolicy: "no-referrer", signal })
      const data = await readReferenceJson(response) as { query?: { pages?: CommonsPage[] } } | null
      const images = sanitizeReferenceImages((data?.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0)).flatMap((page) => {
        const title = page.title || "", media = page.imageinfo?.[0]
        if (!/logo|symbol|wordmark|logotype|логотип/iu.test(title) || !referenceTopicMatches(topic, title) || unrelatedNamesake(topic, title)) return []
        if (!media?.thumburl || !media.descriptionurl || !hasRasterThumbnail(media.mime || "", media.thumburl)) return []
        const url = referenceThumbnailVariants(media.thumburl).find((candidate) => !wasExcluded(candidate, options))
        return url ? [{ url, sourceUrl: media.descriptionurl, alt: plan.topic + " · логотип", role: "logo",
          credit: media.extmetadata?.Artist?.value || "Wikimedia Commons", license: media.extmetadata?.LicenseShortName?.value || "" }] : []
      }))
      if (images.length) return images.slice(0, 1)
    } catch { /* Keep the name/description instead of substituting a stock photo. */ }
  }
  return []
}

/** Browser-first metadata lookup; the server uses this same bounded catalogue. */
export async function lookupReferenceImages(plan: ReferenceVisualPlan, signal?: AbortSignal, options: LookupOptions = {}): Promise<MalikVisualImage[]> {
  if (signal?.aborted) return []
  const brand = referenceBrandAsset(plan.topic) || plan.queries.map(referenceBrandAsset).find(Boolean)
  if (brand && !options.skipOfficial && plan.kind !== "tutorial" && !plan.person) {
    const url = referenceThumbnailVariants(brand.url).find((candidate) => !wasExcluded(candidate, options))
    if (url) return sanitizeReferenceImages([{ ...brand, url }])
  }
  if (plan.logo && !plan.person && plan.kind !== "tutorial") return lookupLogoImages(plan,
    signal || AbortSignal.timeout(7500), options)
  // Broad photos have two independent catalogues. Start article thumbnails
  // early if Commons is slow; exact identities still use the canonical path.
  if (options.fast && !plan.entity && plan.kind !== "tutorial") {
    const controller = new AbortController()
    const budget = AbortSignal.any([...(signal ? [signal] : []), controller.signal, AbortSignal.timeout(7500)])
    return new Promise((resolve) => {
      let settled = false, completed = 0
      const finish = (images: MalikVisualImage[]) => {
        if (settled) return
        if (!images.length && ++completed < 2 && !budget.aborted) return
        settled = true
        clearTimeout(timer)
        budget.removeEventListener("abort", aborted)
        controller.abort()
        resolve(images)
      }
      const aborted = () => finish([])
      const timer = setTimeout(() => { void lookupArticleImages(plan, budget, options).catch(() => []).then(finish) }, 180)
      budget.addEventListener("abort", aborted, { once: true })
      if (budget.aborted) { finish([]); return }
      void lookupReferenceImages(plan, budget, { ...options, fast: false }).catch(() => []).then(finish)
    })
  }
  if (signal?.aborted) return []
  const portrait = verifiedPortrait(plan.topic) || plan.queries.map(verifiedPortrait).find(Boolean)
  if (portrait && !options.skipOfficial && !unrelatedNamesake("Elon Musk", plan.topic)) {
    const url = [portrait.url, portrait.fallbackUrl].find((candidate) => !wasExcluded(candidate, options))
    if (url) return sanitizeReferenceImages([{ ...portrait, url }])
  }
  const official = officialScreen(plan)
  if (official.length && !options.skipOfficial && !options.excludedUrls?.includes(official[0].url)) return sanitizeReferenceImages(official)
  const product = officialIPhonePhoto(plan.topic) || plan.queries.map(officialIPhonePhoto).find(Boolean)
  if (product && !options.skipOfficial && !options.excludedUrls?.includes(product.url)) return sanitizeReferenceImages([{ url: product.url, alt: product.title, sourceUrl: "https://support.apple.com/en-us/108044", credit: "Apple Support" }])
  const totalSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20000)])
  if (plan.entity) {
    const article = await lookupArticleImages(plan, totalSignal, options)
    if (article.length || totalSignal.aborted) return plan.person ? article.slice(0, 1) : article
    if (plan.person) return lookupPersonSearchImages(plan, totalSignal, options)
  }
  for (const topic of plan.queries.slice(0, 2)) {
    if (totalSignal.aborted) break
    const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", generator: "search",
      gsrsearch: topic, gsrnamespace: "6", gsrlimit: "6", prop: "imageinfo", iiprop: "url|mime|extmetadata",
      iiextmetadatafilter: "Artist|LicenseShortName|ImageDescription", iiextmetadatalanguage: "en", iiurlwidth: "480" })
    try {
      const response = await fetch("https://commons.wikimedia.org/w/api.php?" + params, {
        headers: catalogueHeaders(), credentials: "omit", referrerPolicy: "no-referrer",
        // Reserve time for article thumbnails even when both Commons queries stall.
        signal: AbortSignal.any([totalSignal, AbortSignal.timeout(6000)]),
      })
      const data = await readReferenceJson(response) as { query?: { pages?: CommonsPage[] } } | null
      const pages = Array.isArray(data?.query?.pages) ? data.query.pages : []
      const images = sanitizeReferenceImages(pages.sort((a, b) => (a.index || 0) - (b.index || 0)).flatMap((page) => {
        const media = page.imageinfo?.[0]
        // For interface tutorials, reject random product photos and screenshots
        // of unrelated settings (even if Commons ranked them highly).
        const fileTitle = String(page.title || "").toLocaleLowerCase()
        if (plan.entity && (unrelatedNamesake(topic, fileTitle) || referenceTitleScore(topic, fileTitle) === 0)) return []
        if (!plan.entity && plan.kind !== "tutorial" && !referenceTopicMatches(topic, fileTitle + " " + (media?.extmetadata?.ImageDescription?.value || ""))) return []
        if (plan.kind === "tutorial" && (!plan.visualDevice?.some((term) => fileTitle.includes(term))
          || !plan.visualTerms?.some((term) => fileTitle.includes(term)))) return []
        // Never fall back to the multi-megabyte original when a thumbnail is missing.
        if (!media?.thumburl || !hasRasterThumbnail(media.mime || "", media.thumburl) || !media.descriptionurl) return []
        const url = referenceThumbnailVariants(media.thumburl).find((candidate) => !wasExcluded(candidate, options))
        if (!url) return []
        return [{ url, sourceUrl: media.descriptionurl,
          alt: (page.title || plan.topic).replace(/^File:/i, "").replace(/\.[a-z\d]+$/i, "").replace(/_/g, " "),
          credit: media.extmetadata?.Artist?.value || "Wikimedia Commons", license: media.extmetadata?.LicenseShortName?.value || "" }]
      })).filter((image) => Boolean(image.sourceUrl))
      if (images.length) return images
    } catch { /* A catalogue outage must not interrupt the answer. */ }
  }
  return plan.entity ? [] : lookupArticleImages(plan, totalSignal, options)
}
