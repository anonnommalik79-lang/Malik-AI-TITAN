import { getPublicOrigin } from "@/lib/public-origin"

/** Canonicalize the browser's host before creating host-bound PKCE state.
 * Next.js may report an internal HTTP URL after Render terminates HTTPS. */
export function canonicalSignInRedirect(request: Request): string | null {
  const requestUrl = new URL(request.url)
  const canonical = new URL(getPublicOrigin())
  const host = request.headers.get("host")?.trim() || requestUrl.host
  const internalHost = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?$/iu.test(host)
  // A public Host takes precedence. Forwarded host is useful only when the
  // reverse proxy replaced it with an internal address; it is never a target.
  const observedHost = internalHost
    ? request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || host
    : host
  let normalizedHost = ""
  try {
    if (/^[\p{L}\p{N}.:[\]-]+$/u.test(observedHost)) normalizedHost = new URL(`${canonical.protocol}//${observedHost}`).host
  } catch { /* Invalid host headers take the fixed canonical path. */ }
  if (normalizedHost === canonical.host) return null
  const target = new URL("/sign-in", canonical)
  target.search = requestUrl.search
  return target.toString()
}
