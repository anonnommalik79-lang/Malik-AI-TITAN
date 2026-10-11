/**
 * Answer layouts the chat draws from ordinary Markdown, so a model needs no
 * special syntax and a plain reader still sees clean text:
 *
 * - FAQ: a «Частые вопросы» / «FAQ» section whose questions become an
 *   accordion (each question opens its own answer).
 * - <details><summary>…</summary> … </details>: collapsed technical detail.
 * - Plus / minus lists side by side («Плюсы» + «Минусы»).
 * - A contents list for long answers with several sections.
 * - A decision matrix with a «Вес» column: the weighted totals are computed
 *   here, not trusted from the model, and a wrong model total is flagged.
 *
 * Everything is pure text in, data out: no HTML is ever taken from the model.
 */

const FENCE = /^\s*(?:```|~~~)/u
const HEADING = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/u
const FAQ_TITLE = /(?:(?<![\p{L}\p{N}])FAQ(?![\p{L}\p{N}])|ч[аa]сто\s+задаваемые|частые\s+вопросы|вопросы\s+и\s+ответы|ответы\s+на\s+вопросы|жиі\s+қойылатын|сұрақтар\s+мен\s+жауаптар|(?<![\p{L}\p{N}])Q\s*&\s*A(?![\p{L}\p{N}])|frequently\s+asked)/iu

function stripEmphasis(text: string) {
  return text.replace(/^[*_]{1,3}|[*_]{1,3}$/gu, "").replace(/^[*_]{1,3}|[*_]{1,3}$/gu, "").trim()
}

type FaqQuestion = { question: string; first: string; start: number; end: number; continuationIndent?: boolean }

/** A question line inside an FAQ section, or null. */
function faqQuestion(line: string, sectionLevel: number): { question: string; rest: string; list: boolean } | null {
  const heading = HEADING.exec(line)
  if (heading && heading[1].length > sectionLevel) {
    const text = stripEmphasis(heading[2])
    return /\?\s*$/u.test(text) ? { question: text, rest: "", list: false } : null
  }
  const bold = /^\s*(?:\d{1,2}[.)]\s+)?\*\*(.+?\?)\*\*\s*[:—–-]?\s*(.*)$/u.exec(line)
  if (bold) return { question: bold[1].trim(), rest: bold[2].trim(), list: false }
  const listed = /^\s*[-*•]\s+\*\*(.+?\?)\*\*\s*[:—–-]?\s*(.*)$/u.exec(line)
  if (listed) return { question: listed[1].trim(), rest: listed[2].trim(), list: true }
  const labelled = /^\s*(?:Q|В|Вопрос|Сұрақ)\s*[:.]\s*(.+\?)\s*$/u.exec(line)
  if (labelled) return { question: stripEmphasis(labelled[1]), rest: "", list: false }
  return null
}

/**
 * Turns each FAQ section into collapsible questions. Text outside FAQ
 * sections, code blocks and sections with fewer than two questions are left
 * exactly as they were.
 */
export function faqToDetails(source: string) {
  const lines = String(source || "").split("\n")
  const inFence: boolean[] = []
  let fence = false
  for (const line of lines) {
    if (FENCE.test(line)) { inFence.push(true); fence = !fence; continue }
    inFence.push(fence)
  }
  const output: string[] = []
  let index = 0
  while (index < lines.length) {
    const heading = !inFence[index] ? HEADING.exec(lines[index]) : null
    if (!heading || !FAQ_TITLE.test(heading[2])) { output.push(lines[index]); index += 1; continue }
    const level = heading[1].length
    let end = index + 1
    while (end < lines.length) {
      const next = !inFence[end] ? HEADING.exec(lines[end]) : null
      if (next && next[1].length <= level) break
      end += 1
    }
    const questions: FaqQuestion[] = []
    for (let at = index + 1; at < end; at++) {
      if (inFence[at]) continue
      const found = faqQuestion(lines[at], level)
      if (!found) continue
      if (questions.length) questions[questions.length - 1].end = at
      questions.push({ question: found.question, first: found.rest, start: at, end, continuationIndent: found.list })
    }
    if (questions.length < 2) {
      for (let at = index; at < end; at++) output.push(lines[at])
      index = end
      continue
    }
    output.push(lines[index])
    for (let at = index + 1; at < questions[0].start; at++) output.push(lines[at])
    for (const item of questions) {
      const body = lines.slice(item.start + 1, item.end).map((line) => item.continuationIndent ? line.replace(/^\s{2,4}/u, "") : line)
      const answer = [item.first, ...body].join("\n").trim()
      output.push("", "<details>", `<summary>${item.question.replace(/<[^>]*>/gu, "").replace(/[<>]/gu, "")}</summary>`, "", answer || "—", "", "</details>")
    }
    output.push("")
    index = end
  }
  return output.join("\n")
}

/* -------------------------------------------------------------- outline */

export type OutlineEntry = { position: number; level: number; text: string }

/** A contents list is worth it only for a long answer with several real sections. */
export function answerOutline(headings: OutlineEntry[], totalChars: number, { minSections = 4, minChars = 2_500 } = {}) {
  const usable = headings.filter((item) => item.level <= 3 && item.text.trim().length >= 2)
  if (usable.length < minSections || totalChars < minChars) return null
  const top = Math.min(...usable.map((item) => item.level))
  return usable.slice(0, 24).map((item) => ({ ...item, depth: Math.min(2, item.level - top), text: stripEmphasis(item.text).replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1") }))
}

/* --------------------------------------------------------- pros & cons */

const PROS = /^(?:[+✅👍]\s*)?(?:плюсы|преимущества|достоинства|сильные\s+стороны|за(?![\p{L}\p{N}])|pros(?![\p{L}\p{N}])|advantages|strengths|артықшылықтары|жақсы\s+жақтары)/iu
const CONS = /^(?:[-−✖❌👎]\s*)?(?:минусы|недостатки|риски|слабые\s+стороны|против(?![\p{L}\p{N}])|cons(?![\p{L}\p{N}])|disadvantages|weaknesses|кемшіліктері|жаман\s+жақтары)/iu

/** The label of a «Плюсы» / «Минусы» heading or bold line, or null. */
export function prosConsLabel(text: string): "pros" | "cons" | null {
  const clean = stripEmphasis(String(text || "").trim()).replace(/[:：]\s*$/u, "").trim()
  if (clean.length > 60) return null
  if (PROS.test(clean)) return "pros"
  if (CONS.test(clean)) return "cons"
  return null
}

/* ----------------------------------------------------- decision matrix */

const WEIGHT_HEADER = /^(?:вес|веса|weight|weights|салмақ|важность|приоритет)(?![\p{L}\p{N}])/iu
const TOTAL_ROW = /^(?:итог|итого|сумма|total|score|взвешенн|барлығы|жиыны)/iu

function parseNumber(cell: string) {
  const text = stripEmphasis(String(cell || "")).replace(/\s| /gu, "").replace(",", ".")
  const fraction = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/u.exec(text)
  if (fraction) return Number(fraction[1])
  const match = /^(-?\d+(?:\.\d+)?)(%)?$/u.exec(text)
  return match ? Number(match[1]) : null
}

export type WeightedMatrix = {
  weightColumn: number
  options: Array<{ column: number; name: string; total: number }>
  criteria: Array<{ row: number; name: string; weight: number }>
  /** Weights as the model wrote them added up to this; they are normalised to 1. */
  weightSum: number
  winner: number | null
  /** The model's own totals row, if it had one, and whether it disagrees. */
  modelTotals: { row: number; values: Array<number | null>; mismatch: boolean } | null
}

/**
 * A table with a weight column, criteria in the first column and a numeric
 * score per option: computes Σ weight × score with the weights normalised.
 * Returns null for any table that is not clearly such a matrix.
 */
export function weightedMatrix(headers: string[], rows: string[][]): WeightedMatrix | null {
  const weightColumn = headers.findIndex((header, index) => index > 0 && WEIGHT_HEADER.test(stripEmphasis(header)))
  if (weightColumn < 1 || headers.length < 4) return null
  const optionColumns = headers.map((_, index) => index).filter((index) => index !== 0 && index !== weightColumn)
  const totalRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => TOTAL_ROW.test(stripEmphasis(row[0] || "")))
  const criteria = rows.map((row, index) => ({ row, index })).filter(({ row }) => !TOTAL_ROW.test(stripEmphasis(row[0] || "")))
  if (criteria.length < 2 || optionColumns.length < 2) return null
  const weights = criteria.map(({ row }) => parseNumber(row[weightColumn]))
  if (weights.some((weight) => weight === null || weight < 0)) return null
  const weightSum = (weights as number[]).reduce((sum, weight) => sum + weight, 0)
  if (!(weightSum > 0)) return null
  const scores = criteria.map(({ row }) => optionColumns.map((column) => parseNumber(row[column])))
  if (scores.some((line) => line.some((score) => score === null))) return null
  const options = optionColumns.map((column, optionIndex) => ({
    column,
    name: stripEmphasis(headers[column]),
    total: Math.round(criteria.reduce((sum, _, criterionIndex) => sum + (weights[criterionIndex] as number) / weightSum * (scores[criterionIndex][optionIndex] as number), 0) * 100) / 100,
  }))
  const best = Math.max(...options.map((option) => option.total))
  const leaders = options.filter((option) => option.total === best)
  let modelTotals: WeightedMatrix["modelTotals"] = null
  if (totalRows.length) {
    const { row, index } = totalRows[totalRows.length - 1]
    const values = optionColumns.map((column) => parseNumber(row[column]))
    const scale = Math.max(1, ...scores.flat().map((score) => Math.abs(score as number)))
    // A model total may be on the raw (un-normalised) weights; accept either.
    const mismatch = values.some((value, optionIndex) => {
      if (value === null) return false
      const normalised = options[optionIndex].total
      const raw = normalised * weightSum
      return Math.abs(value - normalised) > 0.02 * scale && Math.abs(value - raw) > 0.02 * scale * Math.max(1, weightSum)
    })
    modelTotals = { row: index, values, mismatch }
  }
  return {
    weightColumn,
    options,
    criteria: criteria.map(({ row, index }, criterionIndex) => ({ row: index, name: stripEmphasis(row[0]), weight: (weights[criterionIndex] as number) / weightSum })),
    weightSum,
    winner: leaders.length === 1 ? leaders[0].column : null,
    modelTotals,
  }
}
