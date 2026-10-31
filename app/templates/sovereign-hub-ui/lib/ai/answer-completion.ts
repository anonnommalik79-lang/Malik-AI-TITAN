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
  /** Proven incomplete generated file, e.g. HTML missing its closing tag. */
  codeIncomplete?: boolean
}

export function providerCutOff(finishReason?: string) {
  return /^(?:length|max_tokens|MAX_TOKENS)$/u.test(String(finishReason || ""))
}

export function hasOpenFence(content: string) {
  return Boolean(openCodeFence(content))
}

export function openCodeFence(content: string): { marker: string; language: string } | null {
  let open: { marker: string; language: string } | null = null
  // The existing chat transport uses CR on fence headers; the Markdown
  // renderer normalizes it too. History/completion must see the same lines.
  for (const line of String(content || "").split(/\r\n|\r|\n/)) {
    const match = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(line)
    if (!match) continue
    if (open) {
      if (match[1][0] === open.marker[0] && match[1].length >= open.marker.length && !match[2].trim()) open = null
    } else if (!(match[1][0] === "`" && match[2].includes("`"))) {
      open = { marker: match[1], language: match[2].trim().split(/\s/)[0].toLowerCase() }
    }
  }
  return open
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
  if (!cut && !openFence && !missing.length && !signals.markerMissing && !signals.codeIncomplete) return null
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
  const fence = openCodeFence(text)
  const closed = fence ? `${text.replace(/\s*$/u, "")}\n${fence.marker}` : text.replace(/\s*$/u, "")
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
  const value = String(text || "")
  const note = TRAILING_NOTE.exec(value)?.[0]
  const raw = value.replace(TRAILING_NOTE, "").replace(/\s+$/u, "")
  // withIncompleteNote closes an open block for DISPLAY, not because the
  // model finished it. Send the real open context back on a manual resume.
  if (note?.includes("блок кода не закрыт")) {
    const closing = /(?:\r\n|\r|\n) {0,3}(`{3,}|~{3,})[ \t]*$/u.exec(raw)
    if (closing) {
      const before = raw.slice(0, closing.index)
      const fence = openCodeFence(before)
      if (fence && closing[1][0] === fence.marker[0] && closing[1].length >= fence.marker.length) return before
    }
  }
  return raw
}

export const CONTINUE_PROMPT: Record<"ru" | "kk" | "en", { label: string; text: string }> = {
  ru: { label: "Продолжить", text: "Продолжи свой предыдущий ответ ровно с того места, где он оборвался. Не повторяй уже написанное и доведи до конца все недостающие части." },
  kk: { label: "Жалғастыру", text: "Алдыңғы жауабыңды үзілген жерінен бастап жалғастыр. Жазылғанды қайталама, жетіспейтін бөліктердің бәрін аяқта." },
  en: { label: "Continue", text: "Continue your previous answer exactly where it stopped. Do not repeat what is already written; finish every missing part." },
}

/** «Продолжить» pressed, or the same said in a few words. */
export function isContinueRequest(prompt: string) {
  const text = String(prompt || "").trim()
  if (!text || text.length > 400) return false
  if (Object.values(CONTINUE_PROMPT).some((item) => item.text === text)) return true
  if (/^(?:please\s+(?:continue|go\s+on)|жалғастыра\s+бер(?:іңіз)?|жалғастыр(?:ыңыз)?\s*,?\s*өтінемін)[\s.!…]*$/iu.test(text)) return true
  return /^(?:продолжи(?:те)?|продолжай(?:те)?|продолжить|дальше|допиши(?:те)?|доделай|continue|go\s+on|keep\s+going|жалғастыр(?:ыңыз)?)(?:[\s,]+(?:пожалуйста|please|код|ответ|с\s+того\s+места|где\s+остановил\p{L}*))*[\s.!…]*$/iu.test(text)
}

type ChatMessage = { role?: unknown; content?: unknown }

/**
 * The answer «Продолжить» refers to: the last assistant message, if it is
 * marked unfinished, with the request it was answering (an earlier
 * «Продолжить» is skipped to reach the real one).
 */
export function resumableAnswer(messages: unknown): { answer: string; request: string } | null {
  const list = (Array.isArray(messages) ? messages : []) as ChatMessage[]
  let index = list.length - 1
  // The current «Продолжить» may already be the last message.
  if (index >= 0 && list[index]?.role === "user") index -= 1
  const last = list[index]
  if (last?.role !== "assistant" || typeof last.content !== "string" || !answerNeedsContinuation(last.content.replace(/\r(?!\n)/gu, "\n"))) return null
  for (let at = index - 1; at >= 0; at -= 1) {
    const message = list[at]
    if (message?.role !== "user" || typeof message.content !== "string") continue
    if (isContinueRequest(message.content)) continue
    return { answer: last.content, request: message.content }
  }
  return null
}

/**
 * The unfinished answer as it stood before its status line: the note goes,
 * and so does the closing fence that was added only to keep the note out of
 * the code — the continuation goes on inside that same block.
 */
export function resumeText(answer: string) {
  const text = String(answer || "").replace(/\r(?!\n)/gu, "\n")
  // stripIncompleteNote already removes the display-only closing fence once.
  return stripIncompleteNote(text)
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
