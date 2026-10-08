import { answerCardsToText } from "@/lib/ai/answer-cards"
import { stripAnswerPhotoHints } from "@/lib/ai/answer-photo-hints"

/**
 * Public answer links - the contract shared by the chat, the API and the page.
 *
 * A link is a frozen copy of one finished answer and the question it replied
 * to. It exists only because its owner asked for it, the owner can remove it
 * at any time, and search engines are told to skip it unless the owner opts
 * in. Nothing here touches storage, so the chat, the server and the tests use
 * the same rules.
 */

export const SHARE_LIMITS = {
  /** Long prompts are kept, but the page shows a readable part of them. */
  questionChars: 4000,
  answerBytes: 256 * 1024,
  modelChars: 80,
  messageIdChars: 200,
  sources: 24,
  sourceTitleChars: 200,
  sourceUrlChars: 600,
  /** Links one account may keep; old ones can be removed from their pages. */
  perAccount: 300,
  /** New links per account in 24 hours. */
  perDay: 60,
  requestBytes: 512 * 1024,
} as const

export type SharedAnswerSource = { title: string; url: string }

export type SharedAnswerInput = {
  messageId: string
  question: string
  answer: string
  model: string
  sources: SharedAnswerSource[]
  discoverable: boolean
}

/** The stored record. `owner` and `messageKey` never leave the server. */
export type SharedAnswer = SharedAnswerInput & {
  version: 1
  id: string
  owner: string
  messageKey: string
  createdAt: string
  updatedAt: string
}

/** What a visitor's browser may see. */
export type PublicSharedAnswer = {
  id: string
  question: string
  answer: string
  model: string
  sources: SharedAnswerSource[]
  discoverable: boolean
  createdAt: string
}

export type ShareInputError =
  | "INVALID_BODY"
  | "INVALID_MESSAGE"
  | "EMPTY_ANSWER"
  | "ANSWER_TOO_LARGE"

export const SHARE_ID_PATTERN = /^[A-Za-z0-9]{10,16}$/

export function isShareId(value: unknown): value is string {
  return typeof value === "string" && SHARE_ID_PATTERN.test(value)
}

export function sharePath(id: string) {
  return `/a/${id}`
}

/**
 * C0/C1 controls (tabs and newlines stay), byte-order marks, and bidi
 * embeddings, overrides and isolates - the characters that can make a public
 * page read differently from what was shared. Built from a string so no
 * transpiler ever sees a raw line separator inside a regex literal.
 */
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]", "gu")

export function cleanShareText(value: unknown, maxChars: number) {
  const text = String(value ?? "").replace(/\r\n?/gu, "\n").replace(CONTROL, "").trim()
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  // Never end on half of a surrogate pair.
  return (/[\ud800-\udbff]$/u.test(cut) ? cut.slice(0, -1) : cut).trimEnd() + "…"
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).length
}

export function safeShareUrl(value: unknown) {
  const raw = String(value || "").trim()
  if (!raw || raw.length > SHARE_LIMITS.sourceUrlChars) return ""
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return ""
    return url.toString()
  } catch {
    return ""
  }
}

/**
 * Sources keep their positions: the answer's [n] markers point at them by
 * number, so an unusable source stays as an empty slot instead of shifting
 * every later citation onto the wrong page.
 */
export function cleanShareSources(value: unknown): SharedAnswerSource[] {
  if (!Array.isArray(value)) return []
  const sources = value.slice(0, SHARE_LIMITS.sources).map((item): SharedAnswerSource => {
    const data = item && typeof item === "object" ? item as { url?: unknown; title?: unknown } : {}
    const url = safeShareUrl(data.url)
    const title = cleanShareText(data.title, SHARE_LIMITS.sourceTitleChars).replace(/\s+/gu, " ")
    return { title: title || (url ? new URL(url).hostname.replace(/^www\./u, "") : ""), url }
  })
  while (sources.length && !sources[sources.length - 1].url) sources.pop()
  return sources
}

export function sanitizeShareInput(body: unknown): { ok: true; value: SharedAnswerInput } | { ok: false; code: ShareInputError } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, code: "INVALID_BODY" }
  const data = body as Record<string, unknown>
  const messageId = cleanShareText(data.messageId, SHARE_LIMITS.messageIdChars + 1)
  if (!messageId || messageId.length > SHARE_LIMITS.messageIdChars) return { ok: false, code: "INVALID_MESSAGE" }
  // Internal photo metadata is for the chat's own photo search; a public page
  // never runs those searches.
  const answer = stripAnswerPhotoHints(String(data.answer ?? "").replace(/\r\n?/gu, "\n").replace(CONTROL, "")).trim()
  if (!answer) return { ok: false, code: "EMPTY_ANSWER" }
  if (utf8Bytes(answer) > SHARE_LIMITS.answerBytes) return { ok: false, code: "ANSWER_TOO_LARGE" }
  return {
    ok: true,
    value: {
      messageId,
      question: cleanShareText(data.question, SHARE_LIMITS.questionChars),
      answer,
      model: cleanShareText(data.model, SHARE_LIMITS.modelChars).replace(/\s+/gu, " "),
      sources: cleanShareSources(data.sources),
      discoverable: data.discoverable === true,
    },
  }
}

/** Markdown and answer blocks as one line of readable text. */
export function sharePlainText(markdown: string) {
  return answerCardsToText(stripAnswerPhotoHints(String(markdown || "")))
    .replace(/```[\s\S]*?(?:```|$)/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]\n]+)\]\((?:[^)\s]+)\)/gu, "$1")
    .replace(/(?:\s?\[\d{1,2}(?:\s*[,;]\s*\d{1,2})*\])+/gu, "")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d{1,3}[.)]\s+)/gmu, "")
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/gmu, " ")
    .replace(/\|/gu, " · ")
    .replace(/(\*\*|__|`|~~)/gu, "")
    .replace(/(^|\s)[*_](\S[^*_\n]*\S|\S)[*_](?=\s|$|[.,;:!?])/gu, "$1$2")
    .replace(/\$\$?([^$]+)\$\$?/gu, "$1")
    .replace(/\s*·\s*(?:·\s*)+/gu, " · ")
    .replace(/\s+/gu, " ")
    .replace(/^\s*·\s*|\s*·\s*$/gu, "")
    .trim()
}

function clip(text: string, max: number) {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?·—-]+$/u, "") + "…"
}

/** The page title: the question's first line, or a neutral name. */
export function shareTitle(question: string, max = 90) {
  const line = String(question || "").split("\n").map((item) => sharePlainText(item)).find(Boolean) || ""
  return line ? clip(line, max) : "Ответ Malik AI"
}

/** One or two sentences for search results and link previews. */
export function shareDescription(answer: string, max = 180) {
  const text = sharePlainText(answer)
  return text ? clip(text, max) : "Ответ Malik AI"
}

export function toPublicSharedAnswer(record: SharedAnswer): PublicSharedAnswer {
  return {
    id: record.id,
    question: record.question,
    answer: record.answer,
    model: record.model,
    sources: record.sources,
    discoverable: record.discoverable,
    createdAt: record.createdAt,
  }
}

/** A stored record that is not exactly this shape is treated as missing. */
export function isSharedAnswerRecord(value: unknown): value is SharedAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return data.version === 1
    && isShareId(data.id)
    && typeof data.owner === "string" && data.owner.length > 0
    && typeof data.messageKey === "string"
    && typeof data.question === "string"
    && typeof data.answer === "string" && data.answer.length > 0
    && typeof data.model === "string"
    && Array.isArray(data.sources)
    && typeof data.discoverable === "boolean"
    && typeof data.createdAt === "string"
}
