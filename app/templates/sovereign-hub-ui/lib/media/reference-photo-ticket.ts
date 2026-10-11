import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { isPublicReferenceUrl, isSafeVisualUrl, isSignedReferencePhotoUrl } from "./reference-catalog"

// No image bytes pass through Render. A small signed redirect allows photos
// discovered by our adapters without opening arbitrary model-authored URLs.
// Next bundles routes separately: share the generated key across those bundles.
const signingState = globalThis as typeof globalThis & { __malikReferencePhotoSecret?: string }
const secret = process.env.MALIK_REFERENCE_PHOTO_SECRET?.trim()
  || (signingState.__malikReferencePhotoSecret ||= randomBytes(32).toString("hex"))
const LIFETIME_SECONDS = 2 * 86400
function signature(payload: string, expires: string): string {
  return createHmac("sha256", secret).update(payload + "." + expires).digest("hex")
}

export function referencePhotoTicket(url: string): string | undefined {
  if (!isPublicReferenceUrl(url)) return
  if (isSafeVisualUrl(url)) return url
  const payload = Buffer.from(url).toString("base64url")
  if (payload.length > 2100) return
  const expires = String(Math.floor(Date.now() / 1000) + LIFETIME_SECONDS)
  return "/api/chat/reference-photo?u=" + payload + "&e=" + expires + "&s=" + signature(payload, expires)
}

/** Used only for excluding a broken search result, never to fetch a target. */
export function referencePhotoTarget(value: string): string | undefined {
  if (isPublicReferenceUrl(value)) return value
  if (!isSignedReferencePhotoUrl(value)) return
  try {
    const payload = new URL(value, "https://malik.local").searchParams.get("u")!
    const url = Buffer.from(payload, "base64url").toString("utf8")
    return isPublicReferenceUrl(url) ? url : undefined
  } catch { return }
}

export function verifyReferencePhotoTicket(value: string): string | undefined {
  if (!isSignedReferencePhotoUrl(value)) return
  const params = new URL(value, "https://malik.local").searchParams
  const payload = params.get("u")!, expires = params.get("e")!, supplied = params.get("s")!
  const remaining = Number(expires) - Math.floor(Date.now() / 1000)
  if (remaining <= 0 || remaining > LIFETIME_SECONDS) return
  const expected = signature(payload, expires)
  if (!timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"))) return
  return referencePhotoTarget(value)
}
