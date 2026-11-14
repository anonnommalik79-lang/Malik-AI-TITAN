import { canonicalEvidenceUrl } from "../ai/source-evidence"

export type UiEvidenceSource = { url?: string; title?: string; snippet?: string; readAt?: string; checkedAt?: string }

/** A lexical consistency check, never a claim of semantic or scientific verification. */
export function evidenceNumbers(text: string): Set<number> {
  const tokens = text.slice(0, 64_000).normalize("NFKC").replace(/[−–]/g, "-")
    .match(/(?<![\p{L}\p{N}])[-+]?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?:e[-+]?\d+)?(?![\p{L}\p{N}])/giu) || []
  return new Set(tokens.map(token => Number(token.replace(/[ \u00a0\u202f]/g, "").replace(",", "."))).filter(Number.isFinite))
}

export function checkedSourceRefs(raw: unknown, sources: readonly UiEvidenceSource[]): number[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.slice(0, 32).filter((ref): ref is number => typeof ref === "number" && Number.isInteger(ref)
    && ref >= 1 && ref <= sources.length && Boolean(canonicalEvidenceUrl(sources[ref - 1]?.url))))].slice(0, 12)
}

export function chartSourceEvidence(values: readonly number[], refs: readonly number[], sources: readonly UiEvidenceSource[]): number[] {
  const candidates = refs.length ? refs : checkedSourceRefs(sources.slice(0, 12).map((_, index) => index + 1), sources)
  const missing = new Set(values)
  const matched: number[] = []
  for (const ref of candidates) {
    const numbers = evidenceNumbers(sources[ref - 1]?.snippet || "")
    if ([...missing].some(value => numbers.has(value))) matched.push(ref)
    for (const value of numbers) missing.delete(value)
    if (missing.size === 0) break
  }
  return missing.size === 0 ? matched : []
}
