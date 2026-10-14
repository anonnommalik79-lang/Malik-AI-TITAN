import { decimal, equal, evaluateExact, evaluateDetailed, exactText, rounded, convertExact, unitDimension, less } from "./exact"
import { mul, div, q, type Q } from "../../work/math/rational"
import { markdownTableCells } from "../markdown-table"
import { annuityPayment, compound } from "./finance"

export type ClaimOrigin = "user-data" | "calculation" | "external-fact" | "assumption" | "forecast"
export type AccuracySource = { url?: string; title?: string; snippet?: string }
export type AccuracyIssue = { code: "arithmetic" | "units" | "financial" | "consistency" | "scientific-precision" | "limit"; line: number; detail: string; resolution: "corrected" | "withheld" | "unresolved" }
export type AccuracyClaim = { line: number; origin: ClaimOrigin; text: string; evidence: "user" | "deterministic" | "source-number-match" | "unverified" }
export type AccuracyReport = {
  scope: "recognized-deterministic-claims-only"
  version: "1"; status: "checked" | "corrected" | "limited"; checked: number; issues: AccuracyIssue[]; claims: AccuracyClaim[]
  verificationMs: number; repairCalls: number; additionalModelTokens: number | null; scannedCharacters: number
}
export type AccuracyResult = { content: string; report: AccuracyReport }
const MAX_CHARS = 60000, MAX_LINES = 800, MAX_ISSUES = 32
const N = String.raw`[+\-−]?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)`
const FORMULA = new RegExp(String.raw`(?<![\p{L}\p{N}_.,])([\d \u00a0\u202f.,()+\-−×*·÷/%^]{3,})\s*(=|≈)\s*(${N}(?:\s*/\s*${N})?)(?![\d.,/])`, "gu")
const UNIT = "(?:км/ч|km/h|м/с|m/s|км|km|см|cm|мм|mm|кг|kg|мин|min|мл|ml|м|m|г|g|с|s|ч|h|л|l)"
const CONVERSION = new RegExp(String.raw`(${N})\s*(${UNIT})\s*(=|≈)\s*(${N})\s*(${UNIT})(?![\p{L}\p{N}/])`, "giu")
const ASSUMPTION = /допусти|предполож|условно|гипотет|для\s+примера|при\s+условии|assum|hypothetic|suppose/iu
const FORECAST = /прогноз|прогнозиру|ожидаем|может\s+(?:составить|достичь)|forecast|projected|projection/iu
const SCIENCE = /единорог|пол[её]т|аэродинами|подъ[её]мн|научн|физик|unicorn|flight|aerodynamic|scientific|physics/iu
const QUANTITY = /\d[\d.,]*\s*(?:кг|км|м\/с|м²|м2|ньютон|Н(?!\p{L})|Вт|джоул|ватт|kg|km|m\/s|m²|newtons?|watts?|joules?|%)/u
function supportsQuantities(line: string, evidence: string): boolean {
  // Numeric coincidence (mass 300 kg → wing area 300 m²) is not support.
  const quantities = [...line.matchAll(/(\d+(?:[.,]\d+)?)\s*(кг|км|м\/с|м²|м2|ньютон|Н(?!\p{L})|Вт|джоул|ватт|kg|km|m\/s|m²|newtons?|watts?|joules?|%)/gu)]
  return quantities.length > 0 && quantities.every(([, value, unit]) => new RegExp(`(?<![\\d.,])${value.replace(/[.]/g, "\\.")}\\s*${unit.replace(/\//g, "\\/")}(?![\\p{L}\\p{N}])`, "u").test(evidence.slice(0, 24000)))
}
const METRICS = {
  mau: /(?:\bmau\b|месячн[\p{L}\s]{0,30}активн|активн[\p{L}\s]{0,30}пользоват)/iu,
  conversion: /конверси|conversion/iu,
  arppu: /\barppu\b|доход\s+на\s+платящ|revenue\s+per\s+paying/iu,
  arpu: /\barpu\b|доход\s+на\s+пользоват|revenue\s+per\s+user/iu,
  paying: /платящ|платн[\p{L}\s]{0,15}пользоват|paying|paid\s+users/iu,
  revenue: /выручк|\bmrr\b|monthly\s+revenue|revenue/iu,
}
type Metric = keyof typeof METRICS
type Financial = Partial<Record<Metric, Q>>

