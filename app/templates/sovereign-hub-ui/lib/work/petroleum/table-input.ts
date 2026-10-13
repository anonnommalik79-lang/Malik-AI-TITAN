import { BARREL_M3 } from "./units"
import { normalizeDigits } from "./production"
import { stripPetroleumToken } from "./router"
import {
  OIL_ANALYSES, OIL_ANALYSIS_SCHEMA_VERSION, petroleumAnalysisRequestSchema,
  type GasUnit, type LiquidUnit, type OilLanguage, type PetroleumAnalysisRequest,
} from "./analysis-contract"

/**
 * A production table pasted into the chat - Markdown, CSV, TSV or a
 * semicolon sheet - becomes a validated PetroleumAnalysisRequest.
 *
 * Units are read, never guessed: a rate column needs its unit and a per-day
 * basis in the header (or one stated in the message: «дебиты в м3/сут»).
 * Without them the answer asks for them instead of computing. Periods may be
 * ISO months/dates, DD.MM.YYYY, MM.YYYY, month names in four languages or a
 * plain index. Rows that cannot be read are listed, not repaired.
 */

export type TableIssue = { row: number; code: string; column?: string }
export type TableParse =
  | { kind: "ok"; request: PetroleumAnalysisRequest; tableText: string; language: OilLanguage; alerts?: string[] }
  | { kind: "needs-input"; code: string; columns: string[]; language: OilLanguage; tableText: string }

type Role = "period" | "well" | "oil" | "water" | "gas" | "liquid" | "pressure"
type Unit = { family: "bbl" | "m3" | "t" | "scf" | "sm3"; factor: number; perDay: boolean; otherTime: boolean; basis: "surface" | "reservoir" | "unknown" }

const MAX_ROWS = 5000
const MAX_WELLS = 120

