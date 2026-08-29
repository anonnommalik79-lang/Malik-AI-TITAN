/**
 * How the chat card decides whether a URL is a finished media file or a
 * progress endpoint.
 *
 * This lived inline in chat-view.tsx and carried the bug behind the endless
 * photo animation: it rejected every URL containing `/api/`. The production
 * Flask backend always returns finished photos as `/api/storage/photos/<file>`,
 * so a completed generation was never recognised as an image — the card kept
 * looping its sketch animation and a reload replayed it from the start.
 */

/** Progress endpoints. A status report, never the picture itself. */
export function isJobStatusUrl(url: string) {
  const value = String(url || "").toLowerCase()
  return (
    value.includes("/status") ||
    value.includes("status?") ||
    /\/api\/ai\/job\//.test(value) ||
    /\/api\/generate\//.test(value)
  )
}

/**
 * Routes whose whole job is to hand back ONE finished media file:
 * `/api/media/asset/<id>` (Node) and `/api/storage/photos/<file>` (Flask).
 */
export function isMediaFileRoute(url: string) {
  return /(^|\/)api\/(media\/asset|storage\/(photos|images|videos))\/[^/]+/i.test(String(url || ""))
}

export function isDataSvgUrl(url?: string) {
  return typeof url === "string" && url.startsWith("data:image/svg+xml")
}

export function isImageLikeUrl(url?: string) {
  if (!url || typeof url !== "string") return false
  if (isDataSvgUrl(url)) return true
  if (url.startsWith("data:image/")) return true
  if (url.startsWith("malik-image://")) return true
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return false
  if (isJobStatusUrl(url)) return false
  if (isMediaFileRoute(url)) return true
  const value = url.toLowerCase()
  if (value.includes("/api/")) return false
  return /\.(png|jpg|jpeg|webp|gif|svg)(\?|#|$)/i.test(url) || /image|thumbnail|poster|preview|asset/i.test(url)
}

export function isRealVideoUrl(url?: string) {
  if (!url || typeof url !== "string") return false
  if (isJobStatusUrl(url)) return false
  if (url.startsWith("blob:")) return true
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return false
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) || /output\.mp4|\.mp4\?|\.webm\?|rendered-video/i.test(url)
}
