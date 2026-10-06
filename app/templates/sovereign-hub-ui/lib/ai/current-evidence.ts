/** Changing facts are checked at request time, never inferred from a training cutoff. */
export function needsCurrentEvidence(prompt: string): boolean {
  return /(?:сейчас|сегодня|вчера|последн|новейш|свеж|актуальн|новост|выпуст|релиз|выш[её]л|доступн|существу|верси[яию]|обновлен|цен[ауы]|сколько\s+стоит|курс\s+валют|президент|министр|расписани|спикер|\b(?:news|latest|current|today|yesterday|release|version|available|president|ceo|price|schedule)\b|(?:gpt|gemini|claude|grok|deepseek|qwen)(?:\s+(?:opus|sonnet|haiku|flash))?[ -]?\d)/iu.test(prompt)
}

export function currentResearchDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

/** Keep the user's exact generations; comparisons need evidence for each contender. */
export function currentModelSubjects(prompt: string): string[] {
  const names = prompt.match(/(?:GPT|Gemini|Claude|Grok|DeepSeek|Qwen)(?:\s+(?:opus|sonnet|haiku|flash))?[ -]?\d[\w.-]*(?:\s+(?:pro|max|mini|nano|flash|lite|thinking|sonnet|opus|haiku|sol|ultra|preview))*/giu) || []
  return [...new Map(names.map((name) => [name.toLowerCase().replace(/[-\s]+/gu, " "), name])).values()].slice(0, 2)
}

export function currentModelQueries(prompt: string): string[] {
  return currentModelSubjects(prompt).map((name) => {
    const sites = /^gemini/iu.test(name) ? "site:deepmind.google OR site:ai.google.dev OR site:blog.google"
      : /^gpt/iu.test(name) ? "site:openai.com OR site:developers.openai.com"
      : /^claude/iu.test(name) ? "site:anthropic.com OR site:claude.com"
      : /^grok/iu.test(name) ? "site:x.ai"
      : /^deepseek/iu.test(name) ? "site:deepseek.com"
      : "site:qwen.ai OR site:qwenlm.github.io"
    return `"${name}" (${sites})`
  })
}

const PRODUCT_SITES = [
  { match: /nvidia|geforce|нвидиа|нвидия/iu, domains: ["nvidia.com"] },
  { match: /iphone|ipad|apple|айфон/iu, domains: ["apple.com"] },
  { match: /samsung|самсунг/iu, domains: ["samsung.com"] },
  { match: /windows|microsoft|виндовс/iu, domains: ["microsoft.com"] },
  { match: /chatgpt|openai|чатгпт/iu, domains: ["openai.com"] },
  { match: /gemini|google|gmail|гугл/iu, domains: ["deepmind.google", "google.com", "ai.google.dev"] },
  { match: /claude|anthropic|клод/iu, domains: ["anthropic.com", "claude.com"] },
]

export function officialProductQuery(prompt: string): string {
  const owner = PRODUCT_SITES.find((entry) => entry.match.test(prompt))
  return owner ? `${prompt.replace(/[\r\n"<>]/gu, " ").slice(0, 180)} (${owner.domains.map((domain) => "site:" + domain).join(" OR ")})` : ""
}

/** Mention coverage is not a claim that the cited version exists or is released. */
export function mentionedCurrentModels(prompt: string, text: string): string[] {
  const normalize = (value: string) => value.toLowerCase().replace(/[\u2010-\u2015_-]/gu, " ").replace(/\s+/gu, " ")
  const metadata = normalize(text)
  return currentModelSubjects(prompt).filter((name) => {
    const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
    return new RegExp("(?<![\\p{L}\\p{N}])" + escaped + "(?![\\p{L}\\p{N}])", "u").test(metadata)
  })
}

export function currentEvidenceInstruction(prompt: string, date = currentResearchDate()): string {
  if (!needsCurrentEvidence(prompt)) return ""
  return `CURRENT EVIDENCE CHECK · ${date} (Asia/Almaty): Training knowledge can be outdated. Check the exact names and versions the user requested against the supplied current sources, separately for each contender. Do not replace a requested version with an older version unless the user asks for alternatives. Missing search results, a generic product page, or an old release page do NOT prove that a product/model/event does not exist. If exact-version evidence is missing, say "I could not verify this exact version from the available sources", not "it does not exist". A retrieval date is not a publication or release date. Distinguish the date an event occurred from the date of the article, and do not call a version the latest without supporting current evidence. Cite the exact sources for availability, prices, roles, announcements and benchmarks; leave unsupported details unconfirmed. Never claim 100% knowledge of all world events.`
}

export function currentSourcePriority(prompt: string, source: { domain: string; title?: string; snippet?: string; publishedAt?: string }, now = Date.now()): number {
  const domain = source.domain.toLowerCase().replace(/^www\./u, "")
  const owner = PRODUCT_SITES.find((entry) => entry.match.test(prompt))
  const owned = Boolean(owner?.domains.some((site) => domain === site || domain.endsWith("." + site)))
  if (!needsCurrentEvidence(prompt)) return owned ? 12 : 0
  const primary = /(?:^|\.)(?:openai\.com|anthropic\.com|claude\.com|deepmind\.google|ai\.google\.dev|blog\.google|x\.ai|deepseek\.com|qwen\.ai|qwenlm\.github\.io)$/u.test(domain)
  const published = source.publishedAt ? Date.parse(source.publishedAt) : NaN
  const age = now - published
  const recent = Number.isFinite(age) && age >= 0 && age <= 30 * 86400000 ? 8 : 0
  const exactVersion = mentionedCurrentModels(prompt, `${source.title || ""} ${source.snippet || ""}`).length > 0
  return (primary || owned ? 12 : 0) + recent + (exactVersion ? 24 : 0)
}
