/** Bounded history transport shared by the existing chat paths, not memory. */
export type ConversationTurn = { role: "user" | "assistant"; content: string; index: number }

export function conversationTurns(value: unknown, limit = 64): ConversationTurn[] {
  if (!Array.isArray(value)) return []
  const turns: ConversationTurn[] = []
  for (let index = Math.max(0, value.length - limit); index < value.length; index++) {
    const turn = value[index]
    if ((turn?.role === "user" || turn?.role === "assistant") && typeof turn.content === "string" && turn.content.trim()) {
      turns.push({ role: turn.role, content: turn.content, index })
    }
  }
  return turns
}

export function conversationHistorySource(body: unknown): unknown[] {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const history = conversationTurns(record.history)
  return history.length ? record.history as unknown[] : Array.isArray(record.messages) ? record.messages : []
}

export function conversationHistory(body: unknown): ConversationTurn[] { return conversationTurns(conversationHistorySource(body)) }

/** Drop only a copy of THIS request, never an unrelated trailing user turn. */
export function withoutCurrentTurn<T extends { role: string; content: string }>(history: T[], prompt: string, taskPrompt?: string): T[] {
  const last = history.at(-1)
  const text = last?.content.trim()
  const publicText = text?.split(/\n\n\[MALIK_(?:USER_CONTROLLED_MEMORY|PROJECT_CONTEXT|SESSION_MEMORY|MEDIA_ACTION_HISTORY)\]/u)[0].trim()
  return last?.role === "user" && (text === prompt.trim() || publicText === prompt.trim() || Boolean(taskPrompt && (text === taskPrompt.trim() || publicText === taskPrompt.trim()))) ? history.slice(0, -1) : history.slice()
}

/**
 * Per-request provider history budget. The chat transcript is NOT deleted;
 * only the copy sent to a provider is shortened for fast conversational turns.
 * The user's pinned/project/session memory is carried separately.
 *
 * Deep analysis, coding and long documents retain the configured extended
 * transport budget so follow-up edits can still reference earlier material.
 */
export function conversationTransportBudget(input: {
  fastMode?: boolean
  promptLength: number
  configuredMessages: number
  configuredChars: number
}): { maxMessages: number; maxChars: number } {
  const messages = Math.max(1, Math.floor(input.configuredMessages))
  const chars = Math.max(1, Math.floor(input.configuredChars))
  const adaptiveChars = input.promptLength >= 240_000
    ? 24_000
    : input.promptLength >= 120_000
      ? 48_000
      : input.promptLength >= 60_000
        ? 90_000
        : chars
  // Sending 180k old characters on a one-line follow-up can cost tens of
  // thousands of input tokens even if the new answer is only a sentence.
  return {
    maxMessages: input.fastMode ? Math.min(messages, 14) : messages,
    maxChars: Math.min(chars, adaptiveChars, input.fastMode ? 12_000 : chars),
  }
}

export function boundedConversationHistory<T extends { role: string; content: string }>(history: T[], maxMessages: number, maxChars: number): T[] {
  const kept: T[] = []
  let remaining = maxChars
  // A huge last assistant answer must not crowd out the user's preceding task.
  const perMessage = Math.max(1, Math.floor(maxChars * .7))
  for (let index = history.length - 1; index >= 0 && kept.length < maxMessages && remaining > 0; index--) {
    const turn = history[index]
    const limit = Math.min(remaining, perMessage)
    let content = turn.content
    if (content.length > limit) {
      const marker = "\n[Earlier text omitted by context limit]\n"
      const available = Math.max(0, limit - marker.length)
      const head = Math.floor(available * .35)
      content = limit > marker.length ? content.slice(0, head) + marker + content.slice(content.length - (available - head)) : content.slice(0, limit)
    }
    kept.unshift({ ...turn, content })
    remaining -= content.length
  }
  return kept
}


// Retrieve only from the caller's current conversation, not other accounts or
// other chats. This is a bounded lexical recall layer, not semantic embeddings.
const RECALL_STOP = new Set("про это что как где когда кто какой какая какие сколько мне мой моя мои наш наши был была были есть еще ещё уже тогда потом снова давай сделай скажи расскажи напиши помнишь раньше прошлый прошлое the and for from about what when where which who how can could would please remember earlier that this these those your with again tell write make".split(" "))
function recallTerms(text: string): Set<string> {
  return new Set((text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) || [])
    .filter(term => !RECALL_STOP.has(term) && !/^\d+$/u.test(term))
    .map(term => term.length > 7 ? term.slice(0, 7) : term))
}

/** Preserve recent dialogue and spend a small part of its existing budget on
 * earlier relevant turns. Never insert invented messages, disclose other
 * conversations, or send extra tokens beyond the original transport budget. */
export function contextAwareConversationHistory<T extends { role: string; content: string }>(
  history: T[], question: string, maxMessages: number, maxChars: number,
): T[] {
  const recent = boundedConversationHistory(history, maxMessages, maxChars)
  if (recent.length >= history.length || maxMessages < 6 || maxChars < 3000 || question.length > 1200) return recent
  const terms = recallTerms(question)
  if (!terms.size) return recent
  const oldEnd = history.length - recent.length
  const candidates = history.slice(Math.max(0, oldEnd - 128), oldEnd)
  const ranked = candidates.flatMap((turn, index) => {
    const text = turn.content.slice(0, 16_000)
    // Require two matching terms, or a distinctive exact single identifier.
    const words = recallTerms(text)
    const score = [...terms].filter(term => words.has(term)).length
    const single = terms.size === 1 && [...terms][0].length >= 6
    return score >= 2 || (single && score === 1) ? [{ turn, index, score }] : []
  }).sort((a,b) => b.score - a.score || b.index - a.index).slice(0, 2)
  if (!ranked.length) return recent
  const recallBudget = Math.min(1800, Math.floor(maxChars * .15))
  const recalled = ranked.sort((a,b) => a.index - b.index).map(({ turn }) => {
    const limit = Math.floor(recallBudget / ranked.length)
    return { ...turn, content: turn.content.length <= limit ? turn.content : turn.content.slice(0, limit - 1) + "…" }
  })
  const remaining = maxChars - recalled.reduce((sum, turn) => sum + turn.content.length, 0)
  // Do not reclaim a turn twice when shortening the recent window.
  const tail = boundedConversationHistory(history.slice(oldEnd), maxMessages - recalled.length, remaining)
  return [...recalled, ...tail]
}
