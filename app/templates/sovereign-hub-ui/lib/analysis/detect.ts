import { parseCsv } from "@/lib/os/data/table"
import { parseNumber, type AnalysisLocale } from "./engine"

/**
 * Malik Analyst — finding the data in a chat message.
 *
 * People paste data in every shape: a Markdown table, rows copied from Excel
 * (tabs), CSV with commas or semicolons, «Январь — 120» lines, or «янв 120,
 * фев 95, мар 140» in one sentence. Each shape becomes the same header + rows.
 * A request that only wants the table translated, reformatted or turned into
 * code is not an analysis and is left to the model.
 */

export type FoundTable = { header: string[]; rows: string[][]; truncated: boolean; source: "message" | "file"; name?: string; rest: string }

export function analysisLocale(text: string): AnalysisLocale {
  if (/[әіңғүұқөһ]/iu.test(text) || /(?:^|[\s,.!?])(?:талда|есепте|салыстыр|болжа|сатылым|табыс|шығын|кесте|көрсет)/iu.test(text)) return "kk"
  if (/[а-яё]/iu.test(text)) return "ru"
  return "en"
}

const ANALYSIS_INTENT = /проанализ|анализ|посчитай|подсчитай|рассчита|сравни|динамик|тренд|прогноз|итог|выв[оe]д|отч[её]т|статистик|сводк|график|диаграмм|визуализ|рост|паден|дол[яию]|средн|сумм|лучш|худш|insight|analy[sz]|compare|trend|forecast|summar|statistic|growth|chart|plot|graph|visuali[sz]|best|worst|талда|есепте|салыстыр|болжа|кесте|өсім/iu
const NOT_ANALYSIS = /переведи|перевод|translate|аудар|(?:напиши|создай|сделай|write|create)\s+(?:мне\s+)?(?:код|скрипт|функци|программ|sql|запрос|code|script|function|program)|\bpython\b|javascript|\bsql\b|excel[- ]?формул|формул\p{L}*\s+(?:в|для)\s+excel|в\s+формат|convert|конверт|\bjson\b|\bxml\b|оформи|отформатир|исправь\s+(?:опечат|ошибк|грамматик)|сортир|sort\s+(?:this|the|by)/iu

const MARKDOWN_ROW = /^\s*\|.*\|\s*$/
const MARKDOWN_RULE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/

function markdownTable(lines: string[]) {
  let best: { start: number; end: number; rows: string[][] } | null = null
  for (let start = 0; start < lines.length; start += 1) {
    if (!MARKDOWN_ROW.test(lines[start])) continue
    let end = start
    while (end + 1 < lines.length && (MARKDOWN_ROW.test(lines[end + 1]) || MARKDOWN_RULE.test(lines[end + 1]))) end += 1
    const rows = lines.slice(start, end + 1).filter((line) => !MARKDOWN_RULE.test(line))
      .map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim().replace(/^\*\*(.*)\*\*$/, "$1")))
    if (rows.length >= 3 && (!best || rows.length > best.rows.length)) best = { start, end, rows }
    start = end
  }
  return best
}

const DELIMITERS = ["\t", ";", "|", ","] as const

function count(line: string, delimiter: string) {
  let total = 0
  let quoted = false
  for (const char of line) {
    if (char === '"') quoted = !quoted
    else if (!quoted && char === delimiter) total += 1
  }
  return total
}

