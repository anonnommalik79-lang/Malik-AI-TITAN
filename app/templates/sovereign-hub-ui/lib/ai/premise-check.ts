/**
 * Answer reliability helpers.
 *
 * 1. Premise check: «Когда X сделал Y?» assumes that Y happened. The model is
 *    told to decide that first, and an answer that denies the premise is a
 *    complete, useful answer, not a failed date lookup.
 * 2. Clock answers: «какой сейчас год», «какое сегодня число» come from the
 *    server clock. No search and no model call.
 * 3. Evidence digest: when a claim has to be withheld, the person still gets
 *    what the sources do say instead of a bare refusal.
 */

import { canonicalEvidenceUrl } from "./source-evidence"
import { chatTimeZone } from "./freshness-intent"

const WHEN_ACTION = /^(?:а\s+)?(?:когда|в\s+каком\s+году|как\s+давно)(?=\s)|^(?:when|what\s+year|in\s+what\s+year)\s+(?:did|was|were|has|have)(?=\s)|(?:қашан|қай\s+жылы)/iu
const PAST_VERB = /(?<![\p{L}])\p{L}{3,}(?:л|ла|ло|ли|лся|лась|лось|лись)(?![\p{L}])/iu
const DENIAL = /(?:(?<![\p{L}])не\s+\p{L}{3,}(?:л|ла|ло|ли|лся|лась|лось|лись)(?![\p{L}])|никогда\s+не|ни\s+разу\s+не|(?:ещ[её]|пока)\s+не(?![\p{L}])|нет\s+(?:подтвержд|свидетельств|данных|сведений)|(?:такого|этого)\s+(?:события\s+|факта\s+)?не\s+(?:было|происходило|случалось)|не\s+существует|(?:has|have|had|did|was|were)\s+(?:not|never)(?![\p{L}])|(?:hasn|haven|didn|wasn|weren)['’]t|\bnever\s+\p{L}+ed\b|\bno\s+(?:evidence|record))/iu
const YEARS = /(?<!\d)(?:1[5-9]\d{2}|20\d{2})(?!\d)/gu

/** True for a question that takes an event for granted and asks when it happened. */
export function isPremiseQuestion(question: string): boolean {
  const text = String(question || "").normalize("NFKC").trim().replace(/\s+/g, " ")
  if (!text || text.length > 400 || !WHEN_ACTION.test(text)) return false
  return /^(?:when|what|in)\s/iu.test(text) || PAST_VERB.test(text) || /(?:жасады|құрды|ашты|құрылған|болды)/iu.test(text)
}

export function premiseInstruction(question: string): string {
  if (!isPremiseQuestion(question)) return ""
  return [
    "PREMISE CHECK: The question assumes that an event happened. Decide that first.",
    "If reliable evidence establishes that the event did not happen, correct that premise in the FIRST sentence. If evidence is absent, say you could not confirm the event, NOT that it never happened. Never invent a date.",
    "Then give the closest established facts: what the person or organization actually did, related projects, statements or plans, with years only where the evidence supports them.",
    "If the event did happen, answer with the date directly. Never reply only that the fact could not be verified.",
  ].join(" ")
}

/** The opening of the answer says the assumed event did not happen. */
export function deniesPremise(answer: string): boolean {
  const first = String(answer || "").normalize("NFKC").trim().split(/(?<=[.!?…])\s+|\n/u)[0].slice(0, 500)
  return DENIAL.test(first)
}

const stopWords = new Set("the a an this that did was were has have had not never of on in at to and or it is are no не нет это этого такого что как когда году год был была было были есть или и в на по за ещё пока для из с an event событие события".split(" "))
const wordsOf = (text: string) => (text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) || []).filter(word => word.length > 2 && !stopWords.has(word)).map(word => word.length > 5 ? word.slice(0, -2) : word)

/** Conservative lexical guard; never treat the absence of a result as proof of absence. */
export function supportsPremiseSentence(sentence: string, evidence: string): boolean {
  const words = [...new Set(wordsOf(sentence))]
  if (words.length < 2) return false
  const numbers = sentence.match(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu) || []
  return evidence.split(/(?<=[.!?…])\s+|\n+/u).some(part => {
    const actual = new Set(wordsOf(part))
    return deniesPremise(sentence) === deniesPremise(part)
      && words.filter(word => actual.has(word)).length >= Math.max(2, Math.ceil(words.length * 0.7))
      && numbers.every(number => new RegExp(`(?<!\\d)${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`, "u").test(part))
  })
}

/**
 * Retains the denial and related statements only when the evidence text
 * matches the subject and numeric details of each statement.
 */
export function keepEvidencedSentences(answer: string, evidenceText: string): string {
  const known = (year: string) => evidenceText.includes(year)
  const parts = String(answer || "").split(/((?<=[.!?…])\s+|\n+)/u)
  let out = ""
  for (let index = 0; index < parts.length; index += 2) {
    const sentence = parts[index]
    if ([...sentence.matchAll(YEARS)].every((match) => known(match[0])) && supportsPremiseSentence(sentence, evidenceText)) out += sentence + (parts[index + 1] || "")
  }
  const kept = out.replace(/\n{3,}/g, "\n\n").trim()
  return deniesPremise(kept) ? kept : ""
}

type DigestSource = { url?: string; title?: string; snippet?: string }

/** Up to three source lines: what the pages do say, with links. */
export function evidenceDigest(sources: readonly DigestSource[], limit = 3): string {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    const url = canonicalEvidenceUrl(source.url)
    if (!url || seen.has(url)) continue
    const title = String(source.title || "").replace(/[\[\]\n]+/g, " ").trim().slice(0, 110)
    const snippet = String(source.snippet || "").replace(/\s+/g, " ").trim().slice(0, 220)
    if (!title && !snippet) continue
    seen.add(url)
    lines.push(`- [${title || new URL(url).hostname}](<${url}>)${snippet ? `: ${snippet}${snippet.length === 220 ? "…" : ""}` : ""}`)
    if (lines.length >= limit) break
  }
  return lines.length ? `Что есть в найденных источниках:\n${lines.join("\n")}` : ""
}

