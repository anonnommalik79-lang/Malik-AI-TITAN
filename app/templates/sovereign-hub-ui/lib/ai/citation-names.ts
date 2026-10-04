/**
 * How a web source is named and linked in an answer: «Anthropic +1» chips,
 * the domain label on a card picture, the hosts a card link may point to.
 */

export type MalikCitation = { url: string; title?: string; domain?: string; image?: string }

const KNOWN_SOURCE_NAMES: Record<string, string> = {
  "wikipedia.org": "Wikipedia", "britannica.com": "Britannica", "github.com": "GitHub", "youtube.com": "YouTube",
  "openai.com": "OpenAI", "anthropic.com": "Anthropic", "google.com": "Google", "gov.kz": "gov.kz", "akorda.kz": "Akorda",
  "tengrinews.kz": "Tengrinews", "kapital.kz": "Kapital.kz", "forbes.kz": "Forbes.kz", "reuters.com": "Reuters", "bbc.com": "BBC",
  "astanahub.com": "Astana Hub", "gitex.com": "GITEX", "inform.kz": "Kazinform",
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase() } catch { return "" }
}

export function citationName(source: MalikCitation): string {
  const host = (String(source.domain || "") || hostOf(source.url)).replace(/^www\./, "").toLowerCase()
  const parts = host.split(".").filter(Boolean)
  for (let index = 0; index < parts.length - 1; index += 1) {
    const tail = parts.slice(index).join(".")
    if (KNOWN_SOURCE_NAMES[tail]) return KNOWN_SOURCE_NAMES[tail]
  }
  const root = parts.length > 1 ? parts[parts.length - 2] : parts[0] || "Источник"
  // «Supernova | Expand North Star» on expandnorthstar.com → «Expand North Star»;
  // «Activat VC» on activat.vc → «Activat VC».
  const compact = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
  const named = String(source.title || "").split(/\s+[|–—-]\s+|\s*[|·]\s*/u)
    .map((part) => part.trim())
    .find((part) => part.length >= 3 && !/[:?!]/u.test(part) && compact(part).startsWith(compact(root)) && compact(part).length - compact(root).length <= 10)
  if (named) return named
  return root.split(/[-_]+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || "Источник"
}

/** http(s) only; anything else (javascript:, data:) is no link at all. */
export function safeHttps(url: string): string {
  try { const parsed = new URL(url); return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password ? parsed.href : "" } catch { return "" }
}

/** The registrable part of a host, roughly: «events.astanahub.com» → «astanahub.com». */
function siteOf(host: string): string {
  const parts = host.split(".").filter(Boolean)
  if (parts.length <= 2) return host
  const secondLevel = /^(?:co|com|gov|org|net|edu|ac)$/.test(parts[parts.length - 2])
  return parts.slice(secondLevel ? -3 : -2).join(".")
}

/**
 * A link written by the model is kept only when it can be trusted not to be
 * invented: with web sources, it must point to a site one of them is on; with
 * none, only a site's front page is kept (a made-up deep path is the classic
 * 404). Returns the safe URL or "".
 */
export function trustedLink(url: unknown, sources: readonly MalikCitation[] | null | undefined): string {
  const safe = typeof url === "string" ? safeHttps(url.trim()) : ""
  if (!safe) return ""
  const host = hostOf(safe)
  if (!host) return ""
  if (sources?.length) {
    const sites = new Set(sources.map((source) => siteOf(hostOf(source.url))).filter(Boolean))
    return sites.has(siteOf(host)) ? safe : ""
  }
  const path = new URL(safe).pathname
  return path === "/" || path === "" ? safe : ""
}