const SKIP = /(?:cut|обводн|сулан|\bwc\b|%|процент|\bgor\b|газов\p{L}*\s*фактор|газ\s*фактор|\bwor\b|ratio|отношен|cumulative|накоп|жинақ|price|цен[аы]|стоимост|cost|revenue|выручк|سعر|نسبة|تراكمي)/iu
const ROLE_PATTERNS: Array<[Role, RegExp]> = [
  ["period", /^(?:month|date|period|time|mon|t|месяц|мес\.?|дата|период|время|ай|күн|кезең|уақыт|الشهر|التاريخ|الفترة|شهر)(?:$|[\s,(])/iu],
  ["well", /(?:well|скважин|скв\.?(?:$|\s)|ұңғыма|بئر|البئر)/iu],
  ["pressure", /(?:\bpwf\b|pressure|давлен|\bp[_ ]?wf\b)/iu],
  ["liquid", /(?:liquid|жидк|сұйық|سائل|gross|\bql\b|\bblpd\b)/iu],
  ["oil", /(?:oil|нефт|мұнай|نفط|\bq[_ ]?o\b|\bbopd\b)/iu],
  ["water", /(?:water|вод[аыу]|\bсу\b|ماء|مياه|\bq[_ ]?w\b|\bbwpd\b)/iu],
  ["gas", /(?:gas|газ|غاز|\bq[_ ]?g\b)/iu],
]

const MONTHS: Array<[RegExp, number]> = [
  [/^(?:jan|january|янв|январ[ья]|қаңтар|يناير|كانون الثاني)$/iu, 0],
  [/^(?:feb|february|фев|феврал[ья]|ақпан|فبراير|شباط)$/iu, 1],
  [/^(?:mar|march|мар|марта?|наурыз|مارس|آذار)$/iu, 2],
  [/^(?:apr|april|апр|апрел[ья]|сәуір|أبريل|ابريل|إبريل|نيسان)$/iu, 3],
  [/^(?:may|ма[йя]|мамыр|مايو|أيار)$/iu, 4],
  [/^(?:jun|june|июн[ья]?|маусым|يونيو|حزيران)$/iu, 5],
  [/^(?:jul|july|июл[ья]?|шілде|يوليو|تموز)$/iu, 6],
  [/^(?:aug|august|авг|августа?|тамыз|أغسطس|اغسطس|آب)$/iu, 7],
  [/^(?:sep|sept|september|сен|сент|сентябр[ья]|қыркүйек|سبتمبر|أيلول)$/iu, 8],
  [/^(?:oct|october|окт|октябр[ья]|қазан|أكتوبر|اكتوبر|تشرين الأول)$/iu, 9],
  [/^(?:nov|november|ноя|ноябр[ья]|қараша|نوفمبر|تشرين الثاني)$/iu, 10],
  [/^(?:dec|december|дек|декабр[ья]|желтоқсан|ديسمبر|كانون الأول)$/iu, 11],
]

export function oilLanguage(text: string): OilLanguage {
  return /[؀-ۿ]/.test(text) ? "ar" : /[әғқңөұүһі]/i.test(text) ? "kk" : /[а-яё]/i.test(text) ? "ru" : "en"
}

const DAY = /(?:\/|\s|_|-|\bper\b|\bв\b|\bна\b|^)\s*(?:day|days|d|сут\p{L}*|сутки|день|дн\p{L}*|күн\p{L}*|тәул\p{L}*|يوم|يومي)(?:$|[^\p{L}])|\b(?:bopd|bwpd|blpd|bpd|scfd|mscfd|mmscfd|mcfd|mmcfd)\b/iu
const OTHER_TIME = /(?:\/|\s|_|-|\bper\b|\bв\b|^)\s*(?:month|mon|мес\p{L}*|ай|year|yr|год\p{L}*|жыл|hour|hr|час\p{L}*|сағ\p{L}*|شهر|سنة|ساعة)(?:$|[^\p{L}])/iu

/** A unit from free text: «Oil_Rate_bbl_day», «Нефть, м³/сут», «Gas (Mscf/d)», «газ, тыс. м3/сут». */
export function readUnit(text: string): Unit | null {
  const value = ` ${text.toLowerCase().replace(/[_*`]/g, " ").replace(/<sup>3<\/sup>|[³]/g, "3").replace(/м\s*\^?\s*3/g, "м3").replace(/m\s*\^?\s*3/g, "m3").replace(/\s+/g, " ")} `
  const reservoir = /reservoir|in.situ|пластов|\brb\b|\brm3\b/iu.test(value)
  const surface = /standard|stock.tank|surface|стандарт|поверхност|\bstb\b|\b(?:mm|m)?scf\b|\b[sn]m3\b|ст\.\s*м3/iu.test(value)
  const timing = { perDay: DAY.test(value), otherTime: OTHER_TIME.test(value), basis: reservoir ? "reservoir" as const : surface ? "surface" as const : "unknown" as const }
  if (/(?:^|[^\p{L}])(?:mmscf|mmcf)/iu.test(value)) return { family: "scf", factor: 1e6, ...timing }
  if (/(?:^|[^\p{L}])(?:mscf|mcf)/iu.test(value)) return { family: "scf", factor: 1e3, ...timing }
  if (/(?:^|[^\p{L}])(?:scf|ft3|cf\/d|scfd)/iu.test(value)) return { family: "scf", factor: 1, ...timing }
  if (/(?:тыс\.?\s*(?:ст\.?\s*|н)?(?:м3|m3)|thousand\s*s?m3|\bksm3\b|\bmsm3\b|мың\s*м3)/iu.test(value)) return { family: "sm3", factor: 1e3, ...timing }
  if (/(?:млн\.?\s*(?:ст\.?\s*|н)?(?:м3|m3)|million\s*s?m3|\bmmsm3\b)/iu.test(value)) return { family: "sm3", factor: 1e6, ...timing }
  if (/(?:\bsm3\b|\bnm3\b|ст\.?\s*м3|нм3|std\s*m3)/iu.test(value)) return { family: "sm3", factor: 1, ...timing }
  if (/(?:m3|м3|кубометр|cubic\s*met)/iu.test(value)) return { family: "m3", factor: 1, ...timing }
  if (/(?:^|[^\p{L}])(?:bbl|bbls|stb|барр\p{L}*|bopd|bwpd|blpd|bpd|برميل)/iu.test(value)) return { family: "bbl", factor: 1, ...timing }
  if (/(?:^|[^\p{L}])(?:t|т|тн|тонн\p{L}*|tonnes?|tons?|طن)(?:$|[^\p{L}])/iu.test(value)) return { family: "t", factor: 1, ...timing }
  return null
}

function splitRow(line: string, delimiter: string) {
  if (delimiter === "|") return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
  const cells: string[] = []
  let current = "", quoted = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === '"') { if (quoted && line[index + 1] === '"') { current += '"'; index++ } else quoted = !quoted; continue }
    if (char === delimiter && !quoted) { cells.push(current.trim()); current = ""; continue }
    current += char
  }
  cells.push(current.trim())
  return cells
}

/** Candidate tables: a Markdown pipe table, or a block of delimited lines with a text header. */
type FoundTable = { rows: string[][]; delimiter: string; text: string; unitContext?: string }

/** JSON tables are data, never instructions. Only scalar records and explicit unit metadata. */
function jsonTables(text: string): FoundTable[] {
  const result: FoundTable[] = []
  const candidates = [...text.matchAll(/^\s*[{[]/gm)].slice(0, 32)
  let consumed = -1
  for (const match of candidates) {
    const start = match.index! + match[0].search(/[{[]/)
    if (start <= consumed) continue
    let depth = 0, quoted = false, escaped = false
    for (let end = start; end < text.length; end++) {
      const c = text[end]
      if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; continue }
      if (c === '"') { quoted = true; continue }
      if (c === "{" || c === "[") depth++
      if (c === "}" || c === "]") depth--
      if (depth !== 0) continue
      consumed = end
      try {
        const raw = text.slice(start, end + 1), object = JSON.parse(raw)
        const records = Array.isArray(object) ? object : object.rows || object.data || object.records
        if (!Array.isArray(records) || !records.length || records.length > MAX_ROWS || records.some(r => !r || typeof r !== "object" || Array.isArray(r))) break
        const keys = [...new Set(records.flatMap(r => Object.keys(r)))]
        if (keys.length > 40 || records.some(r => Object.values(r).some(v => v !== null && !["string", "number"].includes(typeof v)))) break
        const units = !Array.isArray(object) && object.units && typeof object.units === "object" ? object.units : {}
        const unitContext = Object.entries(units).map(([key, value]) => {
          const unit = typeof value === "string" ? value : value && typeof value === "object" ? [Reflect.get(value, "unit"), Reflect.get(value, "conditions"), Reflect.get(value, "basis")].filter(v => typeof v === "string").join(" ") : ""
          return `${key} = ${unit}`
        }).join("\n")
        result.push({ rows: [keys, ...records.map(r => keys.map(k => r[k] === undefined || r[k] === null ? "" : String(r[k])))], text: raw, delimiter: "json", unitContext })
      } catch { /* malformed JSON is never repaired */ }
      break
    }
  }
  return result
}

export function findTables(text: string): FoundTable[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/^\s*```\w*\s*$/, ""))
  const tables: FoundTable[] = []
  let index = 0
  const isHeader = (line: string, delimiter: string) => {
    const roles = splitRow(line, delimiter).map(name => SKIP.test(name) ? undefined : ROLE_PATTERNS.find(([, pattern]) => pattern.test(name.replace(/[*`]/g, "")))?.[0])
    return roles.includes("period") && roles.includes("oil")
  }
  while (index < lines.length) {
    const line = lines[index]
    if ((line.match(/\|/g) || []).length >= 2) {
      if (!isHeader(line, "|")) { index++; continue }
      const block: string[] = []
      while (index < lines.length && (lines[index].match(/\|/g) || []).length >= 2 && (!block.length || !isHeader(lines[index], "|"))) block.push(lines[index++])
      const rows = block.filter((row) => !/^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row)).map((row) => splitRow(row, "|"))
      if (rows.length >= 2) tables.push({ rows, delimiter: "|", text: block.join("\n") })
      continue
    }
    const delimiter = ["\t", ";", ","].find((candidate) => line.includes(candidate) && /\p{L}/u.test(line))
    if (delimiter && isHeader(line, delimiter)) {
      const width = splitRow(line, delimiter).length
      const block: string[] = [line]
      let cursor = index + 1
      while (cursor < lines.length && lines[cursor].trim() && splitRow(lines[cursor], delimiter).length === width && !isHeader(lines[cursor], delimiter)) block.push(lines[cursor++])
      if (width >= 2 && block.length >= 2) { tables.push({ rows: block.map((row) => splitRow(row, delimiter)), delimiter, text: block.join("\n") }); index = cursor; continue }
    }
    index += 1
  }
  return [...tables, ...jsonTables(text)]
}

type NumberStyle = "decimal-comma" | "thousands-comma" | null

function columnNumberStyle(cells: string[]): NumberStyle {
  let decimalComma = false, thousandsComma = false
  for (const raw of cells) {
    const cell = raw.replace(/[\s\u00a0\u202f']/g, "")
    if (/^\d+,\d+$/.test(cell) && !/^\d{1,3},\d{3}$/.test(cell)) decimalComma = true
    if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(cell) || /^\d{1,3}(?:,\d{3}){2,}$/.test(cell) || /^\d+\.\d+$/.test(cell)) thousandsComma = true
  }
  return decimalComma && !thousandsComma ? "decimal-comma" : thousandsComma && !decimalComma ? "thousands-comma" : null
}

const MISSING = /^(?:|-|—|–|n\/a|na|н\/д|нет|null|none|\?)$/iu

/** A rate cell: null when empty, NaN when unreadable or ambiguous, never a guess. */
function readNumber(raw: string, style: NumberStyle, fallback: NumberStyle) {
  const cell = normalizeDigits(raw).replace(/[\s\u00a0\u202f']/g, "").replace(/^\+/, "")
  if (MISSING.test(cell)) return null
  if (/^-/.test(cell)) return -1
  if (/^\d+(?:\.\d+)?$/.test(cell)) return Number(cell)
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(cell) && (/\./.test(cell) || /,\d{3},/.test(cell) || (style ?? fallback) === "thousands-comma")) return Number(cell.replace(/,/g, ""))
  if (/^\d+,\d+$/.test(cell)) {
    const ambiguous = /^\d{1,3},\d{3}$/.test(cell)
    const use = ambiguous ? (style ?? fallback) : "decimal-comma"
    if (use === "decimal-comma") return Number(cell.replace(",", "."))
    if (use === "thousands-comma") return Number(cell.replace(",", ""))
    return Number.NaN
  }
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(cell)) return Number(cell.replace(/\./g, "").replace(",", "."))
  return Number.NaN
}

type Period = { kind: "month" | "date" | "name" | "index"; t: number; label: string }

function readPeriod(raw: string): Period | null {
  const cell = normalizeDigits(raw).trim().replace(/\s+/g, " ")
  const label = cell.slice(0, 40)
  let match = cell.match(/^(\d{4})[-./](\d{1,2})$/)
  if (match) { const month = Number(match[2]); return month >= 1 && month <= 12 ? { kind: "month", t: Number(match[1]) * 12 + month - 1, label } : null }
  match = cell.match(/^(\d{1,2})[./](\d{4})$/)
  if (match) { const month = Number(match[1]); return month >= 1 && month <= 12 ? { kind: "month", t: Number(match[2]) * 12 + month - 1, label } : null }
  match = cell.match(/^(\d{4})-(\d{2})-(\d{2})$/) || null
  let ymd: [number, number, number] | null = match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
  if (!ymd) { const dotted = cell.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if (dotted) ymd = [Number(dotted[3]), Number(dotted[2]), Number(dotted[1])] }
  if (ymd) {
    const [year, month, day] = ymd
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return { kind: "date", t: Date.UTC(year, month - 1, day) / 86_400_000, label }
  }
  const named = cell.toLowerCase().match(/^([\p{L} ]+?)\.?(?:\s+(\d{4}))?$/u)
  if (named) {
    const found = MONTHS.find(([pattern]) => pattern.test(named[1].trim()))
    if (found) return named[2] ? { kind: "month", t: Number(named[2]) * 12 + found[1], label } : { kind: "name", t: found[1], label }
  }
  if (/^\d{1,4}$/.test(cell)) return { kind: "index", t: Number(cell), label }
  return null
}

/** Bind declarations to their column, rather than assigning the first liquid unit to every phase. */
function messageUnits(prompt: string, role: Role): Array<{ unit: Unit; source: string }> {
  const found: Array<{ unit: Unit; source: string }> = []
  // Exclude all table headers/data: another table's units are not global declarations.
  let context = prompt
  for (const table of findTables(prompt)) {
    const headerRoles = table.rows[0].map(name => ROLE_PATTERNS.find(([, pattern]) => pattern.test(name))?.[0])
    if (table.delimiter === "json" || headerRoles.includes("period") && headerRoles.includes("oil")) context = context.replace(table.text, "")
  }
  for (const line of context.replace(/[*`"']/g, "").split(/\n|;/)) {
    const separator = line.match(/^(.*?)\s*(?:=|:|\bis\b|\bin\b|—|–)\s*(.+)$/iu)
    const label = (separator?.[1] || "").trim().replace(/_/g, " ")
    const declaredRole = ROLE_PATTERNS.find(([, pattern]) => pattern.test(label))?.[0]
    if (declaredRole === role || role !== "gas" && role !== "pressure" && /^(?:units?|единиц\p{L}*|дебит\p{L}*|rates?)/iu.test(label)) {
      const unit = readUnit(separator?.[2] || "")
      if (unit) found.push({ unit, source: line.trim() })
    }
    // Prose such as “Oil production (STB per day)” / “дебиты в м³/сут”.
    if (!separator && (ROLE_PATTERNS.find(([, pattern]) => pattern.test(line))?.[0] === role ||
      role !== "gas" && role !== "pressure" && /(?:дебит\p{L}*|rates?|units?|единиц\p{L}*)\s+(?:в|in)/iu.test(line))) {
      const unit = readUnit(line)
      if (unit && (unit.perDay || unit.otherTime)) found.push({ unit, source: line.trim() })
    }
  }
  return found
}

export function readPressureUnit(text: string): { factor: number; unit: string } | null {
  const token = text.match(/(?<![\p{L}])(?:MPa|kPa|psi[ag]?|bar|МПа|кПа|бар|пси)(?![\p{L}])/iu)?.[0]
  if (!token) return null
  const key = token.toLowerCase()
  const factor = /mpa|мпа/.test(key) ? 145.037737730209 : /kpa|кпа/.test(key) ? 0.145037737730209 : /bar|бар/.test(key) ? 14.5037737730209 : 1
  return { factor, unit: token }
}

function pressureUnit(prompt: string, header: string) {
  const sources = [header, ...prompt.replace(/[*`"']/g, "").split(/\n|;/).filter(line => /^(?:pwf|p[_ ]?wf|pressure|давлен\p{L}*)\s*(?:=|:|,|\(|\bis\b|\bin\b)/iu.test(line.trim()))]
  const known = sources.map(source => ({ source, unit: readPressureUnit(source) })).filter(item => item.unit !== null)
  const conflict = known.some(item => item.unit!.factor !== known[0].unit!.factor)
  return { unit: conflict ? null : known[0]?.unit || null, conflict: conflict ? known.map(item => item.source).join(" ↔ ") : null }
}

export function readPrice(prompt: string): PetroleumAnalysisRequest["parameters"]["price"] {
  const text = normalizeDigits(prompt)
  const currency = (token = "") => /\$|usd|долл|dollar|دولار/iu.test(token) ? "USD" : /€|eur|евро/iu.test(token) ? "EUR" : /₸|kzt|тенге|теңге/iu.test(token) ? "KZT" : /₽|rub|руб/iu.test(token) ? "RUB" : /sar|ريال/iu.test(token) ? "SAR" : /aed|درهم/iu.test(token) ? "AED" : /gbp|£/iu.test(token) ? "GBP" : null
  const per = (token: string) => /bbl|барр|برميل/iu.test(token) ? "bbl" as const : /m3|м3|m³|м³/iu.test(token) ? "m3" as const : /^(?:t|т|тонн\p{L}*|طن)$/iu.test(token.trim()) ? "t" as const : null
  const pattern = /(?:цен[аыу]|price|баға\p{L}*|سعر)[^\d$€₸₽£\n]{0,30}?([$€₸₽£])?\s*(\d+(?:[.,]\d+)?)\s*(\$|usd|долл\p{L}*|dollars?|eur|€|евро|kzt|₸|тенге|теңге|rub|₽|руб\p{L}*|sar|aed|gbp|£|دولار)?\s*(?:\/|за|per|لكل|للـ?)\s*(?:1\s*)?(bbl|барр\p{L}*|баррель|m3|м3|m³|м³|т|t|тонн\p{L}*|برميل|طن)(?![\p{L}])/iu
  const found = text.match(pattern)
  if (!found) return null
  const code = currency(found[1] || found[3] || "")
  const unit = per(found[4])
  const value = Number(found[2].replace(",", "."))
  return code && unit && value > 0 && value <= 1e6 ? { value, currency: code, per: unit } : null
}

function readDensity(prompt: string) {
  const found = normalizeDigits(prompt).match(/(?:плотност\p{L}*|density|тығыздығ\p{L}*|كثافة)[^\d\n]{0,25}(\d+(?:[.,]\d+)?)\s*(кг\s*\/\s*м3|kg\s*\/\s*m3|г\s*\/\s*см3|g\s*\/\s*cm3|т\s*\/\s*м3|t\s*\/\s*m3)?/iu)
  if (!found) return null
  const value = Number(found[1].replace(",", "."))
  const density = value < 5 ? value * 1000 : value
  return density >= 500 && density <= 1200 ? density : null
}

function readForecast(prompt: string) {
  const text = normalizeDigits(prompt)
  const explicit = text.match(/forecastMonths\s*[:=]\s*(\d{1,2})/i) || text.match(/(?:прогноз\p{L}*|forecast\p{L}*|болжам\p{L}*|توقع\p{L}*|تنبؤ)[^\d\n]{0,24}(\d{1,2})\s*(?:мес|month|ай|شهر|أشهر|период|period|дн|day|күн)/iu)
  if (!explicit) return 3
  return Math.max(0, Math.min(24, Number(explicit[1])))
}

function readGasReference(prompt: string) {
  const explicit = prompt.match(/gasReference\s*[:=]\s*([^\n]{1,160})/i)?.[1]?.trim()
  if (explicit) return explicit
  return prompt.match(/(?:при|at|в)\s*((?:60\s*°?\s*F|15\s*°?\s*C|20\s*°?\s*C|0\s*°?\s*C)[^,;\n]{0,60})/iu)?.[1]?.trim() || null
}

function wellFromPrompt(prompt: string) {
  return prompt.match(/(?:скважин[аыу]?|скв\.|well|ұңғыма\p{L}*)[ \t]*(?:№|#|no\.?)?[ \t]*([\p{L}\p{N}_.-]{0,12}\p{N}[\p{L}\p{N}_.-]{0,11})(?![\p{L}\p{N}])/iu)?.[1] || "W1"
}

const SYNTHETIC = /синтетич|synthetic|тестов\p{L}*\s+данн|test\s+data|demo|демо|вымышлен|fictional|пример\s+данных|اصطناعي|синтетикалық/iu

function unitToLiquid(unit: Unit): LiquidUnit | null { return unit.family === "bbl" ? "bbl/day" : unit.family === "m3" ? "m3/day" : unit.family === "t" ? "t/day" : null }
function unitToGas(unit: Unit): GasUnit | null { return unit.family === "scf" ? "scf/day" : unit.family === "sm3" || unit.family === "m3" ? "sm3/day" : null }

/** Factor that turns a value in `from` into `to` for stock-tank liquids (exact barrel). */
function liquidFactor(from: LiquidUnit, to: LiquidUnit, density: number | null): number | null {
  if (from === to) return 1
  const toM3 = (unit: LiquidUnit) => unit === "m3/day" ? 1 : unit === "bbl/day" ? BARREL_M3 : density ? 1000 / density : null
  const a = toM3(from), b = toM3(to)
  return a === null || b === null ? null : a / b
}

/**
 * Reads the first production table in the message. Returns null when the
 * message has no table with a period and an oil column.
 */
function parseSingleProductionTable(prompt: string, table: FoundTable, options: { scope?: "account" | "guest" | "api" | "fixture"; source?: "chat-table" }): TableParse | null {
  const message = stripPetroleumToken(String(prompt || "")).slice(0, 600_000) + "\n" + (table.unitContext || "")
  const language = oilLanguage(message.replace(/```[\s\S]*?```/g, " ").replace(/\|[^\n]*\|/g, " ") || message)
  for (const candidate of [table]) {
    const table = candidate
    const header = table.rows[0].map((cell) => cell.replace(/[*`]/g, "").trim())
    const roles = new Map<Role, number>()
    let duplicate = false
    header.forEach((name, index) => {
      if (SKIP.test(name) && !/^(?:month|date|period|месяц|дата|период)/iu.test(name)) return
      const role = ROLE_PATTERNS.find(([, pattern]) => pattern.test(name))?.[0]
      if (!role) return
      if (roles.has(role)) duplicate = true
      else roles.set(role, index)
    })
    if (!roles.has("period") || !roles.has("oil")) continue
    const columns = header.filter(Boolean)
    if (duplicate) return { kind: "needs-input", code: "DUPLICATE_COLUMN_ROLE", columns, language, tableText: table.text }
    if (table.rows.length - 1 > MAX_ROWS) return { kind: "needs-input", code: "TOO_MANY_ROWS", columns, language, tableText: table.text }

    const notes = new Set<string>()
    const resolved = new Map<Role, Unit>()
    const alerts: string[] = []
    for (const role of ["oil", "water", "gas", "liquid"] as const) {
      const index = roles.get(role)
      if (index === undefined) continue
      const own = readUnit(header[index])
      const declarations = messageUnits(message, role)
      const candidates = [...(own ? [{ unit: own, source: header[index] }] : []), ...declarations]
      const first = candidates[0]?.unit
      if (first && candidates.some(({ unit }) => unit.family !== first.family || unit.factor !== first.factor || unit.perDay !== first.perDay || unit.otherTime !== first.otherTime || unit.basis !== "unknown" && first.basis !== "unknown" && unit.basis !== first.basis)) {
        return { kind: "needs-input", code: "UNIT_CONFLICT", columns: candidates.map(item => item.source), language, tableText: table.text }
      }
      const unit = candidates.find(item => item.unit.basis !== "unknown")?.unit || first
      const invalid = !unit ? "UNITS_MISSING" : unit.otherTime || !unit.perDay ? "RATE_BASIS_MISSING" : unit.basis === "reservoir" ? "RESERVOIR_CONVERSION_REQUIRED" : role === "gas" && unit.family === "m3" && unit.basis === "unknown" ? "GAS_CONDITIONS_REQUIRED" : null
      if (invalid) {
        if (role === "oil") return { kind: "needs-input", code: invalid, columns: invalid === "UNITS_MISSING" ? (["oil", "water", "gas", "liquid"] as const).filter(r => roles.has(r) && !readUnit(header[roles.get(r)!]) && !messageUnits(message, r).length).map(r => header[roles.get(r)!]) : [header[index]], language, tableText: table.text }
        alerts.push(`${header[index]}: ${invalid}`)
        notes.add(`${role.toUpperCase()}_${invalid}`)
        roles.delete(role)
        continue
      }
      resolved.set(role, unit!)
      if (!own) notes.add("UNITS_FROM_MESSAGE")
    }
    const unitFor = (role: Role) => resolved.get(role) || null
    const oilUnit = unitFor("oil"), waterUnit = unitFor("water"), gasUnit = unitFor("gas"), liquidUnitColumn = unitFor("liquid")
    const pressureIndex = roles.get("pressure")
    const pressure = pressureIndex === undefined ? { unit: null, conflict: null } : pressureUnit(message, header[pressureIndex])
    if (pressure.conflict) return { kind: "needs-input", code: "UNIT_CONFLICT", columns: [pressure.conflict], language, tableText: table.text }
    if (pressureIndex !== undefined && !pressure.unit) { notes.add("PRESSURE_UNITS_MISSING"); alerts.push(`${header[pressureIndex]}: UNITS_MISSING`) }

    const density = readDensity(message)
    let liquid = unitToLiquid(oilUnit as Unit)
    if (!liquid) return { kind: "needs-input", code: "OIL_UNIT_UNSUPPORTED", columns: [header[roles.get("oil") as number]], language, tableText: table.text }
    const waterLiquid = waterUnit ? unitToLiquid(waterUnit) : null
    const columnLiquid = liquidUnitColumn ? unitToLiquid(liquidUnitColumn) : null
    if ((waterUnit && !waterLiquid) || (liquidUnitColumn && !columnLiquid)) return { kind: "needs-input", code: "WATER_UNIT_UNSUPPORTED", columns: [header[(roles.get("water") ?? roles.get("liquid")) as number]], language, tableText: table.text }
    // Oil by mass with water by volume: oil becomes volume through the stated density.
    const otherUnit = waterLiquid || columnLiquid
    let oilFactor = 1
    if (liquid === "t/day" && otherUnit && otherUnit !== "t/day") {
      if (!density) return { kind: "needs-input", code: "OIL_DENSITY_REQUIRED", columns: [header[roles.get("oil") as number]], language, tableText: table.text }
      oilFactor = liquidFactor("t/day", otherUnit, density) as number
      liquid = otherUnit
      notes.add("OIL_MASS_TO_VOLUME_BY_DENSITY")
    } else if (liquid !== "t/day" && otherUnit === "t/day") {
      return { kind: "needs-input", code: "WATER_MASS_WITH_OIL_VOLUME", columns: [header[(roles.get("water") ?? roles.get("liquid")) as number]], language, tableText: table.text }
    }
    const waterFactor = waterLiquid ? liquidFactor(waterLiquid, liquid, density) : null
    const liquidColumnFactor = columnLiquid ? liquidFactor(columnLiquid, liquid, density) : null
    if (waterLiquid && waterLiquid !== liquid) notes.add("WATER_CONVERTED_TO_OIL_UNIT")
    if (columnLiquid && columnLiquid !== liquid) notes.add("LIQUID_CONVERTED_TO_OIL_UNIT")
    const gas = gasUnit ? unitToGas(gasUnit) : null
    if (gasUnit && !gas) return { kind: "needs-input", code: "GAS_UNIT_UNSUPPORTED", columns: [header[roles.get("gas") as number]], language, tableText: table.text }
    if (gasUnit && gasUnit.family === "m3") notes.add("GAS_STANDARD_EXPLICIT")
    if (gasUnit && gasUnit.factor !== 1) notes.add("GAS_PREFIX_EXPANDED")
    if (!roles.has("water") && roles.has("liquid")) notes.add("WATER_DERIVED_FROM_LIQUID")

    const body = table.rows.slice(1)
    const styles = new Map<number, NumberStyle>()
    for (const role of ["oil", "water", "gas", "liquid"] as const) {
      const index = roles.get(role)
      if (index !== undefined) styles.set(index, columnNumberStyle(body.map((row) => row[index] || "")))
    }
    const fallback: NumberStyle = language === "ru" || language === "kk" ? "decimal-comma" : "thousands-comma"
    const issues: TableIssue[] = []
    type Row = { well: string; period: Period; oil: number; water: number | null; gas: number | null; pressure: number | null; source: number }
    const accepted: Row[] = []
    const defaultWell = wellFromPrompt(message)
    let periodKind: Period["kind"] | null = null
    let usedFallback = false
    body.forEach((cells, offset) => {
      const source = offset + 2
      if (cells.length !== header.length) { issues.push({ row: source, code: "ROW_SHAPE" }); return }
      const period = readPeriod(cells[roles.get("period") as number])
      if (!period) { issues.push({ row: source, code: "PERIOD_INVALID", column: header[roles.get("period") as number] }); return }
      const family = period.kind === "name" ? "name" : period.kind
      if (periodKind && periodKind !== family) { issues.push({ row: source, code: "PERIOD_FORMAT_MIXED" }); return }
      periodKind = family
      const read = (role: Role) => {
        const index = roles.get(role)
        if (index === undefined) return undefined
        const style = styles.get(index) ?? null
        if (!style && /^\d{1,3},\d{3}$/.test(cells[index].replace(/[\s\u00a0\u202f']/g, ""))) usedFallback = true
        const raw = readNumber(cells[index], style, fallback)
        return raw === null ? null : raw * (role === "gas" ? (gasUnit as Unit).factor : 1)
      }
      const oil = read("oil"), waterRaw = read("water"), gasValue = read("gas"), liquidRaw = read("liquid")
      for (const [role, value] of [["oil", oil], ["water", waterRaw], ["gas", gasValue], ["liquid", liquidRaw]] as const) {
        if (typeof value === "number" && Number.isNaN(value)) { issues.push({ row: source, code: "NUMBER_UNREADABLE", column: header[roles.get(role) as number] }); return }
        if (typeof value === "number" && value < 0) { issues.push({ row: source, code: "NEGATIVE_RATE", column: header[roles.get(role) as number] }); return }
        if (typeof value === "number" && value > 1e12) { issues.push({ row: source, code: "RATE_OUT_OF_RANGE", column: header[roles.get(role) as number] }); return }
      }
      if (oil === null || oil === undefined) { issues.push({ row: source, code: "MISSING_OIL", column: header[roles.get("oil") as number] }); return }
      const oilValue = oil * oilFactor
      let water: number | null = typeof waterRaw === "number" && waterFactor !== null ? waterRaw * waterFactor : null
      if (water === null && waterRaw === undefined && typeof liquidRaw === "number" && liquidColumnFactor !== null) {
        const derived = liquidRaw * liquidColumnFactor - oilValue
        if (derived < -1e-9 * Math.max(1, liquidRaw)) { issues.push({ row: source, code: "LIQUID_BELOW_OIL" }); return }
        water = Math.max(0, derived)
      }
      const wellIndex = roles.get("well")
      const well = wellIndex === undefined ? defaultWell : cells[wellIndex].replace(/[^\p{L}\p{N}_. #№-]/gu, "").trim().slice(0, 80)
      if (!well) { issues.push({ row: source, code: "WELL_MISSING" }); return }
      let pressureValue: number | null = null
      if (pressureIndex !== undefined && pressure.unit) {
        const raw = readNumber(cells[pressureIndex], null, fallback)
        if (raw !== null && Number.isFinite(raw) && raw >= 0 && raw * pressure.unit.factor <= 1e7) pressureValue = raw * pressure.unit.factor
        else if (raw !== null) issues.push({ row: source, code: "PRESSURE_INVALID", column: header[pressureIndex] })
      }
      accepted.push({ well, period, oil: oilValue, water, gas: typeof gasValue === "number" ? gasValue : null, pressure: pressureValue, source })
    })
    if (usedFallback) notes.add(fallback === "decimal-comma" ? "COMMA_READ_AS_DECIMAL" : "COMMA_READ_AS_THOUSANDS")
    if (!accepted.length) return { kind: "needs-input", code: "NO_VALID_ROWS", columns, language, tableText: table.text }

    // Published totals are checks, never another producing well.
    const totals = accepted.filter(row => /^(?:total|field|field total|итого|всего|сумма)$/iu.test(row.well))
    for (const total of totals) {
      const contributors = accepted.filter(row => !totals.includes(row) && row.period.label === total.period.label)
      for (const role of ["oil", "water", "gas"] as const) {
        if (total[role] === null || !contributors.length || contributors.some(row => row[role] === null)) continue
        const sum = contributors.reduce((sum, row) => sum + row[role]!, 0)
        if (Math.abs(sum - total[role]!) > 1e-9 * Math.max(1, Math.abs(sum))) issues.push({ row: total.source, code: "AGGREGATE_TOTAL_MISMATCH", column: role })
        else notes.add("REPORTED_TOTAL_VERIFIED")
      }
    }
    for (let index = accepted.length - 1; index >= 0; index--) if (totals.includes(accepted[index])) accepted.splice(index, 1)
    if (!accepted.length) return { kind: "needs-input", code: "NO_VALID_ROWS", columns, language, tableText: table.text }

    // Month names without a year run forward: «Декабрь, Январь» crosses into the next year.
    const kind = periodKind as Period["kind"] | null
    const byWell = new Map<string, Row[]>()
    for (const row of accepted) { const group = byWell.get(row.well) || []; group.push(row); byWell.set(row.well, group) }
    if (kind === "name") for (const rows of byWell.values()) {
      let year = 0, previous = -1
      for (const row of rows) { if (row.period.t <= previous) year += 1; previous = row.period.t; row.period = { ...row.period, t: row.period.t + 12 * year } }
    }
    const allDates = kind === "date"
    const monthlyDates = allDates && accepted.every((row) => new Date(row.period.t * 86_400_000).getUTCDate() === 1)
    if (monthlyDates) for (const row of accepted) { const date = new Date(row.period.t * 86_400_000); row.period = { ...row.period, t: date.getUTCFullYear() * 12 + date.getUTCMonth() } }
    const granularity: PetroleumAnalysisRequest["dataset"]["granularity"] = kind === "month" || kind === "name" || monthlyDates ? "month" : kind === "date" ? "day" : /^(?:month|месяц|мес|ай|شهر|الشهر)/iu.test(header[roles.get("period") as number]) ? "month" : "index"
    const calendar = kind === "month" || kind === "date"

    let omittedWells = 0
    let entries = [...byWell.entries()]
    if (entries.length > MAX_WELLS) {
      // Keep the wells that lost the most oil; the report says how many were left out.
      entries = entries.map(([id, rows]) => [id, [...rows].sort((a, b) => a.period.t - b.period.t)] as [string, Row[]])
        .sort((a, b) => (b[1][0].oil - b[1][b[1].length - 1].oil) - (a[1][0].oil - a[1][a[1].length - 1].oil) || a[0].localeCompare(b[0]))
      omittedWells = entries.length - MAX_WELLS
      entries = entries.slice(0, MAX_WELLS)
    }
    let rejected = issues.length
    const wells: PetroleumAnalysisRequest["dataset"]["wells"] = []
    for (const [id, rows] of entries) {
      const sorted = [...rows].sort((a, b) => a.period.t - b.period.t)
      if (rows.some((row, index) => index > 0 && row.period.t < rows[index - 1].period.t)) notes.add("SORTED_BY_PERIOD")
      const counts = new Map<number, number>()
      for (const row of sorted) counts.set(row.period.t, (counts.get(row.period.t) || 0) + 1)
      const unique = sorted.filter((row) => {
        if ((counts.get(row.period.t) || 0) === 1) return true
        issues.push({ row: row.source, code: "DUPLICATE_PERIOD" })
        rejected += 1
        return false
      })
      if (!unique.length) continue
      const hasWater = unique.some((row) => row.water !== null)
      const hasGas = unique.some((row) => row.gas !== null)
      wells.push({
        id,
        t: unique.map((row) => row.period.t),
        period: unique.map((row) => row.period.label),
        oil: unique.map((row) => row.oil),
        water: hasWater ? unique.map((row) => row.water) : null,
        gas: hasGas && gas ? unique.map((row) => row.gas) : null,
        pressure: unique.some(row => row.pressure !== null) ? unique.map(row => row.pressure) : null,
      })
    }
    if (!wells.length) return { kind: "needs-input", code: "NO_VALID_ROWS", columns, language, tableText: table.text }
    const acceptedRows = wells.reduce((sum, well) => sum + well.t.length, 0)
    const request = petroleumAnalysisRequestSchema.safeParse({
      schemaVersion: OIL_ANALYSIS_SCHEMA_VERSION,
      taskType: "production-history",
      authenticatedContext: { scope: options.scope || "guest" },
      dataset: { granularity, calendar, wells },
      metadata: {
        source: options.source || "chat-table",
        dataKind: SYNTHETIC.test(message) ? "synthetic" : "user",
        sourceHash: null,
        acceptedRows,
        rejectedRows: rejected,
        issues: issues.slice(0, 60).map((item) => ({ row: item.row, code: item.code, ...(item.column ? { column: item.column.slice(0, 80) } : {}) })),
        notes: [...notes].slice(0, 24),
        omittedWells,
      },
      units: { liquid, gas: wells.some((well) => well.gas) ? gas : null, gasReference: readGasReference(message), oilDensityKgM3: density },
      parameters: { forecastPeriods: readForecast(message), price: readPrice(message) },
      requestedAnalyses: [...OIL_ANALYSES],
      language,
    })
    if (!request.success) return { kind: "needs-input", code: "TABLE_CONTRACT_REJECTED", columns, language, tableText: table.text }
    return { kind: "ok", request: request.data, tableText: table.text, language, alerts }
  }
  return null
}

/** Every production table is parsed independently, then normalized before field aggregation. */
export function parseProductionTable(prompt: string, options: { scope?: "account" | "guest" | "api" | "fixture"; source?: "chat-table" } = {}): TableParse | null {
  const message = stripPetroleumToken(String(prompt || "")).slice(0, 600_000)
  const parsed = findTables(message).map(table => parseSingleProductionTable(message, table, options)).filter((p): p is TableParse => p !== null)
  if (!parsed.length) return null
  const refused = parsed.find(p => p.kind === "needs-input")
  if (refused) return refused
  const valid = parsed.filter((p): p is Extract<TableParse, { kind: "ok" }> => p.kind === "ok")
  if (valid.length === 1) return valid[0]
  const first = valid[0], request = structuredClone(first.request)
  const byId = new Map(request.dataset.wells.map(w => [w.id, w]))
  for (const next of valid.slice(1)) {
    const other = next.request
    const factor = liquidFactor(other.units.liquid, request.units.liquid, request.units.oilDensityKgM3)
    if (factor === null || other.units.gas !== request.units.gas || other.units.gasReference !== request.units.gasReference || other.dataset.granularity !== request.dataset.granularity || other.dataset.calendar !== request.dataset.calendar)
      return { kind: "needs-input", code: "TABLE_UNITS_OR_PERIODS_CONFLICT", columns: [JSON.stringify(request.units), JSON.stringify(other.units)], language: first.language, tableText: message }
    for (const source of other.dataset.wells) {
      const well = { ...source, oil: source.oil.map(v => v * factor), water: source.water?.map(v => v === null ? null : v * factor) || null }
      const existing = byId.get(well.id)
      if (!existing) { byId.set(well.id, well); continue }
      if (well.t.some(t => existing.t.includes(t))) return { kind: "needs-input", code: "DUPLICATE_WELL_PERIOD_ACROSS_TABLES", columns: [well.id], language: first.language, tableText: message }
      const points = [...existing.t.map((t, i) => ({ t, i, w: existing })), ...well.t.map((t, i) => ({ t, i, w: well }))].sort((a, b) => a.t - b.t)
      byId.set(well.id, { id: well.id, t: points.map(p => p.t), period: points.map(p => p.w.period[p.i]), oil: points.map(p => p.w.oil[p.i]), water: points.map(p => p.w.water?.[p.i] ?? null), gas: points.map(p => p.w.gas?.[p.i] ?? null), pressure: points.map(p => p.w.pressure?.[p.i] ?? null) })
    }
    request.metadata.acceptedRows += other.metadata.acceptedRows
    request.metadata.rejectedRows += other.metadata.rejectedRows
    request.metadata.issues = [...request.metadata.issues, ...other.metadata.issues].slice(0, 60)
    request.metadata.notes = [...new Set([...request.metadata.notes, ...other.metadata.notes, "MULTIPLE_TABLES_MERGED"])].slice(0, 24)
  }
  request.dataset.wells = [...byId.values()]
  const checked = petroleumAnalysisRequestSchema.safeParse(request)
  if (!checked.success) return { kind: "needs-input", code: "TABLE_CONTRACT_REJECTED", columns: [], language: first.language, tableText: message }
  return { ...first, request: checked.data, tableText: valid.map(p => p.tableText).join("\n\n"), alerts: valid.flatMap(p => p.alerts || []) }
}
