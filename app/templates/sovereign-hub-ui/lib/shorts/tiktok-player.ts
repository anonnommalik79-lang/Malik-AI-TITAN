/**
 * TikTok embed player: the URL, the error taxonomy, and the poster fallback
 * address.
 *
 * Pure and import-free, so every rule below is testable without a browser, a
 * network or a database - which matters most for the two that are easy to get
 * subtly wrong: an iframe src that must not change, and an error code that must
 * not be treated as fatal.
 */

export const TIKTOK_PLAYER_ORIGIN = "https://www.tiktok.com"

/** A TikTok post id: digits only, and long. Anything else is not one. */
export const TIKTOK_POST_ID = /^\d{6,32}$/

/**
 * The player URL for a video.
 *
 * It deliberately takes no mute argument. Mute used to be a query parameter, so
 * tapping the speaker changed the src, React swapped the iframe, and the
 * browser reloaded the player - losing buffer, position and player state on
 * every toggle. The frame now always starts muted (which is also what browsers
 * require before they will autoplay anything) and the live mute state is
 * applied over postMessage once the player reports ready.
 *
 * Every chrome parameter is off because the Malik bar provides all of it; two
 * progress bars and two play buttons on one video is how a player stops feeling
 * like one product.
 */
export function tiktokPlayerSrc(videoId: string, options: { autoplay?: boolean } = {}) {
  const params = new URLSearchParams({
    controls: "0",
    progress_bar: "0",
    play_button: "0",
    volume_control: "0",
    fullscreen_button: "0",
    timestamp: "0",
    music_info: "0",
    description: "0",
    rel: "0",
    native_context_menu: "0",
    closed_caption: "0",
    loop: "1",
    autoplay: options.autoplay ? "1" : "0",
    // Constant on purpose - see above. Unmuting happens over postMessage.
    muted: "1",
  })
  return `${TIKTOK_PLAYER_ORIGIN}/player/v1/${encodeURIComponent(videoId)}?${params.toString()}`
}

export type TikTokPlayerError = {
  code: number
  type: string
  /** True when the video cannot play at all and the frame should be replaced. */
  fatal: boolean
}

/** Documented codes: 1001 invalid video, 2001 server, 3001 playback, 3002 autoplay. */
export const TIKTOK_AUTOPLAY_ERROR = 3002

/**
 * Read an onPlayerError payload and decide whether the player is dead.
 *
 * 3002 is not a broken video - it is the browser refusing to start playback
 * without a user gesture, which is the normal outcome of muted autoplay being
 * disabled or of a page the viewer has not interacted with yet. Tearing the
 * iframe down for it replaces a working video with a poster and a dead end,
 * when all that was needed was for someone to press play.
 *
 * The payload is an object - `{ errorCode, errorType }` - so comparing the
 * whole value against a number, as an earlier draft would have, matches
 * nothing and quietly makes every error fatal.
 */
export function classifyTikTokPlayerError(value: unknown): TikTokPlayerError {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  const code = Number(raw.errorCode)
  const type = String(raw.errorType || "")
  const known = Number.isFinite(code) ? code : 0
  return { code: known, type, fatal: known !== TIKTOK_AUTOPLAY_ERROR }
}

/**
 * Where to ask for a fresh cover when the stored one has expired.
 *
 * TikTok's cover_image_url from video.list lives about six hours, and it is
 * stored in malik_shorts_posts.poster_url as if it were permanent - so a post
 * imported yesterday shows a broken image today unless its owner happens to
 * open the feed and trigger a sync. The endpoint re-resolves the thumbnail from
 * the post's own canonical URL; this helper only builds the address, and the
 * route does the validating.
 */
export function tiktokPosterEndpoint(sourceUrl?: string | null, videoId?: string | null) {
  const url = String(sourceUrl || "").trim()
  if (url) return `/api/shorts/tiktok/poster?url=${encodeURIComponent(url)}`
  const id = String(videoId || "").trim()
  if (TIKTOK_POST_ID.test(id)) return `/api/shorts/tiktok/poster?id=${encodeURIComponent(id)}`
  return null
}
