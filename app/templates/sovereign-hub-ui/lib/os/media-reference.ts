/** A media artifact is metadata plus a browser-direct HTTPS URL, never a proxy. */
export function directMediaUrl(value: string, appOrigin = ""): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password) return null
    const host = url.hostname.toLowerCase()
    if (host === "localhost" || host.endsWith(".local") || host === "127.0.0.1" || host === "[::1]" || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null
    if (appOrigin && url.host === new URL(appOrigin).host) return null
    return url.toString()
  } catch {
    return null
  }
}
