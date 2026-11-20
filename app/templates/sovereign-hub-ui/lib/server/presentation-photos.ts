import "server-only"

/**
 * Real photographs for slides, found by what the slide is about.
 *
 * Each slide the model writes carries an English `imageQuery` ("Abylai Khan
 * monument Almaty", "barista pouring latte art") and an `imageKind`:
 *
 *  - "subject": a specific real person, place, building, event or artwork.
 *    Encyclopaedic archives have the actual thing, so Wikimedia Commons is
 *    asked first, then Openverse, then the stock libraries.
 *  - "mood": any good photograph of the scene. Stock libraries are best at
 *    that, so Pexels and Unsplash (when their keys are set) go first.
 *
 * Only photographs whose licence allows use in a commercial product are
 * returned, each with the credit its licence asks for; the slide shows it.
 * A search that finds nothing tries fewer, broader words before giving up.
 * Results are cached for an hour, so rebuilding a deck does not search again.
 */

export type PhotoKind = "subject" | "mood"
export type PhotoSource = "pexels" | "unsplash" | "wikimedia" | "openverse"

export type FoundPhoto = {
  url: string
  credit: string
  link?: string
  source: PhotoSource
  width?: number
  height?: number
}

type Fetcher = typeof fetch
type Candidate = FoundPhoto & { description: string }

const REQUEST_TIMEOUT_MS = 7_000
const CACHE_MS = 60 * 60 * 1000
const CACHE_LIMIT = 400
const USER_AGENT = "MalikAI-PresentationStudio/1.0 (https://malikaiworld.world)"

type CacheGlobal = typeof globalThis & { __malikPhotoCache?: Map<string, { at: number; photos: Candidate[] }> }

function cache() {
  const scope = globalThis as CacheGlobal
  if (!scope.__malikPhotoCache) scope.__malikPhotoCache = new Map()
  return scope.__malikPhotoCache
}

function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function short(value: string, limit = 60) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

