/**
 * Whether an answer is really finished, said honestly.
 *
 * The MAX engine continues an answer that the provider cut off, left with an
 * open code fence or without numbered parts the user asked for. When it has
 * to stop anyway (time, the length budget, a failed continuation), the answer
 * used to arrive as an ordinary finished one. It now carries the reason, and
 * the text ends with one plain line the person can act on: «Продолжить».
 *
 * Pure and isomorphic: the server decides, the chat shows it, tests check it.
 */

export type AnswerIncompleteReason =
  | "time"
  | "budget"
  | "interrupted"
  | "length"
  | "stalled"
  | "continuation-failed"
  | "rounds"

export type AnswerIncomplete = {
  reason: AnswerIncompleteReason
  /** Numbered parts of the request that the answer still does not cover. */
  missing?: number[]
  /** A code block was opened and never closed. */
  openFence?: boolean
}

/** Facts about the finished generation that only the engine knows. */
export type CompletionSignals = {
  interrupted: boolean
  /** The provider's own reason for its last stop ("length", "stop", …). */
  finishReason?: string
  /** Why the engine stopped trying to continue, if it stopped early. */
  stopReason?: AnswerIncompleteReason
  /** Numbered requirements still missing (from brief-quality). */
  missing?: number[]
  /** A requested closing marker is still missing. */
  markerMissing?: boolean
}

export function providerCutOff(finishReason?: string) {
  return /^(?:length|max_tokens|MAX_TOKENS)$/u.test(String(finishReason || ""))
}

export function hasOpenFence(content: string) {
  return (String(content || "").match(/^\s*(?:```|~~~)/gmu) || []).length % 2 === 1
}

/**
 * Null when the answer is complete. Only signals that are facts count: a
 * broken stream, a provider stopping on its token limit, an unclosed code
 * block, numbered parts or a requested closing marker that are not there.
 */
export function assessAnswerCompletion(content: string, signals: CompletionSignals): AnswerIncomplete | null {
  const missing = (signals.missing || []).filter((value) => Number.isInteger(value) && value > 0).slice(0, 12)
  const openFence = hasOpenFence(content)
  const cut = signals.interrupted || providerCutOff(signals.finishReason)
  if (!cut && !openFence && !missing.length && !signals.markerMissing) return null
  const reason: AnswerIncompleteReason = signals.stopReason
    || (signals.interrupted ? "interrupted" : providerCutOff(signals.finishReason) ? "length" : "stalled")
  return {
    reason,
    ...(missing.length ? { missing } : {}),
    ...(openFence ? { openFence: true } : {}),
  }
}

const REASON_TEXT: Record<AnswerIncompleteReason, string> = {
  time: "сервер остановил генерацию по лимиту времени",
  budget: "достигнут лимит длины одного ответа",
  interrupted: "сервис модели оборвал поток",
  length: "модель упёрлась в лимит длины",
  stalled: "модель перестала продвигаться",
  "continuation-failed": "не удалось дописать продолжение",
  rounds: "закончились попытки продолжения",
}

/** The marker every incomplete-answer note starts with (stable, parsed by the chat). */
export const INCOMPLETE_NOTE_START = "_Ответ не завершён:"
const CONNECTION_NOTE_START = "_Соединение прервалось — ответ может быть неполным."

export function incompleteNote(incomplete: AnswerIncomplete) {
  const parts = [REASON_TEXT[incomplete.reason] || REASON_TEXT.stalled]
  if (incomplete.missing?.length) parts.push(`не хватает пунктов: ${incomplete.missing.join(", ")}`)
  if (incomplete.openFence) parts.push("блок кода не закрыт")
  return `${INCOMPLETE_NOTE_START} ${parts.join("; ")}. Нажмите «Продолжить», чтобы дописать._`
}

/** The answer text with its incomplete-note, closing an open code block first so the note is not swallowed by it. */
export function withIncompleteNote(content: string, incomplete: AnswerIncomplete | null | undefined) {
  const text = String(content || "")
  if (!incomplete || hasIncompleteNote(text)) return text
  const closed = hasOpenFence(text) ? `${text.replace(/\s*$/u, "")}\n\`\`\`` : text.replace(/\s*$/u, "")
  return `${closed}\n\n${incompleteNote(incomplete)}`
}

const TRAILING_NOTE = /\n*\s*_(?:Ответ не завершён:|Соединение прервалось — ответ может быть неполным\.)[^\n]*_\s*$/u

export function hasIncompleteNote(text: string) {
  return TRAILING_NOTE.test(String(text || ""))
}

/** True when the chat should offer «Продолжить» under this answer. */
export function answerNeedsContinuation(text: string) {
  const value = String(text || "")
  return value.includes(INCOMPLETE_NOTE_START) && hasIncompleteNote(value)
    || value.includes(CONNECTION_NOTE_START) && hasIncompleteNote(value)
}

/** History sent back to the model: the status line is for the person, not part of the answer. */
export function stripIncompleteNote(text: string) {
  return String(text || "").replace(TRAILING_NOTE, "").replace(/\s+$/u, "")
}

export const CONTINUE_PROMPT: Record<"ru" | "kk" | "en", { label: string; text: string }> = {
  ru: { label: "Продолжить", text: "Продолжи свой предыдущий ответ ровно с того места, где он оборвался. Не повторяй уже написанное и доведи до конца все недостающие части." },
  kk: { label: "Жалғастыру", text: "Алдыңғы жауабыңды үзілген жерінен бастап жалғастыр. Жазылғанды қайталама, жетіспейтін бөліктердің бәрін аяқта." },
  en: { label: "Continue", text: "Continue your previous answer exactly where it stopped. Do not repeat what is already written; finish every missing part." },
}

const squash = (value: string) => String(value || "").replace(/\s+/gu, " ").trim()

/** Comparison that ignores whitespace layout: did the server change the words, not just the spacing? */
export function sameAnswerText(a: string, b: string) {
  return squash(a) === squash(b)
}

/**
 * Is `saved` the server's final wording of what already streamed? The server
 * only ever adds around an answer (a «⚠️» check before it, a status line or a
 * closed code block after it), so everything that streamed - except at most
 * its last line or so - is still in there. A different answer is not, and is
 * never allowed to replace what the person already received.
 */
export function answerRevises(streamed: string, saved: string) {
  const before = squash(streamed)
  const after = squash(saved)
  if (!before) return true
  if (after.includes(before)) return true
  const head = before.slice(0, Math.max(0, before.length - 160))
  return head.length >= 200 && after.includes(head)
}
