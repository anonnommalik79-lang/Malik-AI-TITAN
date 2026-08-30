/**
 * The part of Voice that makes it a conversation instead of a series of
 * unrelated first sentences.
 *
 * The turn route used to build exactly two messages - a system prompt and the
 * one thing that had just been said - so every reply started from nothing.
 * "А почему?" had no antecedent, "переделай короче" had nothing to shorten, and
 * the assistant greeted the user again on the fourth turn because as far as it
 * knew the fourth turn was the first. That reads as stupidity, but none of it
 * was the model's fault: it was never shown the conversation.
 *
 * This module holds the three pieces that fixes it: the history window, the
 * rules that stop a small model looping, and the check that catches a reply
 * which repeats one already given.
 */

export type VoiceMessage = { role: "user" | "assistant"; content: string }

/** Turns kept in context. Speech is short, so this is a few minutes of talk. */
export const VOICE_HISTORY_TURNS = 20

/**
 * Normalises the history the client sends: anything malformed is dropped rather
 * than trusted, and the window is taken from the end.
 */
export function sanitizeHistory(raw: unknown, limit = VOICE_HISTORY_TURNS): VoiceMessage[] {
  if (!Array.isArray(raw)) return []

  const messages: VoiceMessage[] = []
  for (const item of raw) {
    const role = (item as VoiceMessage)?.role
    const content = String((item as VoiceMessage)?.content || "").trim()
    if (role !== "user" && role !== "assistant") continue
    if (!content) continue
    messages.push({ role, content: content.slice(0, 4000) })
  }

  // A trailing user message would duplicate the utterance being answered.
  while (messages.length && messages[messages.length - 1].role === "user") messages.pop()

  return messages.slice(-limit)
}

/**
 * Behaviour rules a 20B model needs spelled out. Each line here corresponds to
 * something these models do by default in a spoken loop: re-greet, restate the
 * question, summarise their own last answer, and offer help again at the end of
 * every single reply.
 */
export function conversationRules(hasHistory: boolean) {
  const rules = [
    "This is one continuous spoken conversation. Everything above is what the two of you already said, and the user can refer back to any of it.",
    "Never repeat a sentence, a fact or an example you have already given. If the point still stands, say so in a few words and move on.",
    "Do not restate or paraphrase the question before answering. Answer it.",
    "Do not end with an offer of further help unless you actually need something from the user.",
    "A follow-up like \"а почему?\", \"короче\", \"а второй?\" refers to your previous answer. Continue from it rather than starting over.",
    "Keep a normal spoken register: contractions, short sentences, no headings, no lists unless the user asked for a list.",
  ]
  if (hasHistory) {
    rules.unshift("You have already greeted this user. Do not greet again, do not introduce yourself again.")
  }
  return rules.join(" ")
}

function normalizeForCompare(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokens(text: string) {
  return new Set(normalizeForCompare(text).split(" ").filter((token) => token.length > 2))
}

/** Share of words two answers have in common, 0 to 1. */
export function similarity(a: string, b: string) {
  const left = tokens(a)
  const right = tokens(b)
  if (!left.size || !right.size) return 0

  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1

  return shared / Math.min(left.size, right.size)
}

/**
 * Whether a candidate reply is one the assistant has already given.
 *
 * Compared against the assistant's own recent turns only. The threshold is high
 * enough that answering the same question twice on purpose still gets through,
 * and low enough to catch a model that has started looping.
 */
export function repeatsEarlierAnswer(candidate: string, history: VoiceMessage[], threshold = 0.82) {
  const text = normalizeForCompare(candidate)
  if (text.split(" ").length < 4) return false

  const earlier = history.filter((message) => message.role === "assistant").slice(-6)
  return earlier.some((message) => {
    const previous = normalizeForCompare(message.content)
    if (!previous) return false
    if (previous === text) return true
    return similarity(candidate, message.content) >= threshold
  })
}

/** Appended to a retry so the second attempt knows what not to say again. */
export function antiRepeatNote(history: VoiceMessage[]) {
  const said = history
    .filter((message) => message.role === "assistant")
    .slice(-3)
    .map((message) => `- ${message.content.slice(0, 300)}`)

  if (!said.length) return "Your previous answer repeated itself. Say something new."

  return [
    "YOUR PREVIOUS ANSWER REPEATED WHAT YOU HAD ALREADY SAID. You have already said all of this:",
    ...said,
    "Answer again without restating any of it. Give the next thing the user needs, or ask one short question that moves the conversation forward.",
  ].join("\n")
}

/**
 * Short, cheap turns should not wait on a large model, and a real question
 * should not be handed to the smallest one. Voice is judged on both, so the
 * question picks the tier rather than a setting nobody will find.
 */
const NEEDS_THOUGHT = new RegExp(
  [
    "почему", "зачем", "объясн", "сравн", "посчита", "вычисл", "разбер",
    "проанализ", "напиши", "составь", "придумай", "разниц", "ошибк",
    "стоит\\s+ли", "что\\s+лучше", "как\\s+(?:работает|сделать|устроен|устроена)",
    "неге", "түсіндір", "салыстыр", "есепте",
    "why", "explain", "compare", "calculate", "analy[sz]e", "write",
    "difference", "should\\s+i", "which\\s+is\\s+better",
    "how\\s+(?:does|do|to|is)",
  ].join("|"),
  "iu",
)

export type VoiceTier = "fast" | "deep"

/** Words below which an utterance is small talk rather than a question. */
const SHORT_TURN_WORDS = 12

export function tierFor(text: string, usedWeb: boolean): VoiceTier {
  if (usedWeb) return "deep"

  const value = String(text || "").trim()
  if (NEEDS_THOUGHT.test(value)) return "deep"

  return value.split(/\s+/).filter(Boolean).length > SHORT_TURN_WORDS ? "deep" : "fast"
}
