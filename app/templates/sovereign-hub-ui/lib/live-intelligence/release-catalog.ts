import type { MalikWebSource } from "../ai/web-research-types"

const mostRecent = /(?:последн\p{L}*|новейш\p{L}*|актуальн\p{L}*|\b(?:latest|newest|current)\b|соңғы|қазіргі)/iu
const release = /(?:модел\p{L}*|верси\p{L}*|релиз\p{L}*|сборк\p{L}*|\b(?:models?|versions?|releases?|builds?)\b|нұсқа\p{L}*)/iu

export function asksLatestRelease(question: string) {
  return mostRecent.test(question) && release.test(question)
}

const publishers = [
  { id: "openai", name: "OpenAI", domain: "openai.com", subject: /\b(?:gpt|openai|chatgpt)\b|(?<!\p{L})(?:чат[ -]?гпт|гпт|джипити|опен[ -]?аи|опен[ -]?ии)(?!\p{L})/iu, model: /^(?:Introducing|Announcing|Releasing) (GPT[-‑ ]\d+(?:\.\d+)*)(?: (Astra|Sol|Terra|Luna|Pro|mini|nano|Turbo)(?: and (Astra|Sol|Terra|Luna|Pro|mini|nano|Turbo))?)?$/iu },
  { id: "deepmind", name: "Google", domain: "deepmind.google", subject: /\bgemini\b|(?<!\p{L})(?:джемини|джимини|гемини|гимини|жемини)(?!\p{L})/iu, model: /^(?:(?:Introducing|Announcing|Releasing) )?(Gemini \d+(?:\.\d+)*)(?: (Pro|Flash|Flash-Lite|Ultra))?(?::.{1,100})?$/iu },
  { id: "anthropic", name: "Anthropic", domain: "anthropic.com", subject: /\b(?:claude|anthropic)\b|(?<!\p{L})(?:клод|клоуд|антропик|антропикс)(?!\p{L})/iu, model: /^(?:(?:Introducing|Announcing|Releasing) )?(Claude (?:Opus|Sonnet|Haiku) \d+(?:\.\d+)*)(?::.{1,100})?$/iu },
] as const

export type ReleasePublisher = typeof publishers[number]

export function releasePublisher(question: string) {
  if (!asksLatestRelease(question)) return
  const matching = publishers.filter(publisher => publisher.subject.test(question))
  if (matching.length === 1) return matching[0]
}

function modelName(publisher: ReleasePublisher, title: string) {
  const match = publisher.model.exec(title.trim())
  if (!match || /\b(?:preview|beta|experimental|early access)\b/iu.test(title)) return
  return [match[1].replace(/[-‑ ](?=\d)/u, publisher.id === "openai" ? "-" : " "), match[2], match[3] && "and " + match[3]].filter(Boolean).join(" ")
}

/** Release receipts are minted from an official feed and rechecked after search transport. */
export function publisherRelease(source: MalikWebSource, question: string) {
  const publisher = releasePublisher(question)
  if (!publisher || source.provider !== `publisher-releases:${publisher.id}` || !source.publishedAt) return
  let url: URL
  try { url = new URL(source.url) } catch { return }
  if (url.protocol !== "https:" || url.hostname !== publisher.domain && url.hostname !== "www." + publisher.domain ||
    !/^\/(?:index|blog|news)\//u.test(url.pathname)) return
  const name = modelName(publisher, source.title)
  if (name && Number.isFinite(Date.parse(source.publishedAt))) return { name, publisher: publisher.name, day: source.publishedAt.slice(0, 10) }
}

export function verifiedPublisherRelease(
  question: string, sources: readonly MalikWebSource[], language: "ru" | "en" | "kk", format?: "json",
) {
  // This answer settles the general release. Product-specific rollout dates, comparisons and requested analysis still go through the model.
  if (format || question.length > 155 || /(?:сравн|сильн|отлич|почему|цена|стоимость|таблиц|инструкц|подробн|напиши|создай|compare|strongest|price|why|differences|write|preview|бета|\b(?:codex|api|work|enterprise|plus|pro|astra|sol)\b|в\s+(?:чате|chatgpt|20\d{2})|\bin\s+(?:chatgpt|20\d{2})|\b20\d{2}\b)/iu.test(question)) return
  const releases = sources.flatMap((source, index) => {
    const receipt = publisherRelease(source, question)
    return receipt ? [{ ...receipt, citation: index + 1 }] : []
  }).sort((a, b) => b.day.localeCompare(a.day))
  const best = releases[0]
  if (!best) return
  const date = new Intl.DateTimeFormat(language, { dateStyle: "long", timeZone: "UTC" }).format(new Date(best.day + "T00:00:00Z"))
  const name = language === "ru" ? best.name.replace(" and ", " и ") : best.name
  if (language === "ru") return `${best.publisher} представила **${name}** **${date}** [${best.citation}].`
  if (language === "kk") return `${best.publisher} **${name}** моделін **${date}** таныстырды [${best.citation}].`
  return `${best.publisher} introduced **${name}** on **${date}** [${best.citation}].`
}