/** Consecutive lines with the same number of the same delimiter, and numbers in them. */
function delimitedTable(lines: string[], locale: AnalysisLocale) {
  let best: { start: number; end: number; rows: string[][] } | null = null
  for (const delimiter of DELIMITERS) {
    for (let start = 0; start < lines.length; start += 1) {
      const width = count(lines[start], delimiter)
      if (width < 1 || MARKDOWN_ROW.test(lines[start])) continue
      let end = start
      while (end + 1 < lines.length && lines[end + 1].trim() && count(lines[end + 1], delimiter) === width) end += 1
      if (end - start + 1 >= 3) {
        const rows = parseCsv(lines.slice(start, end + 1).join("\n")).map((row) => row.map((cell) => cell.trim()))
        const numericColumns = Array.from({ length: width + 1 }, (_, column) => rows.slice(1).filter((row) => parseNumber(row[column] || "", locale) !== null).length)
        const hasNumbers = numericColumns.some((hits) => hits >= Math.max(2, Math.ceil((rows.length - 1) * 0.7)))
        // A comma list of words is a sentence, not a table.
        const sentence = delimiter === "," && rows.every((row) => row.some((cell) => cell.split(/\s+/).length > 4))
        if (hasNumbers && !sentence && (!best || rows.length * (width + 1) > best.rows.length * (best.rows[0]?.length || 0))) best = { start, end, rows }
      }
      start = end
    }
    if (best) break
  }
  return best
}

const VALUE = String.raw`([-+−]?\(?[₸$€₽]?\s?\d[\d\s\u00a0.,]*\)?\s?%?\s?(?:тыс\.?|млн\.?|млрд\.?|k|mln|bn)?\s?(?:₸|\$|€|₽|тг\.?|тенге|руб\.?|usd|kzt)?)`
const LABEL_VALUE_LINE = new RegExp(String.raw`^\s*(?:[-•*·]|\d+[.)])?\s*([\p{L}][^\n:=—–]{0,58}?)\s*(?:[:=—–]|\s-\s|\s)\s*${VALUE}\s*\.?$`, "u")

/** «Январь — 120» / «Алматы: 4,5 млн» / «- Kaspi 320» lines, three or more in a row. */
function labelValueLines(lines: string[], locale: AnalysisLocale) {
  let best: { start: number; end: number; rows: string[][] } | null = null
  for (let start = 0; start < lines.length; start += 1) {
    const rows: string[][] = []
    let end = start - 1
    for (let at = start; at < lines.length; at += 1) {
      const match = LABEL_VALUE_LINE.exec(lines[at])
      if (!match || parseNumber(match[2], locale) === null) break
      rows.push([match[1].trim(), match[2].trim()])
      end = at
    }
    if (rows.length >= 3 && (!best || rows.length > best.rows.length)) best = { start, end, rows }
    if (end >= start) start = end
  }
  return best
}

/** «янв 120, фев 95, мар 140, апр 160» inside one sentence. */
function inlineList(text: string, locale: AnalysisLocale) {
  const parts = text.split(/[;\n]|,\s+(?=\p{L})/u).map((part) => part.trim()).filter(Boolean)
  let best: string[][] = []
  let run: string[][] = []
  const pattern = new RegExp(String.raw`^(?:.*?\s)?([\p{L}][\p{L}.'’ -]{0,24}?)\s*(?:[:=—–-]\s*)?${VALUE}$`, "u")
  for (const part of parts) {
    const match = pattern.exec(part)
    if (match && parseNumber(match[2], locale) !== null) {
      run.push([match[1].trim(), match[2].trim()])
      if (run.length > best.length) best = [...run]
    } else run = []
  }
  return best.length >= 3 ? best : null
}

function withHeader(rows: string[][], locale: AnalysisLocale) {
  // A first row of words over rows with numbers is a header.
  const first = rows[0]
  const firstNumbers = first.filter((cell) => parseNumber(cell, locale) !== null).length
  const below = rows.slice(1, 6).reduce((total, row) => total + row.filter((cell) => parseNumber(cell, locale) !== null).length, 0) / Math.max(1, Math.min(5, rows.length - 1))
  if (firstNumbers === 0 && below > 0) return { header: first, rows: rows.slice(1) }
  return { header: first.map(() => ""), rows }
}

const GENERIC: Record<AnalysisLocale, [string, string]> = { ru: ["Показатель", "Значение"], kk: ["Көрсеткіш", "Мән"], en: ["Item", "Value"] }