const CLOCK_YEAR = /^(?:а\s+)?(?:(?:какой|который)\s+(?:сейчас|сегодня|щас|теперь)\s+(?:идет\s+)?год|(?:сейчас|сегодня)\s+какой\s+год|какой\s+год\s+(?:сейчас|сегодня|на\s+дворе)|what\s+year\s+is\s+it(?:\s+now)?|what(?:'s|\s+is)\s+the\s+(?:current\s+)?year)[\s?.!]*$/iu
const CLOCK_DATE = /^(?:а\s+)?(?:как(?:ое|ая)\s+(?:сегодня|сейчас)\s+(?:число|дата)|сегодня\s+какое\s+число|какой\s+сегодня\s+день(?:\s+недели)?|какое\s+число\s+сегодня|what(?:'s|\s+is)\s+(?:the\s+date\s+today|today'?s\s+date|the\s+date)|what\s+day\s+is\s+(?:it|today)(?:\s+today)?)[\s?.!]*$/iu

/** The answer to a bare year/date question from the server clock, or "". */
export function clockReply(prompt: string, now = new Date(), requestedZone?: unknown): string {
  const text = String(prompt || "").normalize("NFKC").toLowerCase().replace(/ё/g, "е").trim().replace(/\s+/g, " ")
  if (!text || text.length > 60) return ""
  if (!Number.isFinite(now.getTime())) return ""
  const timeZone = chatTimeZone(requestedZone)
  const kazakh = /[әіңғүұқөһ]/iu.test(text)
  const english = !kazakh && !/[а-я]/iu.test(text)
  const part = (locale: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(now)
  if (CLOCK_YEAR.test(text) || /^(?:қазір|бүгін)\s+(?:қай|қандай)\s+жыл[\s?.!]*$/iu.test(text)) {
    const year = part("en-US", { year: "numeric" })
    return kazakh ? `Қазір ${year} жыл.` : english ? `It is ${year}.` : `Сейчас ${year} год.`
  }
  if (CLOCK_DATE.test(text) || /^бүгін\s+(?:қай\s+күн|нешесі|айдың\s+нешесі)[\s?.!]*$/iu.test(text)) {
    if (kazakh) return `Бүгін ${part("kk-KZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`
    if (english) return `Today is ${part("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`
    const weekday = part("ru-RU", { weekday: "long" })
    const date = part("ru-RU", { year: "numeric", month: "long", day: "numeric" }).replace(/\s*г\.?$/u, "")
    return `Сегодня ${weekday}, ${date} года.`
  }
  if (/^(?:а\s+)?(?:(?:сколько\s+(?:сейчас\s+)?времени|какое\s+сейчас\s+время)|what\s+time\s+is\s+it(?:\s+now)?|қазір\s+сағат\s+неше)[\s?.!]*$/iu.test(text)) {
    const time = part("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    return kazakh ? `Қазір сағат ${time} (${timeZone}).` : english ? `It is ${time} (${timeZone}).` : `Сейчас ${time} (${timeZone}).`
  }
  return ""
}