/** Unknown rates/rules are not exempt. Explicit user-rate arithmetic is. */
export function isUserCalculation(question: string): boolean {
  return /\d/u.test(question) && /рассч|посчит|вычисл|процент|calculate|compute/iu.test(question)
    && /(?:ставк|процент|rate|interest)[^\n]{0,35}\d[^\n]{0,12}%|\d+(?:[.,]\d+)?\s*%/iu.test(question)
    && !/актуальн|сейчас|закон|норм[аы]|официальн|действующ|current|latest|legal/iu.test(question)
}

export function needsAccuracyGate(question: string): boolean {
  const text = question.slice(0, MAX_CHARS)
  return /\d/u.test(text) || /рассч|посчит|вычисл|процент|конверси|прогноз|логическ|головоломк|коробк|поезд|арифмет|научн|физик|единорог|calculate|compute|forecast|conversion|logic puzzle|unicorn|physics/iu.test(text)
}

function metric(label: string): Metric | undefined {
  if (/годов|annual|yearly|\barr\b/iu.test(label)) return undefined
  return (Object.keys(METRICS) as Metric[]).find(key => METRICS[key].test(label))
}
function amount(raw: string, percent = false): Q | null {
  const match = new RegExp(String.raw`^\s*[$€₸]?\s*(${N})\s*(тыс\.?|млн\.?|thousand|million|k(?!\p{L}))?\s*(%)?\s*(?:[$€₸]|тенге|руб\.?|USD|EUR|KZT|RUB)?\s*$`, "iu").exec(raw.replace(/\*\*/g, ""))
  if (!match) return null
  try {
    let result = decimal(match[1])
    if (match[2]) result = mul(result, q(/млн|million/iu.test(match[2]) ? 1000000 : 1000))
    if (percent || match[3]) result = div(result, q(100))
    return result
  } catch { return null }
}
function currencyOf(raw: string): string | undefined {
  if (/USD|\$/iu.test(raw)) return "USD"
  if (/EUR|€/iu.test(raw)) return "EUR"
  if (/KZT|₸|тенге/iu.test(raw)) return "KZT"
  if (/RUB|руб/iu.test(raw)) return "RUB"
  return undefined
}
function inputRevenueCurrency(question: string): string | undefined {
  for (const part of question.slice(0, 12000).split(/[;\n]/)) {
    const [label, ...value] = part.split(/[:=]/u)
    if (metric(label) === "arppu" || metric(label) === "arpu") return currencyOf(value.join(":"))
  }
  return undefined
}
function financialGivens(question: string): Financial {
  const found: Financial = {}, ambiguous = new Set<Metric>()
  for (const part of question.slice(0, 12000).split(/[;\n]/)) {
    const match = /^\s*([^:=]{1,70})\s*[:=]\s*([^;\n]+)/u.exec(part)
    if (!match) continue
    const key = metric(match[1]), value = amount(match[2].replace(/[.!?]\s*$/, ""))
    if (key && value) {
      if (found[key] && !equal(found[key]!, value)) ambiguous.add(key)
      found[key] = value
    }
  }
  for (const key of ambiguous) delete found[key]
  return found
}
function financialExpected(data: Financial): Financial {
  const result: Financial = {}
  if (data.mau && data.conversion && !less(data.mau, q(0)) && !less(data.conversion, q(0)) && !less(q(1), data.conversion)) result.paying = mul(data.mau, data.conversion)
  // ARPU is per ALL active users. ARPPU is per paying user: never conflate them.
  if (data.mau && data.arpu) result.revenue = mul(data.mau, data.arpu)
  else if (result.paying && data.arppu) result.revenue = mul(result.paying, data.arppu)
  return result
}

