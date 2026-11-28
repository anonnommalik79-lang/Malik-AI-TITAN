import type { Slide } from "@/lib/presentations/types"

/** Source mode uses an explicit client brief suffix, not a guess about the subject. */
export function sourceOnlyBrief(brief: string) {
  return brief.includes("\n\nPresentation requirements:\nCreate a deck from the supplied source material.")
}
function sourceText(brief: string) {
  return sourceOnlyBrief(brief) ? brief.split("\n\nPresentation requirements:\n")[0] : brief
}
function normalize(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[«»“”"'‘’]/gu, "").replace(/\s+/gu, " ").trim()
}
function urls(text: string) {
  return (text.match(/https?:\/\/[^\s<>"']+/giu) || []).map(url => url.replace(/[),.;\]}]+$/u, ""))
}
function numbers(text: string) {
  return (text.match(/[-+−]?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,]\d+)?/gu) || [])
    .map(value => value.replace(/\s/gu, "").replace(",", ".").replace("−", "-").replace(/^\+/u, ""))
}
function contentStrings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(contentStrings)
  if (!value || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, child]) =>
    /^(?:id|layout|number|image.*|fitMode|icon)$/u.test(key) ? [] : contentStrings(child))
}

/** Reject invented citations, and in source mode require supplied figures and exact quotes.
 * This is a conservative consistency check, not verification of external facts. */
export function sourceIntegrityIssue(slide: Slide, brief: string, revision = ""): string | null {
  const supplied = sourceText(brief) + "\n" + revision
  const text = contentStrings(slide).join("\n")
  const allowedUrls = new Set(urls(supplied))
  if (urls(text).some(url => !allowedUrls.has(url))) {
    return "Remove unprovided citation URLs. Use only exact URLs supplied in the brief or revision; do not invent references."
  }
  if (!sourceOnlyBrief(brief)) return null
  if (slide.layout === "quote" && !normalize(supplied).includes(normalize(slide.quote))) {
    return "Use an exact quotation from the supplied source; do not paraphrase or invent direct speech."
  }
  const allowed = new Set(numbers(supplied))
  const claims = slide.layout === "stat"
    ? slide.stats.flatMap(stat => numbers(stat.value))
    : slide.layout === "chart" ? slide.data.map(datum => String(datum.value))
    : (text.match(/[-+−]?\d+(?:[.,]\d+)?\s*(?:%|₸|\$|€|млн\b|млрд\b|million\b|billion\b)/giu) || []).flatMap(numbers)
  if (claims.some(value => !allowed.has(value))) {
    return "Source-only mode: use the figures actually supplied, with the same units and precision. Do not add new quantitative claims."
  }
  return null
}
