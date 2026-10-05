/**
 * The shape of a chat message, read before any auto-router may take over a
 * turn (Superflow, Work files, the presentation studio, agent plans).
 *
 * A long brief or a numbered list of tasks is ONE request to answer in the
 * chat, not a command to launch a tool. Each router used to scan the whole
 * text for keywords, so a big prompt that merely mentioned "бизнес-план",
 * "сайт" or "презентация" somewhere in block 4 launched a multi-tool run the
 * person never asked for. For such messages only the opening instruction —
 * what the person asks for first — may decide that a tool should start.
 */

/** A message at least this long is treated as a brief, not a command. */
export const LONG_PROMPT_CHARS = 600

// JavaScript's \b only knows ASCII, so word edges for Cyrillic and Kazakh are
// written as (?<![\p{L}\p{N}]) … (?![\p{L}\p{N}]).
const TASK_WORD = "(?:block|блок|task|задача|задание|часть|part|пункт|step|шаг|вопрос|question|бөлім|тапсырма|сұрақ)"
const LIST_LINE = new RegExp(`^\\s*(?:\\d{1,2}\\s*[.)]|[-*•]|${TASK_WORD}\\s*\\d{1,2}(?![\\p{L}\\p{N}]))`, "iu")
const INLINE_TASK_HEADER = new RegExp(`(?<![\\p{L}\\p{N}])${TASK_WORD}\\s*\\d{1,2}\\s*[:.)—–-]`, "giu")
const INLINE_NUMBERED = /(?:^|[\s;,])\d{1,2}\)\s+\S/gu

/** Lines of a numbered or bulleted list, plus inline "Block 3:" headers. */
export function taskItemCount(text: string): number {
  const value = String(text || "")
  const listLines = value.split(/\r?\n/).filter((line) => LIST_LINE.test(line)).length
  const headers = (value.match(INLINE_TASK_HEADER) || []).length
  const inlineNumbers = (value.match(INLINE_NUMBERED) || []).length
  return Math.max(listLines, headers, inlineNumbers)
}

/** Several separate tasks in one message: «1) … 2) … 3) …», «Block 1 … Block 2 …». */
export function isMultiTaskPrompt(text: string): boolean {
  const value = String(text || "")
  const headers = (value.match(INLINE_TASK_HEADER) || []).length
  return taskItemCount(value) >= 3 || headers >= 2
}

export function isLongPrompt(text: string): boolean {
  return String(text || "").trim().length >= LONG_PROMPT_CHARS
}

/** A brief to be answered as a whole: long, or several tasks at once. */
export function isComplexBrief(text: string): boolean {
  return isLongPrompt(text) || isMultiTaskPrompt(text)
}

/**
 * What the person asks for first: the first non-empty line, cut at the end
 * of its first sentence. "Создай бизнес: кофейня в Астане. Потом…" keeps
 * "Создай бизнес: кофейня в Астане."
 */
export function leadingInstruction(text: string, maxChars = 280): string {
  const firstLine = String(text || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || ""
  const sentenceEnd = firstLine.slice(12).search(/[.!?…](?:\s|$)/u)
  const sentence = sentenceEnd >= 0 ? firstLine.slice(0, 12 + sentenceEnd + 1) : firstLine
  return sentence.slice(0, maxChars).trim()
}

/**
 * The part of a message an auto-router may read: the whole message when it
 * is a short command, only the opening instruction when it is a brief.
 */
export function routingScope(text: string): string {
  const value = String(text || "").trim()
  return isComplexBrief(value) ? leadingInstruction(value) : value
}