async function getJson(fetcher: Fetcher, url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetcher(url, { headers: { accept: "application/json", "user-agent": USER_AGENT, ...headers }, signal: controller.signal, cache: "no-store" })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const isHttps = (value: unknown): value is string => typeof value === "string" && /^https:\/\//.test(value)

/* ------------------------------------------------------------- providers */

type Provider = {
  source: PhotoSource
  available: () => boolean
  search: (fetcher: Fetcher, query: string) => Promise<Candidate[]>
}

const pexels: Provider = {
  source: "pexels",
  available: () => Boolean(process.env.PEXELS_API_KEY),
  async search(fetcher, query) {
    const data = await getJson(
      fetcher,
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape&size=large`,
      { authorization: String(process.env.PEXELS_API_KEY) },
    )
    return (Array.isArray(data?.photos) ? data.photos : [])
      .map((photo: Record<string, any>): Candidate | null => {
        const url = photo?.src?.large2x || photo?.src?.large
        if (!isHttps(url)) return null
        return {
          url,
          description: short(stripHtml(photo.alt), 350),
          credit: `Фото: ${short(stripHtml(photo.photographer) || "автор")} · Pexels`,
          ...(isHttps(photo.url) ? { link: photo.url } : {}),
          source: "pexels",
          width: Number(photo.width) || undefined,
          height: Number(photo.height) || undefined,
        }
      })
      .filter((photo: Candidate | null): photo is Candidate => Boolean(photo))
  },
}

const unsplash: Provider = {
  source: "unsplash",
  available: () => Boolean(process.env.UNSPLASH_ACCESS_KEY),
  async search(fetcher, query) {
    const key = String(process.env.UNSPLASH_ACCESS_KEY)
    const data = await getJson(
      fetcher,
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape&content_filter=high`,
      { authorization: `Client-ID ${key}`, "accept-version": "v1" },
    )
    return (Array.isArray(data?.results) ? data.results : [])
      .map((photo: Record<string, any>): Candidate | null => {
        const raw = photo?.urls?.raw
        const url = isHttps(raw) ? `${raw}${raw.includes("?") ? "&" : "?"}w=1600&q=80&fit=max&fm=jpg` : photo?.urls?.regular
        if (!isHttps(url)) return null
        // Unsplash asks for the download to be registered when a photo is used.
        const track = photo?.links?.download_location
        if (typeof track === "string" && /^https:\/\/api\.unsplash\.com\/photos\//u.test(track)) {
          void fetcher(track, { headers: { authorization: `Client-ID ${key}` }, redirect: "error" }).catch(() => undefined)
        }
        const html = photo?.links?.html
        return {
          url,
          description: short(stripHtml(photo.alt_description || photo.description), 350),
          credit: `Фото: ${short(stripHtml(photo?.user?.name) || "автор")} · Unsplash`,
          ...(isHttps(html) ? { link: `${html}?utm_source=malik_ai&utm_medium=referral` } : {}),
          source: "unsplash",
          width: Number(photo.width) || undefined,
          height: Number(photo.height) || undefined,
        }
      })
      .filter((photo: Candidate | null): photo is Candidate => Boolean(photo))
  },
}

/** Licences that allow a photo in a commercial product, with credit. */
export function isCommercialLicence(licence: string) {
  const value = licence.toLowerCase().replace(/\s+/g, " ").trim()
  if (!value) return false
  if (/\bnc\b|non-?commercial|fair use|non-?free|all rights reserved/.test(value)) return false
  return /^(?:cc0|pd|public domain|pdm|cc[- ]by(?:[- ]sa)?(?:[- ][\d.]+)?)/.test(value)
}

const wikimedia: Provider = {
  source: "wikimedia",
  available: () => process.env.PRESENTATION_PHOTOS_WIKIMEDIA !== "off",
  async search(fetcher, query) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `${query} filetype:bitmap`,
      gsrnamespace: "6",
      gsrlimit: "12",
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata",
      iiurlwidth: "1600",
      origin: "*",
    })
    const data = await getJson(fetcher, `https://commons.wikimedia.org/w/api.php?${params}`)
    const pages = Object.values((data?.query?.pages || {}) as Record<string, any>)
      .sort((a, b) => (Number(a?.index) || 0) - (Number(b?.index) || 0))
    return pages
      .map((page): Candidate | null => {
        const info = page?.imageinfo?.[0]
        if (!info || !/^image\/(?:jpeg|png|webp)$/.test(String(info.mime))) return null
        if ((Number(info.width) || 0) < 800) return null
        const meta = info.extmetadata || {}
        const licence = stripHtml(meta.LicenseShortName?.value || meta.License?.value)
        if (!isCommercialLicence(licence)) return null
        const url = info.thumburl || info.url
        if (!isHttps(url)) return null
        const artist = short(stripHtml(meta.Artist?.value) || "автор неизвестен", 50)
        return {
          url,
          description: short(stripHtml([page.title, meta.ObjectName?.value, meta.ImageDescription?.value].filter(Boolean).join(" ")), 350),
          credit: `Фото: ${artist} · Wikimedia Commons · ${licence}`,
          ...(isHttps(info.descriptionurl) ? { link: info.descriptionurl } : {}),
          source: "wikimedia",
          width: Number(info.width) || undefined,
          height: Number(info.height) || undefined,
        }
      })
      .filter((photo): photo is Candidate => Boolean(photo))
  },
}

const openverse: Provider = {
  source: "openverse",
  available: () => process.env.PRESENTATION_PHOTOS_OPENVERSE !== "off",
  async search(fetcher, query) {
    const params = new URLSearchParams({ q: query, license_type: "commercial", page_size: "12", mature: "false", size: "large" })
    const data = await getJson(fetcher, `https://api.openverse.org/v1/images/?${params}`)
    return (Array.isArray(data?.results) ? data.results : [])
      .map((photo: Record<string, any>): Candidate | null => {
        if (!isHttps(photo?.url)) return null
        const licence = `CC ${String(photo.license || "").toUpperCase()} ${photo.license_version || ""}`.trim()
        if (!isCommercialLicence(licence.replace(/^CC PDM/, "PDM").replace(/^CC CC0/, "CC0"))) return null
        return {
          url: photo.url,
          description: short(stripHtml(photo.title), 350),
          credit: `Фото: ${short(stripHtml(photo.creator) || "автор", 40)} · ${short(stripHtml(photo.source) || "Openverse", 24)} · ${licence}`,
          ...(isHttps(photo.foreign_landing_url) ? { link: photo.foreign_landing_url } : {}),
          source: "openverse",
          width: Number(photo.width) || undefined,
          height: Number(photo.height) || undefined,
        }
      })
      .filter((photo: Candidate | null): photo is Candidate => Boolean(photo))
  },
}

