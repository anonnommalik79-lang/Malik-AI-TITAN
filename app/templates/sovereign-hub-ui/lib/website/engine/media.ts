import "server-only"
import type { Asset, Design } from "./types"

const NASA_TERMS = "https://www.nasa.gov/nasa-brand-center/images-and-media/"
const HOSTS = new Set(["api.pexels.com", "images.pexels.com", "videos.pexels.com", "www.pexels.com", "pexels.com", "images-api.nasa.gov", "images-assets.nasa.gov", "images.nasa.gov", "api.unsplash.com", "images.unsplash.com", "unsplash.com"])
export function assetUrl(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 2048) return null
  try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password && !url.port && HOSTS.has(url.hostname) ? url : null } catch { return null }
}
type Fetcher = typeof fetch
async function json(url: string, headers: Record<string, string>, signal: AbortSignal, fetcher: Fetcher) {
  if (!assetUrl(url)) throw new Error("UNSAFE_ASSET_URL")
  const response = await fetcher(url, { headers, signal, redirect: "error", cache: "no-store" })
  if (!response.ok) throw new Error("MEDIA_PROVIDER_UNAVAILABLE")
  const size = Number(response.headers.get("content-length") || 0)
  if (size > 1_000_000) throw new Error("MEDIA_RESPONSE_LIMIT")
  const reader = response.body?.getReader()
  if (!reader) throw new Error("EMPTY_MEDIA_RESPONSE")
  const chunks: Uint8Array[] = []; let total = 0
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break
      total += item.value.byteLength
      if (total > 1_000_000) { await reader.cancel(); throw new Error("MEDIA_RESPONSE_LIMIT") }
      chunks.push(item.value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}
async function verify(url: string, kind: Asset["kind"], signal: AbortSignal, fetcher: Fetcher) {
  if (!assetUrl(url)) return null
  try {
    const response = await fetcher(url, { method: "HEAD", redirect: "error", signal, cache: "no-store" })
    const mime = response.headers.get("content-type")?.split(";")[0] || ""
    const bytes = Number(response.headers.get("content-length") || 0)
    return response.ok && mime.startsWith(`${kind}/`) && (!bytes || bytes <= (kind === "video" ? 40_000_000 : 8_000_000)) ? mime : null
  } catch { return null }
}
/** Bounded metadata only. Never download large media into Render memory, never
 * follow an arbitrary URL from a model or search result. No secret-key cache. */
export async function discoverAssets(design: Design, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<{ assets: Asset[]; missing: string[] }> {
  const budget = AbortSignal.any([AbortSignal.timeout(14_000), ...(signal ? [signal] : [])])
  const slots = design.mediaQueries.slice(0, 16)
  const assets: Asset[] = []; const missing: string[] = []
  let cursor = 0
  const run = async () => {
    while (cursor < slots.length && !budget.aborted) {
      const slot = slots[cursor++]
      let found: Omit<Asset, "verifiedAt" | "mime"> | undefined
      try {
        if (process.env.PEXELS_API_KEY) {
          const endpoint = slot.kind === "video" ? "https://api.pexels.com/v1/videos/search" : "https://api.pexels.com/v1/search"
          const result = await json(`${endpoint}?query=${encodeURIComponent(slot.query)}&per_page=3&orientation=landscape`, { Authorization: process.env.PEXELS_API_KEY }, budget, fetcher)
          if (slot.kind === "image") {
            const photo = result.photos?.[0]
            if (photo && assetUrl(photo.src?.large) && assetUrl(photo.url)) found = { slot: slot.slot, kind: "image", url: photo.src.large, source: "pexels", sourcePage: photo.url, credit: `Photo by ${String(photo.photographer || "Pexels contributor").slice(0, 120)} on Pexels`, license: "https://www.pexels.com/license/", width: photo.width, height: photo.height }
          } else {
            const video = result.videos?.[0]
            const file = video?.video_files?.filter((f: { file_type: string; width: number; link: string }) => f.file_type === "video/mp4" && f.width <= 1920 && assetUrl(f.link)).sort((a: { width: number }, b: { width: number }) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280))[0]
            if (file && assetUrl(video.url)) found = { slot: slot.slot, kind: "video", url: file.link, poster: assetUrl(video.image)?.href, source: "pexels", sourcePage: video.url, credit: `Video by ${String(video.user?.name || "Pexels contributor").slice(0, 120)} on Pexels`, license: "https://www.pexels.com/license/", width: file.width, height: file.height }
          }
        }
      } catch { /* One provider fails; try the next permitted provider. */ }
      // NASA is restricted to factual/editorial space subjects. Third-party
      // copyright and identifiable people are not automatically licensed.
      if (!found && /space|cosmic|black hole|galaxy|nebula|planet|astronom/iu.test(slot.query) && design.direction === "cinematic") try {
        const result = await json(`https://images-api.nasa.gov/search?q=${encodeURIComponent(slot.query)}&media_type=${slot.kind}&page_size=3`, {}, budget, fetcher)
        const item = result.collection?.items?.find((item: { data?: Array<{ center?: string; photographer?: string; secondary_creator?: string; description?: string; title?: string }> }) => {
          const data = item.data?.[0]
          return data?.center && !data.photographer && !data.secondary_creator && !/copyright|©|getty|shutterstock|astronaut|portrait|employee|logo/iu.test(`${data.description} ${data.title}`)
        })
        const data = item?.data?.[0]
        if (item && data) {
          let url = item.links?.find((link: { rel: string }) => link.rel === "preview")?.href
          const poster = assetUrl(url)?.href
          if (assetUrl(item.href)) {
            const collection = await json(item.href, {}, budget, fetcher)
            // NASA's live collections still return http:// asset strings.
            // Upgrade only its exact official CDN host, then verify HTTPS;
            // never weaken the global SSRF/transport allowlist.
            const variants = Array.isArray(collection) ? collection.filter((url): url is string => typeof url === "string").map(url => url.replace(/^http:\/\/images-assets\.nasa\.gov\//, "https://images-assets.nasa.gov/")) : []
            url = slot.kind === "video"
              ? variants.find(url => /~mobile\.mp4$/i.test(url) && assetUrl(url)) || variants.find(url => /~preview\.mp4$/i.test(url) && assetUrl(url)) || null
              : variants.find(url => /~large\.(?:jpg|png)$/i.test(url) && assetUrl(url)) || variants.find(url => /~medium\.(?:jpg|png)$/i.test(url) && assetUrl(url)) || url
          }
          if (assetUrl(url)) found = { slot: slot.slot, kind: slot.kind, url, ...(slot.kind === "video" ? { poster } : {}), source: "nasa", sourcePage: `https://images.nasa.gov/details/${encodeURIComponent(String(data.nasa_id || ""))}`, credit: `NASA / ${String(data.center).slice(0, 80)} — editorial use; no endorsement`, license: NASA_TERMS }
        }
      } catch { /* Missing NASA asset is not a successful media slot. */ }
      if (!found && slot.kind === "image" && process.env.UNSPLASH_ACCESS_KEY) try {
        const headers = { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" }
        const result = await json(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(slot.query)}&per_page=1&orientation=landscape`, headers, budget, fetcher)
        const photo = result.results?.[0]
        if (assetUrl(photo?.urls?.regular) && assetUrl(photo?.links?.html) && assetUrl(photo?.links?.download_location) && assetUrl(photo?.user?.links?.html)) {
          // Selecting an image for a generated project counts as a download.
          await json(photo.links.download_location, headers, budget, fetcher)
          const page = new URL(photo.links.html), creator = new URL(photo.user.links.html)
          for (const url of [page, creator]) { url.searchParams.set("utm_source", "malik_ai"); url.searchParams.set("utm_medium", "referral") }
          found = { slot: slot.slot, kind: "image", url: photo.urls.regular, source: "unsplash", sourcePage: page.href, creatorUrl: creator.href, credit: `Photo by ${String(photo.user?.name || "Unsplash contributor").slice(0, 120)} on Unsplash`, license: "https://unsplash.com/license", width: photo.width, height: photo.height }
        }
      } catch { /* A failed tracking call must not silently bypass API terms. */ }
      const mime = found && await verify(found.url, found.kind, budget, fetcher)
      if (found && mime) assets.push({ ...found, mime, verifiedAt: new Date().toISOString() })
      else missing.push(slot.slot)
    }
  }
  await Promise.all([run(), run()])
  for (const slot of slots) if (!assets.some(a => a.slot === slot.slot) && !missing.includes(slot.slot)) missing.push(slot.slot)
  return { assets, missing }
}
