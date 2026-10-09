import { getPublicOrigin } from "@/lib/public-origin"

/** Render supplies its own exact service URL. Never allow all *.onrender.com. */
export function getRenderAccessOrigin(): string {
  if (process.env.RENDER !== "true") return ""
  try {
    const url = new URL(process.env.RENDER_EXTERNAL_URL || "")
    if (url.protocol === "https:" && /^[a-z0-9-]+\.onrender\.com$/u.test(url.hostname)
      && !url.username && !url.password && !url.port && url.pathname === "/" && !url.search && !url.hash) return url.origin
  } catch { /* No verified deployment address. */ }
  return ""
}

/** Guests can stay on a trusted service alias. OAuth keeps its canonical
 * callback and host-bound PKCE cookies in the existing sign-in routes. */
export function guestRedirectOrigin(request: Request): string {
  const canonical = getPublicOrigin()
  const candidates = [canonical, getRenderAccessOrigin()].filter(Boolean)
  const host = request.headers.get("host")?.trim() || new URL(request.url).host
  const internal = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?$/iu.test(host)
  const observed = internal ? request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || host : host
  if (!/^[a-z0-9.:[\]-]+$/iu.test(observed)) return canonical
  for (const origin of candidates) {
    const allowed = new URL(origin)
    try {
      if (new URL(`${allowed.protocol}//${observed}`).host === allowed.host) return origin
    } catch { /* Invalid Host always falls back to the configured origin. */ }
  }
  return canonical
}