const METRIC_NAMES: Array<[RegExp, string]> = [
  [/продаж/iu, "Продажи"], [/выручк/iu, "Выручка"], [/доход/iu, "Доход"], [/прибыл/iu, "Прибыль"], [/расход/iu, "Расходы"], [/затрат/iu, "Затраты"],
  [/клиент/iu, "Клиенты"], [/посетител|гост(?:ей|и)/iu, "Посетители"], [/заказ/iu, "Заказы"], [/подписчик/iu, "Подписчики"], [/просмотр/iu, "Просмотры"],
  [/пользовател/iu, "Пользователи"], [/лид(?:ы|ов)(?!\p{L})/iu, "Лиды"], [/конверси/iu, "Конверсия, %"], [/зарплат/iu, "Зарплата"], [/бюджет/iu, "Бюджет"],
  [/трафик/iu, "Трафик"], [/регистрац/iu, "Регистрации"], [/цен[аыу]/iu, "Цена"], [/добыч/iu, "Добыча"],
  [/сатылым/iu, "Сатылым"], [/табыс/iu, "Табыс"], [/пайда/iu, "Пайда"], [/шығын/iu, "Шығын"], [/тапсырыс/iu, "Тапсырыстар"],
  [/\bsales\b/iu, "Sales"], [/revenue/iu, "Revenue"], [/income/iu, "Income"], [/profit/iu, "Profit"], [/expenses|costs?\b/iu, "Costs"],
  [/customers?/iu, "Customers"], [/visitors?|visits/iu, "Visitors"], [/orders?\b/iu, "Orders"], [/subscribers?/iu, "Subscribers"],
  [/views?\b/iu, "Views"], [/users?\b/iu, "Users"], [/leads?\b/iu, "Leads"], [/conversion/iu, "Conversion, %"], [/signups?|sign-ups?/iu, "Sign-ups"],
]

/** «Проанализируй продажи по месяцам» → the value column is «Продажи», not «Значение». */
export function guessMeasureName(text: string, locale: AnalysisLocale) {
  let best: { at: number; name: string } | null = null
  for (const [pattern, name] of METRIC_NAMES) {
    const match = pattern.exec(text)
    if (match && (!best || match.index < best.at)) best = { at: match.index, name }
  }
  return best?.name || GENERIC[locale][1]
}

/** The biggest table in the message, with the message text around it. */
export function findMessageTable(prompt: string): FoundTable | null {
  const text = String(prompt || "").replace(/\r\n?/g, "\n")
  if (text.length > 400_000) return null
  const locale = analysisLocale(text)
  const lines = text.split("\n")
  const markdown = markdownTable(lines)
  const delimited = markdown ? null : delimitedTable(lines, locale)
  const labelled = markdown || delimited ? null : labelValueLines(lines, locale)
  const found = markdown || delimited || labelled
  if (found) {
    const rest = [...lines.slice(0, found.start), ...lines.slice(found.end + 1)].join("\n").trim()
    if (labelled) return { header: ["", guessMeasureName(rest, locale)], rows: found.rows, truncated: false, source: "message", rest }
    const shaped = withHeader(found.rows, locale)
    const header = shaped.header.map((cell, index) => cell || (index === 0 ? "" : shaped.header.length === 2 ? guessMeasureName(rest, locale) : `${GENERIC[locale][1]} ${index}`))
    return { header, rows: shaped.rows, truncated: false, source: "message", rest }
  }
  const inline = inlineList(text, locale)
  if (inline) return { header: ["", guessMeasureName(text, locale)], rows: inline, truncated: false, source: "message", rest: text }
  return null
}

/** Whether the words around the data ask for an analysis of it. */
export function wantsAnalysis(rest: string, source: "message" | "file") {
  const text = String(rest || "").trim()
  if (NOT_ANALYSIS.test(text)) return false
  if (ANALYSIS_INTENT.test(text)) return true
  if (source === "message" && !text) return true
  // A question about pasted numbers («какой месяц был лучшим?») is an analysis.
  return /\?\s*$/.test(text) || /^(?:что|какой|какая|какие|где|когда|почему|сколько|what|which|where|when|why|how much|қай|неше)/iu.test(text)
}
