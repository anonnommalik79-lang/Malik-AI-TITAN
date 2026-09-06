/**
 * Validation for the TikTok poster fallback.
 *
 * The endpoint that uses this takes a URL from the browser and then talks to
 * TikTok about it, which is the exact shape of a server-side request forgery if
 * the input is trusted. So nothing here trusts it: the caller's URL is parsed
 * and rebuilt into a canonical tiktok.com address from parts we recognise, and
 * the request destination is a hard-coded constant that no input can influence.
 * The thumbnail that comes back is checked against a TikTok CDN allow-list
 * before the browser is ever pointed at it.
 *
 * Pure and import-free, so each rule can be tested on its own.
 */

/** The only host we will ever ask about a video. Not built from input. */
export const TIKTOK_OEMBED_ENDPOINT = "https://www.tiktok.com/oembed"

export const TIKTOK_POST_ID_PATTERN = /^\d{6,32}$/
const HANDLE_PATTERN = /^[A-Za-z0-9._]{1,24}$/

/**
 * Hosts a TikTok thumbnail may live on.
 *
 * oEmbed answers with a CDN URL, and following it blindly would turn this
 * endpoint into an open redirect for whatever that response contained. Suffix
 * matching on a short list keeps the redirect inside TikTok's own image CDNs.
 */
const THUMBNAIL_HOST_SUFFIXES = [
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
  ".tiktokcdn-eu.com",
  ".ttwstatic.com",
  ".ibyteimg.com",
  ".byteoversea.com",
  // TikTok's own oEmbed documentation returns thumbnails on p16.muscdn.com,
  // so leaving it out rejected the official answer and turned every refreshed
  // cover into the placeholder.
  ".muscdn.com",
]

/**
 * Hosts allowed with no subdomain at all.
 *
 * Kept separate from the suffix list because a suffix entry cannot express
 * "this exact host": `.muscdn.com` does not match `muscdn.com`, and dropping
 * the leading dot to make it would also match `evil-muscdn.com`.
 */
const THUMBNAIL_HOSTS = ["muscdn.com"]

export type TikTokPosterTarget = {
  /** Canonical URL rebuilt from recognised parts - never the caller's string. */
  canonicalUrl: string
  postId: string
  handle: string | null
}

/**
 * Turn whatever arrived into a canonical TikTok video URL, or null.
 *
 * Only two shapes are accepted: a tiktok.com video URL, and a bare post id.
 * Everything else - another host, a redirect chain, an IP literal, a
 * credentials-in-URL trick - fails here rather than being cleaned up, because
 * a validator that repairs hostile input eventually repairs it into something
 * that works.
 */
export function resolveTikTokPosterTarget(input: { url?: string | null; id?: string | null }): TikTokPosterTarget | null {
  const rawId = String(input.id || "").trim()
  if (rawId) {
    if (!TIKTOK_POST_ID_PATTERN.test(rawId)) return null
    return { canonicalUrl: `https://www.tiktok.com/@tiktok/video/${rawId}`, postId: rawId, handle: null }
  }

  const rawUrl = String(input.url || "").trim()
  if (!rawUrl) return null

  let parsed: URL
  try { parsed = new URL(rawUrl) } catch { return null }
  if (parsed.protocol !== "https:") return null
  // Exact hosts only. A suffix check here would accept tiktok.com.evil.tld.
  if (parsed.hostname !== "www.tiktok.com" && parsed.hostname !== "tiktok.com" && parsed.hostname !== "m.tiktok.com") return null
  if (parsed.username || parsed.password || parsed.port) return null

  const match = parsed.pathname.match(/^\/@([A-Za-z0-9._]{1,24})\/(?:video|photo)\/(\d{6,32})\/?$/)
  if (!match) return null
  const [, handle, postId] = match
  if (!HANDLE_PATTERN.test(handle) || !TIKTOK_POST_ID_PATTERN.test(postId)) return null

  // Rebuilt from the two captured parts, so query strings, fragments and any
  // other passenger on the original string are dropped rather than forwarded.
  return { canonicalUrl: `https://www.tiktok.com/@${handle}/video/${postId}`, postId, handle }
}

/** The oEmbed request URL. The endpoint is constant; only the video varies. */
export function tiktokOembedUrl(target: TikTokPosterTarget) {
  return `${TIKTOK_OEMBED_ENDPOINT}?url=${encodeURIComponent(target.canonicalUrl)}`
}

/** True when a thumbnail URL is an https image on a TikTok CDN. */
export function isAllowedTikTokThumbnail(value?: string | null): boolean {
  const raw = String(value || "").trim()
  if (!raw) return false
  let parsed: URL
  try { parsed = new URL(raw) } catch { return false }
  if (parsed.protocol !== "https:") return false
  if (parsed.username || parsed.password) return false
  const host = parsed.hostname.toLowerCase()
  // Exact match or a real subdomain. Both checks anchor on a dot boundary, so
  // muscdn.com.evil.tld and evil-muscdn.com fail the same way any other
  // unrelated host does.
  if (THUMBNAIL_HOSTS.includes(host)) return true
  return THUMBNAIL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

/**
 * The image shown when nothing else resolved.
 *
 * A neutral inline SVG rather than a broken-image icon or an outbound request:
 * it renders offline, costs one response, and cannot itself expire.
 */
export const TIKTOK_POSTER_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640">
  <rect width="360" height="640" fill="#0d0d0f"/>
  <circle cx="180" cy="296" r="46" fill="none" stroke="#2a2a2e" stroke-width="2"/>
  <path d="M168 276v40a12 12 0 1 1-12-12" fill="none" stroke="#4a4a52" stroke-width="3" stroke-linecap="round"/>
  <path d="M168 276c4 8 11 13 20 14" fill="none" stroke="#4a4a52" stroke-width="3" stroke-linecap="round"/>
  <text x="180" y="392" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#57575f">Обложка недоступна</text>
</svg>`
