import "server-only"
import type { Asset, Design } from "./types"

const NASA_TERMS = "https://www.nasa.gov/nasa-brand-center/images-and-media/"
const HOSTS = new Set(["api.pexels.com", "images.pexels.com", "videos.pexels.com", "www.pexels.com", "pexels.com", "images-api.nasa.gov", "images-assets.nasa.gov", "images.nasa.gov", "api.unsplash.com", "images.unsplash.com", "unsplash.com", "commons.wikimedia.org", "upload.wikimedia.org", "thumb.wikimedia.org"])
export const MEDIA_LIMITS = { metadataBytes: 4_000_000, responseBytes: 1_000_000, requests: 64, imageBytes: 8_000_000, videoBytes: 40_000_000, concurrency: 2, durationMs: 14_000 } as const
export function assetUrl(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 2048) return null
  try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password && !url.port && HOSTS.has(url.hostname) ? url : null } catch { return null }
}
type Fetcher = typeof fetch
type Slot = Design["mediaQueries"][number]
type Candidate = Omit<Asset, "verifiedAt" | "mime" | "bytes"> & { tracking?: { url: string; headers: Record<string, string> } }
type Budget = { bytes: number; requests: number }
const plain = (value: unknown, max = 180) => String(value || "").replace(/<[^>]*>/g, " ").replace(/&(?:#\d+|\w+);/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
function request(budget: Budget) {
  if (++budget.requests > MEDIA_LIMITS.requests) throw new Error("MEDIA_REQUEST_LIMIT")
}
async function json(url: string, headers: Record<string, string>, signal: AbortSignal, fetcher: Fetcher, budget: Budget) {
  if (!assetUrl(url)) throw new Error("UNSAFE_ASSET_URL")
  request(budget)
  const response = await fetcher(url, { headers, signal, redirect: "error", cache: "no-store" })
  if (!response.ok || Number(response.headers.get("content-length") || 0) > MEDIA_LIMITS.responseBytes) {
    await response.body?.cancel(); throw new Error("MEDIA_PROVIDER_UNAVAILABLE_OR_LIMIT")
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error("EMPTY_MEDIA_RESPONSE")
  const chunks: Uint8Array[] = []; let total = 0
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break
      total += item.value.byteLength; budget.bytes += item.value.byteLength
      if (total > MEDIA_LIMITS.responseBytes || budget.bytes > MEDIA_LIMITS.metadataBytes) { await reader.cancel(); throw new Error("MEDIA_RESPONSE_LIMIT") }
      chunks.push(item.value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}
async function verify(url: string, kind: Asset["kind"], signal: AbortSignal, fetcher: Fetcher, budget: Budget) {
  if (!assetUrl(url)) return null
  try {
    request(budget)
    const response = await fetcher(url, { method: "HEAD", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]), cache: "no-store" })
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || ""
    const bytes = Number(response.headers.get("content-length") || 0)
    // No GET media fallback: an unknown length stays unknown, not proven small.
    const allowed = kind === "video" ? /^(?:video\/mp4|video\/webm|video\/ogg)$/ : /^image\/(?:jpeg|png|webp|avif|gif)$/
    return response.ok && allowed.test(mime) && Number.isFinite(bytes) && bytes >= 0 && bytes <= (kind === "video" ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.imageBytes) ? { mime, bytes: bytes || undefined } : null
  } catch { return null }
}

// Queries are written in the user's language; the photo APIs search Cyrillic
// well only when told which language it is.
const cyrillic = (query: string) => /[а-яё]/iu.test(query)
// Photographs are fetched at this width: sharp edge to edge on a large display.
const SHARP_WIDTH = 2400
async function pexels(slot: Slot, signal: AbortSignal, fetcher: Fetcher, budget: Budget): Promise<Candidate[]> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return []
  const endpoint = slot.kind === "video" ? "https://api.pexels.com/v1/videos/search" : "https://api.pexels.com/v1/search"
  const result = await json(`${endpoint}?query=${encodeURIComponent(slot.query)}&per_page=3&orientation=landscape${cyrillic(slot.query) ? "&locale=ru-RU" : ""}`, { Authorization: key }, signal, fetcher, budget)
  if (slot.kind === "image") return (result.photos || []).slice(0, 3).flatMap((photo: { src?: { original?: string; large2x?: string; large?: string }; url: string; photographer?: string; width: number; height: number }) => {
    // Full-bleed on a large screen needs the original resized on the CDN, not the 940px preview.
    const url = photo.src?.original ? `${photo.src.original}?auto=compress&cs=tinysrgb&w=${SHARP_WIDTH}` : photo.src?.large2x || photo.src?.large
    return assetUrl(url) && assetUrl(photo.url) ? [{ slot: slot.slot, kind: "image" as const, url: url!, source: "pexels" as const, sourcePage: photo.url, credit: `Photo by ${plain(photo.photographer) || "Pexels contributor"} on Pexels`, license: "https://www.pexels.com/license/", width: photo.width, height: photo.height }] : []
  })
  return (result.videos || []).slice(0, 3).flatMap((video: { video_files?: Array<{ file_type: string; width: number; height: number; link: string }>; url: string; image?: string; user?: { name?: string } }) => {
    // Full HD reads as filmed on a large screen; 4K files are too heavy for a background.
    const file = video.video_files?.filter(f => f.file_type === "video/mp4" && f.width >= 960 && f.width <= 2560 && assetUrl(f.link)).sort((a, b) => Math.abs(a.width - 1920) - Math.abs(b.width - 1920))[0]
    return file && assetUrl(video.url) ? [{ slot: slot.slot, kind: "video" as const, url: file.link, poster: assetUrl(video.image)?.href, source: "pexels" as const, sourcePage: video.url, credit: `Video by ${plain(video.user?.name) || "Pexels contributor"} on Pexels`, license: "https://www.pexels.com/license/", width: file.width, height: file.height }] : []
  })
}
async function nasa(slot: Slot, design: Design, signal: AbortSignal, fetcher: Fetcher, budget: Budget): Promise<Candidate[]> {
  if (!/space|cosmic|black hole|galaxy|nebula|planet|astronom/iu.test(slot.query) || design.direction !== "cinematic") return []
  const result = await json(`https://images-api.nasa.gov/search?q=${encodeURIComponent(slot.query)}&media_type=${slot.kind}&page_size=3`, {}, signal, fetcher, budget)
  const candidates: Candidate[] = []
  for (const item of (result.collection?.items || []).slice(0, 3)) {
    const data = item.data?.[0]
    if (!data?.center || data.photographer || data.secondary_creator || /copyright|©|getty|shutterstock|astronaut|portrait|employee|logo/iu.test(`${data.description} ${data.title}`)) continue
    if (slot.kind === "image") {
      const link = item.links?.filter((link: { href?: string; render?: string; width?: number; size?: number }) => link.render === "image" && assetUrl(link.href) && (!link.size || link.size <= MEDIA_LIMITS.imageBytes) && (!link.width || link.width <= 1920)).sort((a: { width?: number }, b: { width?: number }) => (b.width || 0) - (a.width || 0))[0]
      if (link) {
        candidates.push({ slot: slot.slot, kind: "image", url: link.href, source: "nasa", sourcePage: `https://images.nasa.gov/details/${encodeURIComponent(String(data.nasa_id || ""))}`, credit: `NASA / ${plain(data.center, 80)} — editorial image/visualization; no endorsement`, license: NASA_TERMS, width: link.width, height: link.height, description: plain(data.description, 500) })
        if (candidates.length >= 2) break
        continue
      }
    }
    try {
      let url = item.links?.find((link: { rel: string }) => link.rel === "preview")?.href
      const poster = assetUrl(url)?.href
      if (assetUrl(item.href)) {
        const collection = await json(item.href, {}, signal, fetcher, budget)
        // Only NASA's exact official CDN can be upgraded from legacy HTTP metadata.
        const variants = Array.isArray(collection) ? collection.filter((url): url is string => typeof url === "string").map(url => url.replace(/^http:\/\/images-assets\.nasa\.gov\//, "https://images-assets.nasa.gov/")) : []
        url = slot.kind === "video"
          ? variants.find(url => /~mobile\.mp4$/i.test(url) && assetUrl(url)) || variants.find(url => /~preview\.mp4$/i.test(url) && assetUrl(url))
          : variants.find(url => /~large\.(?:jpg|png)$/i.test(url) && assetUrl(url)) || variants.find(url => /~medium\.(?:jpg|png)$/i.test(url) && assetUrl(url)) || url
      }
      if (assetUrl(url)) candidates.push({ slot: slot.slot, kind: slot.kind, url, ...(slot.kind === "video" ? { poster } : {}), source: "nasa", sourcePage: `https://images.nasa.gov/details/${encodeURIComponent(String(data.nasa_id || ""))}`, credit: `NASA / ${plain(data.center, 80)} — editorial use; no endorsement`, license: NASA_TERMS, description: plain(data.description, 500) })
      if (candidates.length >= 2) break
    } catch { if (signal.aborted) break /* Preserve earlier candidates when a later collection fails. */ }
  }
  return candidates
}
async function unsplash(slot: Slot, signal: AbortSignal, fetcher: Fetcher, budget: Budget): Promise<Candidate[]> {
  if (slot.kind !== "image" || !process.env.UNSPLASH_ACCESS_KEY) return []
  const headers = { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" }
  const result = await json(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(slot.query)}&per_page=3&orientation=landscape${cyrillic(slot.query) ? "&lang=ru" : ""}`, headers, signal, fetcher, budget)
  return (result.results || []).slice(0, 3).flatMap((photo: { urls?: { raw?: string; regular?: string }; links?: { html?: string; download_location?: string }; user?: { links?: { html?: string }; name?: string }; width: number; height: number }) => {
    if (!assetUrl(photo.urls?.regular) || !assetUrl(photo.links?.html) || !assetUrl(photo.links?.download_location) || !assetUrl(photo.user?.links?.html)) return []
    const page = new URL(photo.links!.html!), creator = new URL(photo.user!.links!.html!)
    for (const url of [page, creator]) { url.searchParams.set("utm_source", "malik_ai"); url.searchParams.set("utm_medium", "referral") }
    // The 1080px "regular" size is soft on a full-bleed hero; the raw URL resizes on the CDN.
    const sharp = assetUrl(photo.urls?.raw) ? `${photo.urls!.raw}${photo.urls!.raw!.includes("?") ? "&" : "?"}w=${SHARP_WIDTH}&q=82&auto=format&fit=max` : ""
    return [{ slot: slot.slot, kind: "image" as const, url: sharp && assetUrl(sharp) ? sharp : photo.urls!.regular!, source: "unsplash" as const, sourcePage: page.href, creatorUrl: creator.href, credit: `Photo by ${plain(photo.user?.name) || "Unsplash contributor"} on Unsplash`, license: "https://unsplash.com/license", width: photo.width, height: photo.height, tracking: { url: photo.links!.download_location!, headers } }]
  })
}
export function commonsLicense(raw: unknown) {
  if (typeof raw !== "string") return null
  try {
    const url = new URL(raw.replace(/^http:\/\/creativecommons\.org\//, "https://creativecommons.org/"))
    if (url.protocol !== "https:" || url.hostname !== "creativecommons.org" || url.port || url.username || url.password || url.search || url.hash) return null
    url.pathname = url.pathname.replace(/\/deed\.[a-z_-]+\/?$/i, "/")
    return /^\/(?:licenses\/(?:by|by-sa)\/(?:[1-4]\.0|2\.5)|publicdomain\/(?:zero|mark)\/1\.0)\/?$/.test(url.pathname) ? url.href : null
  } catch { return null }
}
async function commons(slot: Slot, signal: AbortSignal, fetcher: Fetcher, budget: Budget): Promise<Candidate[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php")
  const params = { action: "query", format: "json", formatversion: "2", generator: "search", gsrsearch: `${slot.query} filetype:${slot.kind === "image" ? "bitmap" : "video"}`, gsrnamespace: "6", gsrlimit: "3", prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: String(SHARP_WIDTH), iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|Restrictions" }
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  const result = await json(url.href, { "User-Agent": "MalikAI-WebsiteEngine/1.1 (https://malikaiworld.world; attributed media discovery)" }, signal, fetcher, budget)
  return (result.query?.pages || []).slice(0, 3).flatMap((page: { imageinfo?: Array<{ mime: string; size: number; width: number; height: number; thumbwidth?: number; thumbheight?: number; url: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value?: string }> }> }) => {
    const info = page.imageinfo?.[0], meta = info?.extmetadata
    const license = commonsLicense(meta?.LicenseUrl?.value), artist = plain(meta?.Artist?.value)
    if (!info || !license || !artist || plain(meta?.Restrictions?.value) || !assetUrl(info.descriptionurl) || !info.mime?.startsWith(`${slot.kind}/`)) return []
    const media = slot.kind === "image" ? info.thumburl || info.url : info.url
    if (!assetUrl(media) || slot.kind === "video" && (!info.size || info.size > MEDIA_LIMITS.videoBytes) || slot.kind === "image" && info.width < 640) return []
    return [{ slot: slot.slot, kind: slot.kind, url: media, source: "commons" as const, sourcePage: info.descriptionurl, credit: `${artist} / Wikimedia Commons — ${plain(meta?.LicenseShortName?.value, 60)}`, license, width: info.thumbwidth || info.width, height: info.thumbheight || info.height }]
  })
}

/** Sequential providers, two bounded slots, no media GET/download/transcode on
 * Render. A broken first result never suppresses the next candidate/provider.
 * Per-project deduplication has no cross-user/global media cache. */
export async function discoverAssets(design: Design, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<{ assets: Asset[]; missing: string[] }> {
  const deadline = AbortSignal.any([AbortSignal.timeout(MEDIA_LIMITS.durationMs), ...(signal ? [signal] : [])])
  const slots = [...new Map(design.mediaQueries.slice(0, 16).map(slot => [slot.slot, slot])).values()]
  const assets: Asset[] = [], missing: string[] = [], used = new Set<string>()
  const budget: Budget = { bytes: 0, requests: 0 }; let cursor = 0
  const run = async () => {
    while (cursor < slots.length && !deadline.aborted) {
      const slot = slots[cursor++]
      let selected: Asset | undefined
      for (const [providerIndex, provider] of [pexels, (s: Slot, a: AbortSignal, f: Fetcher, b: Budget) => nasa(s, design, a, f, b), unsplash, commons].entries()) {
        if (deadline.aborted || budget.bytes >= MEDIA_LIMITS.metadataBytes || budget.requests >= MEDIA_LIMITS.requests) break
        try {
          const providerSignal = AbortSignal.any([deadline, AbortSignal.timeout(providerIndex === 1 ? 7000 : 3500)])
          for (const candidate of await provider(slot, providerSignal, fetcher, budget)) {
            const identity = `${candidate.source}:${candidate.sourcePage}`
            if (used.has(identity)) continue
            const checked = await verify(candidate.url, candidate.kind, deadline, fetcher, budget)
            if (!checked || used.has(identity)) continue
            used.add(identity)
            try {
              if (candidate.tracking) await json(candidate.tracking.url, candidate.tracking.headers, providerSignal, fetcher, budget)
              let poster = candidate.poster
              if (poster && !await verify(poster, "image", deadline, fetcher, budget)) poster = undefined
              const publicCandidate = { ...candidate }; delete publicCandidate.tracking
              selected = { ...publicCandidate, ...(candidate.kind === "video" ? { poster } : {}), ...checked, verifiedAt: new Date().toISOString() }
              break
            } catch { used.delete(identity) }
          }
        } catch { /* Next permitted provider; never fabricate a missing slot. */ }
        if (selected) break
      }
      if (selected) assets.push(selected); else missing.push(slot.slot)
    }
  }
  await Promise.all(Array.from({ length: MEDIA_LIMITS.concurrency }, run))
  for (const slot of slots) if (!assets.some(asset => asset.slot === slot.slot) && !missing.includes(slot.slot)) missing.push(slot.slot)
  return { assets, missing }
}
