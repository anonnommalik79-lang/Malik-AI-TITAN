import type { MalikWebSource } from "./web-research-types"

/** Evidence identity is a page, not its domain. Only tracking and fragments are ignored. */
export function canonicalEvidenceUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000) return ""
  try {
    const url = new URL(value.trim())
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || !url.hostname) return ""
    url.hash = ""
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|msclkid)$/i.test(key)) url.searchParams.delete(key)
    }
    url.searchParams.sort()
    return url.href
  } catch { return "" }
}

export function evidenceUrlMatches(left: unknown, right: unknown): boolean {
  const key = canonicalEvidenceUrl(left)
  return Boolean(key && key === canonicalEvidenceUrl(right))
}

const bounded = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : undefined
const date = (value: unknown) => typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value)) ? value : undefined

/** Shared by SSE and persisted history. Never manufacture a read receipt from a search hit. */
export function normalizeWebSource(value: unknown): MalikWebSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (!canonicalEvidenceUrl(raw.url)) return null
  const url = (raw.url as string).trim()
  const domain = new URL(url).hostname.replace(/^www\./, "")
  return {
    url, domain, title: bounded(raw.title, 220) || domain,
    snippet: bounded(raw.snippet, 5200), provider: bounded(raw.provider, 80),
    publishedAt: date(raw.publishedAt), eventAt: date(raw.eventAt), updatedAt: date(raw.updatedAt),
    indexedAt: date(raw.indexedAt), checkedAt: date(raw.checkedAt), readAt: date(raw.readAt),
    ...(raw.currentCatalog === true ? { currentCatalog: true } : {}),
    ...(["primary", "reporting", "unknown"].includes(String(raw.authority)) ? { authority: raw.authority as MalikWebSource["authority"] } : {}),
    ...(["recent", "old", "undated", "outside-window", "historical"].includes(String(raw.freshness)) ? { freshness: raw.freshness as MalikWebSource["freshness"] } : {}),
    ...(typeof raw.image === "string" && raw.image.length <= 1200 && canonicalEvidenceUrl(raw.image).startsWith("https:") ? { image: raw.image } : {}),
  }
}

export function sourceWasRead(source: Pick<MalikWebSource, "readAt">, now = Date.now()): boolean {
  const at = source.readAt ? Date.parse(source.readAt) : NaN
  return Number.isFinite(at) && at <= now + 60_000
}

export function summarizeSourceAccess(sources: readonly Pick<MalikWebSource, "readAt">[], now = Date.now()) {
  const read = sources.filter(source => sourceWasRead(source, now)).length
  return { found: sources.length, read, snippets: sources.length - read }
}

/** Display publication and retrieval dates separately: a fresh fetch is not a fresh article. */
export function sourceEvidenceLabel(source: MalikWebSource, now = Date.now()): string {
  const parts = [sourceWasRead(source, now) ? "Страница прочитана" : "Результат поиска · страница не прочитана"]
  const shortDate = (raw: string) => new Date(raw).toISOString().slice(0, 10)
  if (date(source.publishedAt)) parts.push(`Опубликовано ${shortDate(source.publishedAt!)}`)
  if (date(source.eventAt)) parts.push(`Событие ${shortDate(source.eventAt!)}`)
  if (date(source.checkedAt)) parts.push(`Проверено ${shortDate(source.checkedAt!)}`)
  if (source.freshness === "old" || source.freshness === "outside-window") parts.push("Вне запрошенного периода")
  return parts.join(" · ")
}
