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

const ACKNOWLEDGEMENT = /^(?:спасибо|спс|рахмет|благодарю|thanks|thank\s+you|thx|ок|окей|ok|okay|да|нет|ага|угу|yes|no|понятно|ясно|хорошо|отлично|супер|класс|круто|жақсы|иә|жоқ)[\s!.)]*$/iu
const FOLLOW_START = /^(?:а|и|но|ну|так|тогда|ещё|еще|and|but|so|what\s+about|how\s+about|ал)(?![\p{L}])/iu
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
const QUESTION_WORD = /(?<![\p{L}])(?:почему|зачем|как|когда|где|откуда|сколько|кто|что|чем|какой|какая|какое|какие|why|how|when|where|who|what|which|неге|қалай|қашан|кім|не)(?![\p{L}])/iu

function words(text: string) {
  return text.split(/\s+/u).filter(Boolean)
}

/** True when the message only makes sense together with the previous turn. */
export function isContextDependent(prompt: string): boolean {
  const text = String(prompt || "").trim()
  if (!text || text.length > 140 || ACKNOWLEDGEMENT.test(text)) return false
  const count = words(text).length
  if (count > 10) return false
  if (BARE.test(text)) return true
  if (FOLLOW_START.test(text)) return true
  if (ORDINAL_ONLY.test(text)) return true
  return count <= 5 && REFERENCE.test(text) && !ownSubject(text)
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
    if (asked.length >= 4) break
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

export function conversationFocus(prompt: string, history: unknown): ConversationFocus {
  const text = String(prompt || "").trim()
  const plain: ConversationFocus = { followUp: false, anchor: "", searchText: text, shapeText: text }
  if (!isContextDependent(text)) return plain
  const earlier = previousUserQuestions(text, history)
  // In a chain («про второго президента» → «а третий?» → «а четвёртый?») the
  // subject comes from the last question that made sense on its own.
  const anchor = earlier.find((question) => !isContextDependent(question)) || earlier[0] || ""
  if (!anchor) return plain
  const rest = strip(text)
  // «а третий?» / «а Tesla?» swaps one part of the earlier question, so the
  // answer keeps its shape. «почему?» / «подробнее» asks something new about it.
  const substitution = FOLLOW_START.test(text) && !QUESTION_WORD.test(rest) && !BARE.test(text)
  return {
    followUp: true,
    anchor,
    // «почему?», «подробнее» ask about the answer already given: no new search.
    searchText: BARE.test(text) || TRANSFORM.test(text) ? text : rest ? `${anchor} ${rest}` : anchor,
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
    "- Resolve what it refers to (a person, an item, an ordinal such as «третий», «они», «он») from the conversation, then answer only the latest message about that subject.",
    "- Do not repeat or re-answer the earlier question. If the reference is genuinely ambiguous, take the most likely reading and name it in a few words.",
  ].join("\n")
}