/** A single non-scenario table may supply the inputs for its own conclusion.
 * Never combine different months/scenarios or treat model inputs as user data. */
function singleProfileTable(answer: string): { expected: Financial; currency?: string } | undefined {
  let headers: string[] | null = null, fence = false
  const profiles: Array<{ expected: Financial; currency?: string }> = []
  for (const line of answer.slice(0, MAX_CHARS).split("\n").slice(0, MAX_LINES)) {
    if (/^\s*(?:`{3,}|~{3,})/u.test(line)) { fence = !fence; continue }
    if (fence || line.length > 2000) continue
    if (ASSUMPTION.test(line) || FORECAST.test(line)) return undefined
    const cells = line.includes("|") ? markdownTableCells(line) : []
    if (cells.length && cells.every(cell => /^:?-{3,}:?$/u.test(cell))) continue
    if (cells.some(cell => METRICS.mau.test(cell)) && !cells.some(cell => amount(cell))) {
      if (cells.some(cell => /месяц|период|год|сценари|вариант|month|period|year|scenario/iu.test(cell))) return undefined
      headers = cells; continue
    }
    if (headers && cells.length === headers.length) {
      const data: Financial = {}
      let currency: string | undefined
      headers.forEach((header, index) => {
        const key = metric(header), value = amount(cells[index], key === "conversion" && header.includes("%"))
        if (key && value) data[key] = value
        if (key === "arpu" || key === "arppu") currency = currencyOf(cells[index])
      })
      const expected = financialExpected(data)
      if (expected.paying || expected.revenue) profiles.push({ expected, currency })
      if (profiles.length > 1) return undefined
    } else if (!cells.length) headers = null
  }
  return profiles.length === 1 ? profiles[0] : undefined
}

/** Limited recognized word problems; all other logical premises remain unproved. */
export function deterministicGivens(question: string): Array<{ label: string; formula: string; value: string }> {
  const out: Array<{ label: string; formula: string; value: string }> = []
  const expression = question.trim().replace(/^(?:реши|посчитай|вычисли|рассчитай|сколько\s+будет|calculate|compute|what\s+is|есепте)\s*:?\s*/iu, "").replace(/[?!.]\s*$/, "")
  if (expression.length <= 512 && /^[\d\s.,()+\-−×*·÷/%^]+$/u.test(expression) && /[+\-−×*·÷/%^]/u.test(expression)) {
    const value = evaluateExact(expression)
    if (value) out.push({ label: "Ответ", formula: expression, value: exactText(value) })
  }
  const finance = financialGivens(question), derived = financialExpected(finance)
  for (const key of ["paying", "revenue"] as const) if (derived[key]) out.push({ label: key === "paying" ? "Платящие пользователи" : "Месячная выручка", formula: key === "paying" ? "MAU × conversion" : finance.arpu ? "MAU × ARPU" : "MAU × conversion × ARPPU", value: exactText(derived[key]!) })
  // Recognized finance contracts explicitly require a rate PER PERIOD, avoiding
  // silent nominal/effective/annual conversions or undisclosed lending rules.
  const principal = new RegExp(String.raw`(?:principal|сумма|капитал)\s*[:=]\s*(${N})`, "iu").exec(question)
  const rate = new RegExp(String.raw`(?:ставка\s+за\s+период|rate\s+per\s+period)\s*[:=]\s*(${N})\s*(%)?`, "iu").exec(question)
  const count = /(?:периоды|periods)\s*[:=]\s*(\d{1,3})(?!\d)/iu.exec(question)
  if (principal && rate && count && !/закон|налог|комисси|страхов|legal|fee/iu.test(question)) {
    try {
      const r = rate[2] ? exactText(div(decimal(rate[1]), q(100))) : rate[1]
      if (/аннуитет|annuity/iu.test(question)) out.push({ label: "Платёж за период", formula: "P × r × (1+r)^n / ((1+r)^n − 1), без комиссий", value: rounded(annuityPayment(principal[1], r, Number(count[1])), 2) })
      else if (/сложн[\p{L}\s]{0,15}процент|compound/iu.test(question)) out.push({ label: "Сумма после капитализации", formula: "P × (1+r)^n, ставка за период", value: rounded(compound(principal[1], r, Number(count[1])), 2) })
    } catch { /* Unsupported/invalid finance is never guessed. */ }
  }
  // Deliberately require a total-count question; speed/location are irrelevant.
  const boxes = new RegExp(String.raw`(${N})\s*короб[\p{L}]*`, "iu").exec(question)
  const each = new RegExp(String.raw`(?:в\s+каждой|каждая)[^\d\n]{0,30}(${N})\s*(мяч[\p{L}]*|предмет[\p{L}]*|яблок[\p{L}]*)`, "iu").exec(question)
  if (boxes && each && /сколько\s+всего\s+(?:мяч|предмет|яблок)|сколько\s+(?:мяч|предмет|яблок)[\p{L}]*\s+всего/iu.test(question) && !/вытащ|перелож|достал|убрал|удалил|пуст|неизвест|некотор/iu.test(question)) {
    const result = evaluateExact(`${boxes[1]}*${each[1]}`)
    if (result) out.push({ label: "Всего предметов", formula: `${boxes[1]} × ${each[1]}`, value: exactText(result) })
  }
  const speed = new RegExp(String.raw`(${N})\s*(км/ч|м/с)`, "iu").exec(question)
  const time = new RegExp(String.raw`(?:за|в\s+течение)\s*(${N})\s*(час[\p{L}]*|ч(?!\p{L})|минут[\p{L}]*|мин(?!\p{L})|секунд[\p{L}]*|с(?!\p{L}))`, "iu").exec(question)
  if (speed && time && /(?:расстоян|сколько.*проед|какой\s+путь)/iu.test(question) && !/ускор|тормоз|останов|меня[\p{L}]*\s+скорост/iu.test(question)) {
    const v = convertExact(speed[1], speed[2], "м/с"), t = convertExact(time[1], /^ч/iu.test(time[2]) ? "ч" : /^мин/iu.test(time[2]) ? "мин" : "с", "с")
    if (v && t) out.push({ label: "Расстояние при постоянной скорости, м", formula: `${speed[1]} ${speed[2]} × ${time[1]} ${time[2]}`, value: exactText(mul(v, t)) })
  }
  return out
}

export function accuracyInstruction(question: string): string {
  if (!needsAccuracyGate(question)) return ""
  return ["[MALIK_ACCURACY]", "Separate user-provided data, computed results, external facts, assumptions and forecasts. Cite external facts only; calculations from user inputs do not require internet citations. Name the period, units, rounding and assumptions. A forecast is conditional, not a guaranteed fact. Scientific quantitative estimates need supplied inputs, a stated physical model/formula or an actual source. Without them describe dependencies, not an invented precise result.",
    ...deterministicGivens(question).map(item => `ACTUAL EXACT COMPUTATION from supplied values: ${item.label}: ${item.formula} = ${item.value}. This proves only this formula under the stated assumptions, not an arbitrary forecast/model.`),
    "[/MALIK_ACCURACY]"].join("\n")
}

/** Classifies explicit provenance only; unknown prose is NOT a proven fact. */
export function classifyClaim(line: string, _question: string): ClaimOrigin {
  if (FORECAST.test(line)) return "forecast"
  if (ASSUMPTION.test(line)) return "assumption"
  if (/из\s+(?:данных|условия|вашего\s+вопроса)|дано|по\s+вашим\s+данным|user.provided|given/iu.test(line)) return "user-data"
  if (/\d\s*(?:[+\-−×*÷/]\s*\d|%\s*=)|рассчитан|вычислен|computed|calculated/iu.test(line)) return "calculation"
  return "external-fact"
}

/** One bounded deterministic pass; surgical fixes, never global number replacement. */
export function checkAccuracy(answer: string, question: string, sources: readonly AccuracySource[] = []): AccuracyResult {
  const start = performance.now(), issues: AccuracyIssue[] = [], claims: AccuracyClaim[] = []
  let checked = 0, scanned = 0, fence = "", headers: string[] | null = null
  const givens = financialGivens(question)
  const tableProfile = Object.keys(givens).length ? undefined : singleProfileTable(answer)
  const summary = tableProfile?.expected || financialExpected(givens)
  const summaryCurrency = inputRevenueCurrency(question) || tableProfile?.currency
  const receipts = deterministicGivens(question)
  const addIssue = (issue: AccuracyIssue) => { if (issues.length < MAX_ISSUES) issues.push(issue) }
  // No full-array duplication for very large model output. Retain the untouched
  // tail explicitly as unverified instead of pretending the cap checked it.
  const characterBoundary = answer.length > MAX_CHARS ? Math.max(0, answer.lastIndexOf("\n", MAX_CHARS)) : answer.length
  const lineBoundary = answer.slice(0, characterBoundary).split("\n").slice(0, MAX_LINES).join("\n").length
  const boundary = Math.min(characterBoundary, lineBoundary)
  const tail = answer.slice(boundary), lines = answer.slice(0, boundary).split("\n")
  const withheldScientific: string[] = []
  for (let i = 0; i < lines.length && i < MAX_LINES && scanned < MAX_CHARS; i++) {
    let line = lines[i]
    scanned += line.length + 1
    const marker = /^\s*(`{3,}|~{3,})/u.exec(line)?.[1]
    if (marker) { fence = fence ? "" : marker[0]; continue }
    if (fence || !line.trim() || line.length > 2000 || /^(?:\s*>|\s*\[[^\]]+\]:)/u.test(line)) continue
    // Do not alter code, addresses, quoted text or model-supplied evidence blobs.
    const protectedLine = /`|https?:\/\/|"[^"\n]*\d[^"\n]*"|“[^”\n]*\d[^”\n]*”|«[^»\n]*\d[^»\n]*»/u.test(line)
    let deterministic = false
    if (!protectedLine) {
      const direct = receipts.find(item => item.label === "Ответ")
      if (direct) {
        const result = evaluateExact(direct.value)
        const claim = new RegExp(String.raw`^(\s*(?:(?:Ответ|Результат|Итого|Answer|Result)\s*[:=]\s*)?)(${N})(\s*[.!]?\s*)$`, "iu").exec(line)
        const reported = claim ? evaluateExact(claim[2]) : null
        if (claim && result && reported) {
          checked++; deterministic = true
          if (!equal(reported, result)) {
            addIssue({ code: "arithmetic", line: i + 1, detail: `${direct.formula} → ${direct.value}`, resolution: "corrected" })
            line = `${claim[1]}${direct.value}${claim[3]}`
          }
        }
      }
      const financialReceipt = receipts.find(item => item.label === "Платёж за период" || item.label === "Сумма после капитализации")
      if (financialReceipt) {
        const result = new RegExp(String.raw`^\s*(${financialReceipt.label}|Ответ)\s*[:=]\s*(${N})(\s*(?:USD|EUR|KZT|₸|тенге|руб\.?|[$€])?\s*)$`, "iu").exec(line)
        const reported = result ? evaluateExact(result[2]) : null
        if (result && reported) {
          checked++; deterministic = true
          if (!equal(reported, decimal(financialReceipt.value))) {
            addIssue({ code: "financial", line: i + 1, detail: financialReceipt.formula, resolution: "corrected" })
            line = `${result[1]}: ${financialReceipt.value}${result[3]}`
          }
        }
      }
      const boxes = receipts.find(item => item.label === "Всего предметов")
      if (boxes) {
        const claim = new RegExp(String.raw`^\s*(?:Всего\s+(?:мяч[\p{L}]*|предмет[\p{L}]*|яблок[\p{L}]*)\s*[:=]\s*|Ответ\s*[:=]\s*)(${N})(\s*(?:мяч[\p{L}]*|предмет[\p{L}]*|яблок[\p{L}]*)?\s*[.!]?\s*)$`, "iu").exec(line)
        const reported = claim ? evaluateExact(claim[1]) : null, expected = evaluateExact(boxes.value)
        if (claim && reported && expected) {
          checked++; deterministic = true
          if (!equal(reported, expected)) {
            addIssue({ code: "consistency", line: i + 1, detail: `${boxes.formula} → ${boxes.value}`, resolution: "corrected" })
            line = line.replace(claim[1], boxes.value)
          }
        }
      }
      const journey = receipts.find(item => item.label === "Расстояние при постоянной скорости, м")
      if (journey) {
        const claim = new RegExp(String.raw`^(\s*(?:Ответ|Расстояние|Путь)\s*[:=]\s*)(${N})\s*(км|km|м|m)\s*[.!]?\s*$`, "iu").exec(line)
        const reported = claim ? convertExact(claim[2], claim[3], "м") : null, expected = evaluateExact(journey.value)
        if (claim && reported && expected) {
          checked++; deterministic = true
          if (!equal(reported, expected)) {
            addIssue({ code: "consistency", line: i + 1, detail: journey.formula, resolution: "corrected" })
            line = `${claim[1]}${exactText(mul(expected, convertExact("1", "м", claim[3])!))} ${claim[3]} (при постоянной скорости).`
          }
        }
      }
      line = line.replace(FORMULA, (raw, lhs: string, relation: string, rhs: string) => {
        // A Markdown list marker is layout, not the operand's unary minus.
        const bullet = /^\s*(?:[-+*]|\d+[.)])\s+/u.exec(lhs)
        const prefix = bullet && line.startsWith(lhs) ? bullet[0] : lhs.match(/^\s*/u)?.[0] || ""
        const expression = lhs.slice(prefix.length).trim()
        if (!/\d\s*[%)]?\s*[+\-−×*·÷/^]/u.test(expression) || /(?:^|\s)\d{1,2}[-/]\d{1,2}[-/]20\d{2}/u.test(expression)) return raw
        const evaluation = evaluateDetailed(expression), result = evaluation.value
        if (evaluation.error === "division-by-zero") {
          checked++
          addIssue({ code: "arithmetic", line: i + 1, detail: `${lhs.trim()}: деление на ноль`, resolution: "withheld" })
          return `${prefix}${expression} — не определено: деление на ноль.`
        }
        if (!result) return raw
        checked++; deterministic = true
        const reported = evaluateExact(rhs), places = rhs.includes("/") ? 0 : rhs.split(/[.,]/)[1]?.length || 0
        if (!reported || places > 18) return raw
        if (equal(result, reported) || (relation === "≈" && equal(decimal(rounded(result, places)), reported))) return raw
        addIssue({ code: "arithmetic", line: i + 1, detail: `${lhs.trim()} ${relation} ${rhs}`, resolution: "corrected" })
        // Nonterminating results stay exact rational; do not fabricate decimals.
        return `${prefix}${expression} ${relation === "≈" ? "≈" : "="} ${relation === "≈" ? rounded(result, places) : exactText(result)}`
      })
      line = line.replace(CONVERSION, (raw, value: string, from: string, relation: string, rhs: string, to: string) => {
        const result = convertExact(value, from, to)
        if (!result) {
          if (unitDimension(from) && unitDimension(to) && unitDimension(from) !== unitDimension(to)) {
            checked++
            addIssue({ code: "units", line: i + 1, detail: "Несовместимые размерности", resolution: "withheld" })
            return `Перевод ${from} в ${to} невозможен: это разные физические величины.`
          }
          return raw
        }
        checked++; deterministic = true
        const places = rhs.split(/[.,]/)[1]?.length || 0, reported = evaluateExact(rhs)
        if (!reported || places > 18) return raw
        if (equal(result, reported) || (relation === "≈" && equal(decimal(rounded(result, places)), reported))) return raw
        addIssue({ code: "units", line: i + 1, detail: raw, resolution: "corrected" })
        return `${value} ${from} ${relation} ${relation === "≈" ? rounded(result, places) : exactText(result)} ${to}`
      })
    }
    // A code/link column must not disable verification of separate numeric
    // financial cells. amount() refuses code/links; those cells stay untouched.
      const cells = line.includes("|") ? markdownTableCells(line) : []
      if (cells.length && cells.every(cell => /^:?-{3,}:?$/u.test(cell))) continue
      if (cells.length >= 2 && cells.some(cell => METRICS.mau.test(cell)) && !cells.some(cell => amount(cell))) headers = cells
      else if (headers && cells.length === headers.length) {
        const data: Financial = {}, indexes: Partial<Record<Metric, number>> = {}
        headers.forEach((header, index) => { const key = metric(header), value = amount(cells[index], key === "conversion" && header.includes("%")); if (key && value) { data[key] = value; indexes[key] = index } })
        const expected = financialExpected(data)
        for (const key of ["paying", "revenue"] as const) {
          const index = indexes[key]
          if (index === undefined || !expected[key]) continue
          checked++; deterministic = true
          const sourceCurrency = currencyOf(cells[indexes.arpu ?? indexes.arppu ?? -1] || "")
          const targetCurrency = currencyOf(cells[index])
          if (key === "revenue" && sourceCurrency && targetCurrency && sourceCurrency !== targetCurrency) {
            addIssue({ code: "financial", line: i + 1, detail: "Валюты дохода и выручки различаются; курс не задан", resolution: "withheld" })
            cells[index] = "Не определено: требуется курс валют"; continue
          }
          if (equal(data[key]!, expected[key]!)) continue
          addIssue({ code: "financial", line: i + 1, detail: `${headers[index]}: ${cells[index]} → ${exactText(expected[key]!)}`, resolution: "corrected" })
          const old = cells[index]
          cells[index] = old.replace(new RegExp(N, "u"), exactText(expected[key]!)).replace(/\s*(?:тыс\.?|млн\.?|million|thousand|k(?!\p{L}))\s*/iu, " ")
        }
        line = `| ${cells.join(" | ")} |`
      } else if (!cells.length && headers) headers = null
      // Explicit single-profile summaries only. Multiple periods/scenarios are not conflated.
      if (!protectedLine && !line.includes("|") && !/сценари|вариант|прогноз|forecast|год|месяц\s*\d|year|month\s*\d|если|assum|suppose/iu.test(line)) {
        const m = /^\s*((?:\*\*)?[^:=]{1,65}(?:\*\*)?)\s*[:=]\s*(.+)$/u.exec(line)
        const key = m ? metric(m[1]) : undefined
        const value = m ? amount(m[2]) : null
        if (m && key && value && summary[key]) {
          checked++; deterministic = true
          const reportedCurrency = currencyOf(m[2])
          if (key === "revenue" && summaryCurrency && reportedCurrency && summaryCurrency !== reportedCurrency) {
            addIssue({ code: "financial", line: i + 1, detail: "Валюты исходных данных и результата различаются; курс не задан", resolution: "withheld" })
            line = `${m[1]}: не определено без курса валют.`
          } else if (!equal(value, summary[key]!)) {
            addIssue({ code: "financial", line: i + 1, detail: `${key}: ${exactText(value)} → ${exactText(summary[key]!)}`, resolution: "corrected" })
            line = `${m[1]}: ${m[2].replace(new RegExp(N, "u"), exactText(summary[key]!)).replace(/\s*(?:тыс\.?|млн\.?|million|thousand|k(?!\p{L}))\s*/iu, " ")}`
          }
        }
      }
    const origin = deterministic ? "calculation" : classifyClaim(line, question)
    const scientificEstimate = SCIENCE.test(question) && QUANTITY.test(line) && !deterministic && !protectedLine
      && !ASSUMPTION.test(line) && !/^(?:g|ускорение\s+свободного\s+падения)\s*(?:≈|=|:)\s*9[.,](?:81|8)\s*м\/с(?:²|2)\s*[.!]?$/iu.test(line.trim())
    const numbers = line.match(/\d+(?:[.,]\d+)?/gu) || []
    const citationIndexes = [...line.matchAll(/\[(\d{1,2})\]/gu)].map(match => Number(match[1]) - 1)
    const substantiveNumbers = line.replace(/\[\d{1,2}\]/gu, "").match(/\d+(?:[.,]\d+)?/gu) || []
    const sourceMatch = substantiveNumbers.length > 0 && citationIndexes.some(index => substantiveNumbers.every(n => new RegExp(`(?<![\\d.,])${n.replace(/[.]/g, "\\.")}(?![\\d.,])`, "u").test(sources[index]?.snippet || "")))
    const userMatch = substantiveNumbers.length > 0 && substantiveNumbers.every(n => new RegExp(`(?<![\\d.,])${n.replace(/[.]/g, "\\.")}(?![\\d.,])`, "u").test(question))
    const scientificSource = sourceMatch && citationIndexes.some(index => Boolean(sources[index]?.url) && supportsQuantities(line, sources[index]?.snippet || ""))
    if (scientificEstimate && !scientificSource && !supportsQuantities(line, question)) {
      addIssue({ code: "scientific-precision", line: i + 1, detail: "Количественная научная оценка без входных данных, формулы или соответствующего источника", resolution: "withheld" })
      // One diagnostic for the group, rather than a full fallback paragraph
      // substituted into every table/prose line. Keep table shape intact.
      withheldScientific.push(String(i + 1))
      if (line.includes("|")) line = "| " + markdownTableCells(line).map(cell => QUANTITY.test(cell) ? "—" : cell).join(" | ") + " |"
      else line = ""
    }
    if (numbers.length && claims.length < 48) claims.push({ line: i + 1, origin, text: line.slice(0, 240), evidence: deterministic ? "deterministic" : userMatch && origin === "user-data" ? "user" : sourceMatch ? "source-number-match" : "unverified" })
    lines[i] = line
  }
  if (tail) {
    issues.unshift({ code: "limit", line: 0, detail: "Проверка ограничена 60 000 символами / 800 строками; остальная часть не проверена", resolution: "unresolved" })
    issues.length = Math.min(issues.length, MAX_ISSUES)
  }
  const language = /[\u0600-\u06ff]/.test(question) ? "ar" : /[әғқңөұүһі]/i.test(question) ? "kk" : /[а-яё]/i.test(question) ? "ru" : "en"
  const note = {
    ru: "Неподтверждённые количественные оценки скрыты: исходные параметры, физическая модель или соответствующий источник не установлены. Проверенные расчёты и данные пользователя сохранены.",
    en: "Unsupported quantitative estimates were withheld: inputs, a physical model or matching source were not established. Verified calculations and supplied data were retained.",
    kk: "Расталмаған сандық бағалар жасырылды: бастапқы параметрлер, физикалық модель немесе сәйкес дереккөз жоқ. Тексерілген есептер мен берілген деректер сақталды.",
    ar: "حُجبت التقديرات الكمية غير المدعومة لعدم ثبوت المدخلات أو النموذج الفيزيائي أو المصدر المناسب. حُفظت الحسابات الموثقة والبيانات المقدمة.",
  }[language]
  return { content: lines.join("\n") + tail + (withheldScientific.length ? `\n\n> ${note}` : ""), report: { scope: "recognized-deterministic-claims-only", version: "1", status: issues.some(item => item.resolution === "unresolved") ? "limited" : issues.length ? "corrected" : "checked", checked, issues, claims, verificationMs: performance.now() - start, repairCalls: 0, additionalModelTokens: 0, scannedCharacters: Math.min(scanned, MAX_CHARS) } }
}

/** At most two deterministic passes; no recursive model calls or unbounded retries. */
export function finalizeAccuracy(answer: string, question: string, sources: readonly AccuracySource[] = []): AccuracyResult {
  const first = checkAccuracy(answer, question, sources)
  if (!first.report.issues.length || first.content === answer) return first
  const second = checkAccuracy(first.content, question, sources)
  second.report.issues = [...first.report.issues, ...second.report.issues].slice(0, MAX_ISSUES)
  second.report.status = second.report.status === "limited" ? "limited" : "corrected"
  second.report.verificationMs += first.report.verificationMs
  return second
}
