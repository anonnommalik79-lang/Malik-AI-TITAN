export type SentenceFormat = { count: number; maximum: boolean }
const COUNT = /(?<![\p{L}\d])(\d{1,2}|одн(?:ом|о|у)|дв[ауе]|двух|тр[её]х|три|четыр[её]х|четыре|пяти|пять|one|two|three|four|five|бір|екі|үш|төрт|бес)\s+(?:предложени\p{L}*|sentences?|сөйлем\p{L}*)(?!\p{L})/iu
const numbers: Record<string, number> = {
  одном: 1, одно: 1, одну: 1, one: 1, бір: 1,
  два: 2, две: 2, двух: 2, two: 2, екі: 2,
  трех: 3, трёх: 3, три: 3, three: 3, үш: 3,
  четырех: 4, четырёх: 4, четыре: 4, four: 4, төрт: 4,
  пяти: 5, пять: 5, five: 5, бес: 5,
}

/** A length instruction is a prose layout unless a second output is explicitly requested. */
export function sentenceFormat(prompt: string): SentenceFormat | undefined {
  const match = COUNT.exec(prompt)
  if (!match || prompt.length > 5000) return
  const before = prompt.slice(Math.max(0, match.index - 78), match.index)
  const after = prompt.slice(match.index + match[0].length)
  if (/(?:например|содержит|there are|contains)\s*$/iu.test(before)
    || /(?:создай|нарисуй|добавь|построй|покажи|include|add|draw|make)\s+(?:\p{L}+\s+){0,2}(?:схем|диаграм|картин|таблиц|график|файл|diagram|chart|image|table|file)|(?:и|and)\s+(?:схем|диаграм|фото|график|a (?:diagram|chart|photo))/iu.test(prompt)) return
  const directive = /(?:\b(?:explain|answer|describe|write|summari[sz]e|use)\b|объясни|расскажи|ответь|опиши|сформулируй|напиши|түсіндір|жауап бер|жаз|\b(?:up to|exactly|at most)\b|не\s+более|не\s+длиннее)/iu.test(before)
  const boundary = /^[\s.!?,…]*$/u.test(before) || /(?:\b(?:in|within)|(?<!\p{L})в|ровно|до)\s*$/iu.test(before)
  if ((!directive && !boundary) || /^\s+(?:из текста|на выбор|from the text)/iu.test(after)) return
  const count = Number(match[1]) || numbers[match[1].toLowerCase()]
  if (!count || count > 12) return
  const maximum = /(?:не\s+более|не\s+длиннее|максимум|до|at most|no more than|up to)\s*$/iu.test(before)
  return { count, maximum }
}

export function sentenceFormatInstruction(format?: SentenceFormat) {
  if (!format) return ""
  return `Write ${format.maximum ? "at most" : "exactly"} ${format.count} complete sentences in one prose paragraph. Use no headings, bullets, diagrams, visual blocks, greetings, or follow-up offers.`
}

export function validateSentenceProse(content: string, format: SentenceFormat) {
  const prose = content.replace(/(?:^|\n)[ \t]*```(?:malik-[\w-]+|mermaid)[^\n]*\n[\s\S]*?(?:\n[ \t]*```[ \t]*(?=\n|$)|$)/giu, "")
    .replace(/^[ \t]*#{1,6}[ \t]+[^\n]*$/gmu, "")
    .replace(/^[ \t]*(?:[-*•]|\d+[.)])[ \t]+/gmu, "").replace(/\s+/gu, " ").trim()
  if (!prose || /```/u.test(prose)) return { content: prose, valid: false }
  const locale = /[а-яё]/iu.test(prose) ? "ru" : "en"
  const sentences = [...new Intl.Segmenter(locale, { granularity: "sentence" }).segment(prose)]
    .map(item => item.segment.trim()).filter(Boolean)
  const complete = /[.!?…](?:[»”"'*)\]]|\s*\[\d{1,3}\])*$/u
  if (!sentences.length || !sentences.every(value => complete.test(value))) return { content: prose, valid: false }
  const valid = format.maximum ? sentences.length <= format.count : sentences.length === format.count
  return { content: prose, valid }
}