const ORDER: Record<PhotoKind, Provider[]> = {
  subject: [wikimedia, openverse, pexels, unsplash],
  mood: [pexels, unsplash, openverse, wikimedia],
}

/** Providers that will be asked, in order, for this kind of photo. */
export function photoProviders(kind: PhotoKind) {
  return ORDER[kind].filter((provider) => provider.available()).map((provider) => provider.source)
}

/** "Abylai Khan monument Almaty" → the same, then "Abylai Khan monument", then "Abylai Khan". */
export function queryVariants(query: string) {
  const words = String(query || "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
  const variants = [words.join(" ")]
  if (words.length > 3) variants.push(words.slice(0, 3).join(" "))
  if (words.length > 2) variants.push(words.slice(0, 2).join(" "))
  return [...new Set(variants.filter((variant) => variant.length >= 2))]
}

const SEARCH_FILLER = new Set(["file", "photo", "image", "picture", "of", "the", "closeup", "high", "quality", "wide", "shot", "golden", "hour", "sunset", "portrait"])

function subjectWords(text: string) {
  return new Set((text.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]{2,}/gu) || []).filter((word) => !SEARCH_FILLER.has(word)))
}

/** Require the subject in the provider metadata, even after broadening the query. */
function pick(photos: Candidate[], exclude: Set<string>, query: string, kind: PhotoKind) {
  const words = [...subjectWords(query)]
  const anchors = words.slice(0, 2)
  const monument = /\b(?:monument|statue|memorial)\b/iu.test(query)
  return photos.flatMap((photo) => {
    if (exclude.has(photo.url)) return []
    const names = subjectWords(photo.description)
    if (kind === "subject" && anchors.length && (!anchors.every((anchor) => names.has(anchor)) || monument && !["monument", "statue", "memorial", "sculpture"].some((word) => names.has(word)))) return []
    const relevance = words.filter((word) => names.has(word)).length
    const aspect = (photo.width || 0) >= (photo.height || 0) ? 1 : 0
    return [{ photo, score: relevance * 3 + aspect }]
  }).sort((a, b) => b.score - a.score)[0]?.photo ?? null
}

export async function findPhoto(
  input: { query: string; kind?: PhotoKind; exclude?: Iterable<string>; signal?: AbortSignal },
  fetcher: Fetcher = fetch,
): Promise<FoundPhoto | null> {
  const kind: PhotoKind = input.kind === "subject" ? "subject" : "mood"
  const exclude = new Set(input.exclude || [])
  const providers = ORDER[kind].filter((provider) => provider.available())
  const deadline = AbortSignal.any([AbortSignal.timeout(12_000), ...(input.signal ? [input.signal] : [])])
  const bounded: Fetcher = (url, init) => fetcher(url, { ...init, signal: AbortSignal.any([deadline, ...(init?.signal ? [init.signal] : [])]) })

  for (const variant of queryVariants(input.query)) {
    for (const provider of providers) {
      if (deadline.aborted) return null
      const key = `${provider.source}:${variant.toLowerCase()}`
      const cached = cache().get(key)
      let photos: Candidate[]
      if (cached && Date.now() - cached.at < (cached.photos.length ? CACHE_MS : 45_000)) {
        photos = cached.photos
      } else {
        photos = await provider.search(bounded, variant)
        if (deadline.aborted) return null
        cache().set(key, { at: Date.now(), photos })
        if (cache().size > CACHE_LIMIT) cache().delete(cache().keys().next().value as string)
      }
      const photo = pick(photos, exclude, input.query, kind)
      if (photo) {
        const { description: _description, ...result } = photo
        void _description
        return result
      }
    }
  }
  return null
}
