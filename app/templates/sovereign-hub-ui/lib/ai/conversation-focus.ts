/**
 * What the latest message is about, read against the conversation.
 *
 * «а третий?», «а сколько ему лет?», «почему?», «сравни их» mean nothing on
 * their own. The model sees the history and copes; everything decided before
 * the model - whether to search, what to search for, what shape the answer
 * takes - used to see only the bare follow-up, so «а третий?» searched the web
 * for «а третий» and the answer drifted off the subject. ChatGPT reads a
 * follow-up as part of the conversation; so does Malik AI now.
 */

type Turn = { role?: unknown; content?: unknown }
import { isContinueRequest } from "./answer-completion"
import { NO_WEB } from "./freshness-intent"
import { normalizeColloquial } from "./colloquial"

const ACKNOWLEDGEMENT = /^(?:спасибо|спс|рахмет|благодарю|thanks|thank\s+you|thx|ок|окей|ok|okay|да|нет|ага|угу|yes|no|понятно|ясно|хорошо|отлично|супер|класс|круто|жақсы|иә|жоқ)[\s!.)]*$/iu
const FOLLOW_START = /^(?:а|и|но|ну|так|тогда|ещё|еще|(?:(?:and|but)\s+)?(?:what|how)\s+about|and|but|so|ал)(?![\p{L}])[,\s]*/iu
const BARE = /^(?:а\s+)?(?:почему|зачем|как\s+так|когда|где|откуда|сколько|подробнее|подробней|детальнее|ещё|еще|продолжай|дальше|короче|кратко|пример|примеры|почему\s+так|why|how\s+come|when|where|more|continue|go\s+on|example|examples|неге|қашан|тағы)[\s?!.]*$/iu
const REFERENCE = /(?<![\p{L}])(?:он|она|оно|они|его|её|ее|их|ему|ей|им|ним|ними|ней|нему|него|неё|них|этот|эта|это|эти|этого|этой|этих|этому|тот|та|те|того|той|тех|там|туда|оттуда|it|its|he|him|his|she|her|they|them|their|this|that|these|those|ол|олар|оның|оған|бұл|сол)(?![\p{L}])/iu
/** «третий?», «а следующий?» - an ordinal with nothing else; «второй президент» names its subject. */
const ORDINAL_ONLY = /^(?:(?:и|а|ну|ещё|еще|какой|какая|кто|and|the)\s+)?(?:перв|втор|трет|четв[её]рт|пят|шест|седьм|восьм|девят|десят|следующ|предыдущ|последн|остальн|first|second|third|fourth|fifth|next|previous|last|other)\p{L}*[\s?!.]*$/iu
/** A capitalised name, or a Latin word inside Cyrillic text: the message brings its own subject. */
function ownSubject(text: string) {
  return /(?<=\s)[A-ZА-ЯЁӘІҢҒҮҰҚӨҺ][\p{L}]{2,}/u.test(text)
    || (/[а-яёәіңғүұқөһ]/iu.test(text) && /(?<![\p{L}])[a-z]{3,}(?![\p{L}])/iu.test(text))
}
/** «сделай это короче», «напиши про это стих»: work on the previous answer, not a question to look up. */
const TRANSFORM = /^(?:(?:а|и|теперь|now|then)\s+)?(?:напиши|перепиши|сократи|сделай|переведи|исправь|дополни|продолжи|оформи|сочини|придумай|translate|rewrite|shorten|make)(?![\p{L}])/iu
const CONTEXT_EDIT = /^(?:(?:а|и|теперь|now|then|please|енді)[,\s]+)*(?:лучше|проще|улучши|исправь\s+предыдущ|better|simpler|improve(?:\s+it)?|plain\s+text|no\s+table|жақсырақ\s+жаса|қарапайымырақ|алдыңғы\s+жауаб\p{L}*\s+түзет|қысқаша|тізімсіз|қазақша|орысша|ағылшынша)(?![\p{L}])/iu
const PREFERENCE_ONLY = /^(?:(?:а|и|теперь|now|then|please|енді|в\s+этом\s+разговоре|for\s+this\s+chat|осы\s+әңгімеде)[,\s]+)*(?:(?:отвечай|ответь|пиши|answer|reply|respond)\s+)?(?:(?:по[- ]?|на\s+|in\s+))?(?:русск\p{L}*|казахск\p{L}*|английск\p{L}*|english|russian|kazakh|қазақша|орысша|ағылшынша|кратко|подробно|briefly|қысқаша|json\s+only)(?:[,\s]+(?:(?:и|and|және)\s+)?(?:кратко|подробно|подробнее|briefly|қысқаша|без\s+списков|without\s+(?:lists|bullets)|тізімсіз))*[.!?\s]*$/iu
const QUESTION_WORD = /(?<![\p{L}])(?:почему|зачем|как|когда|где|откуда|сколько|кто|что|чем|какой|какая|какое|какие|why|how|when|where|who|what|which|неге|қалай|қашан|кім|не)(?![\p{L}])/iu
const QUESTION_START = /^(?:почему|зачем|как|когда|где|откуда|сколько|кто|что|чем|какой|какая|какое|какие|why|how|when|where|who|what|which|неге|қалай|қашан|кім|не|қанша)(?!\p{L})/iu
const RANK_FOLLOW_UP = /^(?:(?:\d{4}(?:\s+год)?|он|она|они)\s+)?(?:на\s+каком\s+месте(?:\s+(?:он|она|они|\d{4}))?|сколько\s+месте\s+сто[ий]т|какое\s+место(?:\s+(?:занимает|у\s+него))?|what\s+rank|where\s+(?:does\s+it|do\s+they)\s+rank)[\s?!.]*$/iu
const REACTION = /^(?:по[чя]|почему)\s+(?:(?:так|очень)\s+)?(?:мало|много)[\s?!.]*$/iu
const CORRECTION = /^(?:нет|неа|no|жоқ)[,\s]+/iu

export function isNumberReaction(prompt: string): boolean {
  return REACTION.test(prompt.trim())
}
const SEARCH_AGAIN = /^(?:(?:а|и|теперь|then|now|actually|please|енді)[,\s]+)*(?:поищи(?:\s+в\s+(?:сети|интернете))?|проверь\s+(?:в\s+интернете|онлайн)|загугли|(?:look\s+it\s+up|search\s+the\s+web|browse\s+online)(?:\s+now)?|интернеттен\s+(?:ізде|тап))[.!?\s]*$/iu
const TIME_SCOPE = /(?<![\p{L}\p{N}])(?:(?:за\s+)?(?:последн\p{L}*\s+)?(?:24\s+час\p{L}*|(?:7|семь)\s+дн\p{L}*)|сегодня|вчера|сейчас|на\s+данный\s+момент|на\s+этой\s+неделе|в\s+прошлом\s+(?:месяце|году)|(?:за\s+)?(?:текущ\p{L}*|прошл\p{L}*)\s+(?:недел\p{L}*|месяц\p{L}*|год\p{L}*)|(?:in\s+the\s+)?(?:last|past)\s+(?:24\s+hours|(?:7|seven)\s+days)|today|yesterday|currently|now|(?:this|last)\s+(?:week|month|year)|бүгін|кеше|қазір|соңғы\s+(?:24\s+сағат|7\s+күн|апта)|осы\s+(?:апта|ай|жыл)|(?:в|за|in)\s+(?:19|20)\d{2}(?:\s+году)?|(?:19|20)\d{2}\s+жылы)(?![\p{L}\p{N}])/giu
const ENTITY = /^[\p{Lu}\p{Lt}\d][\p{L}\p{N}.&+-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}.&+-]*){0,3}$/u
const ROLE_OR_VERSION = /^(.{0,120}?(?<!\p{L})(?:(?:ceo|cto|founder|chief\s+executive\s+officer|директор|основател\p{L}*|верси\p{L}*|version)(?:\s+(?:of|at|for))?)\s+)([\p{L}\p{N}][\p{L}\p{N}.&+-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}.&+-]*){0,3})$/iu

function words(text: string) {
  return text.split(/\s+/u).filter(Boolean)
}

/** True when the message only makes sense together with the previous turn. */
export function isContextDependent(prompt: string): boolean {
  const text = String(prompt || "").trim()
  if (!text || text.length > 140 || ACKNOWLEDGEMENT.test(text)) return false
  const count = words(text).length
  if (count > 10) return false
  if (isContinueRequest(text) || CONTEXT_EDIT.test(text) || PREFERENCE_ONLY.test(text) || SEARCH_AGAIN.test(text)) return true
  if (BARE.test(text) || REACTION.test(text) || RANK_FOLLOW_UP.test(normalizeColloquial(text))) return true
  if (CORRECTION.test(text)) {
    const correction = text.replace(CORRECTION, "").trim()
    return words(correction).length <= 4
  }
  if (FOLLOW_START.test(text)) {
    const rest = strip(text)
    return !QUESTION_WORD.test(rest) || !ownSubject(rest) || REFERENCE.test(rest)
  }
  if (ORDINAL_ONLY.test(text)) return true
  return count <= 5 && REFERENCE.test(text) && !ownSubject(text)
}

/** Factual follow-ups still need an answer and may need fresh evidence. */
export function isContextQuestion(prompt: string): boolean {
  const text = String(prompt || "").trim()
  const normalized = normalizeColloquial(strip(text))
  return QUESTION_START.test(normalized) || REACTION.test(normalized) || RANK_FOLLOW_UP.test(normalized)
    || FOLLOW_START.test(text) && /\?$/u.test(text) && !TRANSFORM.test(text) && !CONTEXT_EDIT.test(text) && !PREFERENCE_ONLY.test(text)
}

function previousUserQuestions(prompt: string, history: unknown): string[] {
  if (!Array.isArray(history)) return []
  const current = String(prompt || "").trim()
  const asked: string[] = []
  let skippedCurrent = false
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index] as Turn
    if (turn?.role !== "user" || typeof turn.content !== "string") continue
    // The dashboard appends media facts after a blank line; the question is the first part.
    const content = turn.content.split(/\n\n\[MALIK_/u)[0].trim()
    if (!content) continue
    if (!skippedCurrent && content === current) { skippedCurrent = true; continue }
    skippedCurrent = true
    asked.push(content.slice(0, 600))
    if (asked.length >= 64) break
  }
  return asked
}

export type ConversationFocus = {
  /** The latest message continues an earlier question. */
  followUp: boolean
  /** The earlier question it continues: the last one that stands on its own. */
  anchor: string
  /** What to search the web for. */
  searchText: string
  /** What decides the answer's shape (overview, head-to-head, ...). */
  shapeText: string
}

function strip(text: string) {
  return text.replace(FOLLOW_START, "").replace(/[?!.]+$/u, "").replace(/\s+/gu, " ").trim()
}

function refineSubject(text: string, subject: string, rest: string): string | undefined {
  if (SEARCH_AGAIN.test(text)) {
    const inheritedOptOut = new RegExp(NO_WEB.source, "giu")
    return subject.replace(inheritedOptOut, "").trim()
  }
  if (rest.match(TIME_SCOPE)) {
    return `${subject.replace(TIME_SCOPE, "").trim()} ${rest}`.replace(/\s+/gu, " ")
  }
  if (FOLLOW_START.test(text) && ENTITY.test(rest)) {
    const optOut = NO_WEB.exec(subject)?.[0]
    const previous = ROLE_OR_VERSION.exec(optOut ? subject.replace(optOut, "").trim() : subject)
    if (previous) return `${previous[1]}${rest}${optOut ? ` ${optOut}` : ""}`
  }
}

export function conversationFocus(prompt: string, history: unknown): ConversationFocus {
  const text = String(prompt || "").trim()
  const plain: ConversationFocus = { followUp: false, anchor: "", searchText: text, shapeText: text }
  if (!isContextDependent(text)) return plain
  const earlier = previousUserQuestions(text, history)
  // In a chain («про второго президента» → «а третий?» → «а четвёртый?») the
  // subject comes from the last question that made sense on its own.
  const index = earlier.findIndex(question => !ACKNOWLEDGEMENT.test(question) && !isContextDependent(question))
  const anchor = (index >= 0 ? earlier[index] : earlier.find(question => !ACKNOWLEDGEMENT.test(question))) || ""
  if (!anchor) return plain
  const rest = strip(text)
  let subject = anchor.replace(/[?!.]+$/u, "")
  if (index > 0) {
    // Replay concrete edits to the subject, without stacking vague follow-ups.
    for (const turn of earlier.slice(0, Math.min(index, 8)).reverse()) subject = refineSubject(turn, subject, strip(turn)) || subject
  }
  const refined = refineSubject(text, subject, rest)
  const rank = RANK_FOLLOW_UP.test(normalizeColloquial(rest))
  // «а третий?» / «а Tesla?» swaps one part of the earlier question, so the
  // answer keeps its shape. «почему?» / «подробнее» asks something new about it.
  const substitution = FOLLOW_START.test(text) && !QUESTION_WORD.test(rest) && !BARE.test(text)
  return {
    followUp: true,
    anchor,
    // «почему?», «подробнее» ask about the answer already given: no new search.
    searchText: SEARCH_AGAIN.test(text) ? `${refined || subject} ${text}`
      : BARE.test(text) || REACTION.test(text) || TRANSFORM.test(text) ? text
      : refined || (rest ? `${subject} ${rank ? normalizeColloquial(rest).replace(/сколько\s+месте\s+сто[ий]т/iu, "место в рейтинге") : rest}` : subject),
    shapeText: substitution ? `${anchor}\n${text}` : text,
  }
}

/** The instruction that keeps a follow-up on the conversation's subject. */
export function conversationFocusInstruction(prompt: string, focus: ConversationFocus): string {
  if (!focus.followUp || !focus.anchor) return ""
  const clip = (value: string) => value.replace(/\s+/gu, " ").trim().slice(0, 240)
  return [
    "CONVERSATION FOCUS:",
    `- The latest message «${clip(prompt)}» continues the conversation. The question it builds on was «${clip(focus.anchor)}».`,
    focus.searchText !== prompt ? `- Resolved topic for this turn: «${clip(focus.searchText)}».` : "",
    "- Resolve what it refers to (a person, an item, an ordinal such as «третий», «они», «он») from the conversation, then answer only the latest message about that subject.",
    REACTION.test(prompt.trim()) ? "- This is a question about why the previous number seems small or large. Explain it with a meaningful comparison and show the scale. A standalone repetition of the number does not answer the question." : "",
    "- When the latest message changes the entity or time period, apply that change before answering. An earlier target is context, not a second request.",
    "- Do not repeat or re-answer the earlier question. If the reference is genuinely ambiguous, take the most likely reading and name it in a few words.",
  ].filter(Boolean).join("\n")
}
