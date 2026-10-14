/**
 * Malik Analyst — the arithmetic half.
 *
 * A table the person gave us (pasted into the message or attached as CSV/XLSX)
 * becomes exact numbers: totals, averages, change from first to last, the
 * biggest rise and drop, shares of the total, a least-squares trend with a
 * short forecast, robust outliers and correlations between columns. Every
 * figure the chat shows comes from here; the model only explains them.
 *
 * Pure functions, no I/O, deterministic for the same input.
 */

export type AnalysisLocale = "ru" | "kk" | "en"
export type Axis = "time" | "category" | "index"
export type Aggregation = "sum" | "mean"

export type Point = { label: string; value: number }

export type MeasureStats = {
  name: string
  unit: string
  currency: "KZT" | "USD" | "EUR" | "RUB" | null
  percent: boolean
  aggregation: Aggregation
  count: number
  missing: number
  sum: number
  mean: number
  median: number
  std: number
  min: Point
  max: Point
  first: Point
  last: Point
  change: number
  changePct: number | null
  cagrPct: number | null
  cagrYears: number | null
  steps: Array<{ label: string; value: number | null; delta: number | null; deltaPct: number | null }>
  biggestRise: (Point & { delta: number; from: string }) | null
  biggestDrop: (Point & { delta: number; from: string }) | null
  shares: Array<Point & { share: number }> | null
  trend: { slope: number; intercept: number; r2: number; forecast: Point[] } | null
  anomalies: Array<Point & { score: number }>
}

export type DataAnalysis = {
  rows: number
  columns: number
  truncated: boolean
  labelColumn: string | null
  axis: Axis
  labels: string[]
  measures: MeasureStats[]
  correlations: Array<{ a: string; b: string; r: number; n: number }>
  categoryTotals: { by: string; measure: string; rows: Array<Point & { share: number }> } | null
  aggregatedDuplicates: boolean
  skippedColumns: string[]
}

export const ANALYSIS_LIMITS = { rows: 20_000, measures: 6, labels: 400 }

/* ----------------------------------------------------------------- numbers */

const CURRENCY_MARK = /₸|\$|€|₽|£|(?<!\p{L})(?:тг|тенге|теңге|kzt|usd|eur|rub|руб|долл|евро)(?!\p{L})\.?/giu
const MULTIPLIER: Array<[RegExp, number]> = [
  [/\s*(?:млрд|bn|billion)\.?$/iu, 1e9],
  [/\s*(?:млн|mln|million)\.?$/iu, 1e6],
  [/\s*(?:тыс|k|thousand|мың)\.?$/iu, 1e3],
]

/** «1 234,5», «1,234.5», «12%», «₸ 120 000», «2,5 млн» → numbers. Null for anything else. */
export function parseNumber(raw: string, locale: AnalysisLocale = "ru"): number | null {
  let text = String(raw ?? "").trim()
  if (!text || text.length > 40) return null
  // Dollars, euros and pounds are written the English way: «$1,200» is 1200.
  const englishMoney = /[$€£]|\b(?:usd|eur|gbp)\b/iu.test(text)
  let negative = false
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1) }
  text = text.replace(CURRENCY_MARK, "").replace(/[\s\u00a0\u202f\u2009']/g, "")
  let factor = 1
  for (const [pattern, multiplier] of MULTIPLIER) {
    if (pattern.test(text)) { factor = multiplier; text = text.replace(pattern, ""); break }
  }
  text = text.replace(/%$/, "").replace(/^\+/, "").replace(/^[−–]/, "-")
  if (!/^-?[\d.,]+$/.test(text) || !/\d/.test(text)) return null
  const comma = text.lastIndexOf(",")
  const dot = text.lastIndexOf(".")
  if (comma >= 0 && dot >= 0) {
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "")
  } else if (comma >= 0) {
    const groups = /^-?\d{1,3}(?:,\d{3})+$/.test(text)
    text = groups && (locale === "en" || englishMoney || (text.match(/,/g) || []).length > 1) ? text.replace(/,/g, "") : text.replace(/,/g, ".")
    if ((text.match(/\./g) || []).length > 1) return null
  } else if (dot >= 0 && /^-?\d{1,3}(?:\.\d{3}){2,}$/.test(text)) {
    text = text.replace(/\./g, "")
  }
  const value = Number(text) * factor * (negative ? -1 : 1)
  return Number.isFinite(value) ? value : null
}

export function detectCurrency(header: string, cells: string[]): MeasureStats["currency"] {
  const sample = `${header} ${cells.slice(0, 20).join(" ")}`
  if (/₸|тг|тенге|теңге|kzt/iu.test(sample)) return "KZT"
  if (/\$|usd|долл/iu.test(sample)) return "USD"
  if (/€|eur|евро/iu.test(sample)) return "EUR"
  if (/₽|rub|руб/iu.test(sample)) return "RUB"
  return null
}

/* ------------------------------------------------------------------ labels */

const MONTHS: Array<{ forms: string[]; ru: string; kk: string; en: string }> = [
  { forms: ["январь", "января", "янв", "january", "jan", "қаңтар", "қаң"], ru: "Январь", kk: "Қаңтар", en: "January" },
  { forms: ["февраль", "февраля", "фев", "февр", "february", "feb", "ақпан"], ru: "Февраль", kk: "Ақпан", en: "February" },
  { forms: ["март", "марта", "мар", "march", "mar", "наурыз"], ru: "Март", kk: "Наурыз", en: "March" },
  { forms: ["апрель", "апреля", "апр", "april", "apr", "сәуір"], ru: "Апрель", kk: "Сәуір", en: "April" },
  { forms: ["май", "мая", "may", "мамыр"], ru: "Май", kk: "Мамыр", en: "May" },
  { forms: ["июнь", "июня", "июн", "june", "jun", "маусым"], ru: "Июнь", kk: "Маусым", en: "June" },
  { forms: ["июль", "июля", "июл", "july", "jul", "шілде"], ru: "Июль", kk: "Шілде", en: "July" },
  { forms: ["август", "августа", "авг", "august", "aug", "тамыз"], ru: "Август", kk: "Тамыз", en: "August" },
  { forms: ["сентябрь", "сентября", "сен", "сент", "september", "sep", "sept", "қыркүйек"], ru: "Сентябрь", kk: "Қыркүйек", en: "September" },
  { forms: ["октябрь", "октября", "окт", "october", "oct", "қазан"], ru: "Октябрь", kk: "Қазан", en: "October" },
  { forms: ["ноябрь", "ноября", "ноя", "нояб", "november", "nov", "қараша"], ru: "Ноябрь", kk: "Қараша", en: "November" },
  { forms: ["декабрь", "декабря", "дек", "december", "dec", "желтоқсан"], ru: "Декабрь", kk: "Желтоқсан", en: "December" },
]

type TimeKey = { kind: "date" | "month" | "monthName" | "year" | "quarter" | "ordinal"; key: number }

function monthIndex(word: string) {
  const clean = word.trim().toLowerCase().replace(/\.$/, "")
  return MONTHS.findIndex((month) => month.forms.includes(clean))
}

/** A sortable key when the label is a point in time; null otherwise. */
export function timeKey(label: string): TimeKey | null {
  const text = String(label || "").trim()
  if (!text || text.length > 32) return null
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (match) return { kind: "date", key: Date.UTC(+match[1], +match[2] - 1, +match[3]) }
  match = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})$/)
  if (match) return { kind: "date", key: Date.UTC(+(match[3].length === 2 ? `20${match[3]}` : match[3]), +match[2] - 1, +match[1]) }
  const yearMonth = text.match(/^(\d{4})[-./](\d{1,2})$/)
  const monthYear = text.match(/^(\d{1,2})[-./](\d{4})$/)
  if (yearMonth || monthYear) {
    const year = Number(yearMonth ? yearMonth[1] : monthYear![2])
    const month = Number(yearMonth ? yearMonth[2] : monthYear![1])
    if (month >= 1 && month <= 12) return { kind: "month", key: year * 12 + month - 1 }
  }
  match = text.match(/^(\d{4})(?:\s*(?:г\.?|год|жыл))?$/iu)
  if (match && +match[1] >= 1900 && +match[1] <= 2100) return { kind: "year", key: +match[1] }
  const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 }
  const quarter = text.match(/^q([1-4])(?:\s*[-/ ]?\s*(\d{4}))?$/iu)
    || text.match(/^([1-4]|i{1,3}|iv)\s*(?:-?й\s*)?(?:кв\.?|квартал|тоқсан)(?:\s*(\d{4}))?(?:\s*г\.?)?$/iu)
  if (quarter) {
    const number = ROMAN[quarter[1].toLowerCase()] || Number(quarter[1])
    return { kind: "quarter", key: (quarter[2] ? +quarter[2] : 0) * 4 + number - 1 }
  }
  match = text.match(/^(\d{4})\s*[-/ ]?\s*q([1-4])$/iu)
  if (match) return { kind: "quarter", key: +match[1] * 4 + +match[2] - 1 }
  const words = text.split(/[\s.,/-]+/).filter(Boolean)
  const month = monthIndex(words[0] || "")
  if (month >= 0 && words.length <= 2) {
    const year = words[1] && /^\d{4}$/.test(words[1]) ? +words[1] : null
    return year === null ? { kind: "monthName", key: month } : { kind: "month", key: year * 12 + month }
  }
  match = text.match(/^(?:неделя|нед\.?|week|wk|день|day|апта|күн)\s*(\d{1,3})$/iu) || text.match(/^(\d{1,3})\s*(?:неделя|week|день|day)$/iu)
  if (match) return { kind: "ordinal", key: +match[1] }
  return null
}

function nextLabels(labels: string[], keys: TimeKey[] | null, locale: AnalysisLocale, count: number): string[] {
  const out: string[] = []
  const last = labels[labels.length - 1] || ""
  const lastKey = keys?.[keys.length - 1]
  for (let step = 1; step <= count; step += 1) {
    if (!lastKey) { out.push(`+${step}`); continue }
    if (lastKey.kind === "year") out.push(String(lastKey.key + step))
    else if (lastKey.kind === "monthName") {
      const name = MONTHS[(lastKey.key + step) % 12][locale]
      out.push(/^[a-zа-яё]/u.test(last) ? name.toLowerCase() : name)
    } else if (lastKey.kind === "month") {
      const total = lastKey.key + step
      const isoLike = /^\d{4}-\d{1,2}$/.test(last)
      out.push(isoLike ? `${Math.floor(total / 12)}-${String(total % 12 + 1).padStart(2, "0")}` : `${MONTHS[total % 12][locale].slice(0, 3)} ${Math.floor(total / 12)}`)
    } else if (lastKey.kind === "quarter") {
      const total = lastKey.key + step
      out.push(Math.floor(total / 4) ? `Q${total % 4 + 1} ${Math.floor(total / 4)}` : `Q${total % 4 + 1}`)
    } else if (lastKey.kind === "date" && keys && keys.length >= 2) {
      const gap = (keys[keys.length - 1].key - keys[0].key) / (keys.length - 1)
      const date = new Date(lastKey.key + gap * step)
      out.push(date.toISOString().slice(0, 10))
    } else if (lastKey.kind === "ordinal") {
      out.push(last.replace(/\d+/, String(lastKey.key + step)))
    } else out.push(`+${step}`)
  }
  return out
}

/* -------------------------------------------------------------- statistics */

function medianOf(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function pearson(x: number[], y: number[]) {
  const n = x.length
  if (n < 4) return null
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  if (!sxx || !syy) return null
  return sxy / Math.sqrt(sxx * syy)
}

/** Least squares over x = 0..n-1. */
export function linearTrend(values: number[]) {
  const n = values.length
  const mx = (n - 1) / 2
  const my = values.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, sst = 0
  values.forEach((value, x) => { sxy += (x - mx) * (value - my); sxx += (x - mx) ** 2; sst += (value - my) ** 2 })
  const slope = sxx ? sxy / sxx : 0
  const intercept = my - slope * mx
  const sse = values.reduce((total, value, x) => total + (value - (intercept + slope * x)) ** 2, 0)
  const r2 = sst ? Math.max(0, 1 - sse / sst) : 0
  return { slope, intercept, r2 }
}

export const round = (value: number, digits = 4) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/* ------------------------------------------------------------------- shape */

const INDEX_COLUMN = /^(?:№|#|n|no\.?|id|номер|код|code|п\/п|nn)$/iu
const MEAN_LIKE = /%|процент|доля|share|rate|ставк|цена|price|курс|средн|avg|average|mean|рейтинг|rating|температур|temperature|балл|score|возраст|age|маржа|margin|конверс|conversion/iu
const UNIT_IN_HEADER = /[,(]\s*([^,()]{1,16})\s*\)?\s*$/u

export type TableInput = { header: string[]; rows: string[][]; truncated?: boolean }

function columnUnit(header: string) {
  const match = header.match(UNIT_IN_HEADER)
  return match ? match[1].trim() : ""
}

/**
 * The analysis of one table. `focus` is the request text: a column it names
 * becomes the primary measure.
 */
export function analyzeTable(input: TableInput, options: { locale?: AnalysisLocale; focus?: string } = {}): DataAnalysis | null {
  const locale = options.locale || "ru"
  const header = input.header.map((cell, index) => String(cell || "").trim() || (index === 0 ? "" : `#${index + 1}`))
  const rows = input.rows.slice(0, ANALYSIS_LIMITS.rows).map((row) => header.map((_, index) => String(row[index] ?? "").trim()))
  if (rows.length < 2 || header.length < 1) return null

  type Column = { index: number; name: string; numbers: Array<number | null>; numericShare: number; texts: string[] }
  const columns: Column[] = header.map((name, index) => {
    const texts = rows.map((row) => row[index])
    const filled = texts.filter(Boolean)
    const numbers = texts.map((cell) => (cell ? parseNumber(cell, locale) : null))
    const numericShare = filled.length ? numbers.filter((value) => value !== null).length / filled.length : 0
    return { index, name, numbers, numericShare, texts }
  })

  const skippedColumns: string[] = []
  // The label column: dates or periods first, then the first text column.
  const timeShare = (column: Column) => {
    const filled = column.texts.filter(Boolean)
    return filled.length ? filled.filter((cell) => timeKey(cell)).length / filled.length : 0
  }
  const yearColumn = columns.find((column) => column.numericShare === 1 && column.texts.every((cell) => /^\d{4}$/.test(cell) && +cell >= 1900 && +cell <= 2100))
  let labelColumn = columns.find((column) => timeShare(column) >= 0.8 && column.numericShare < 1)
    || yearColumn
    || columns.find((column) => column.numericShare < 0.5 && column.texts.some(Boolean))
    || null
  const numeric = columns.filter((column) => column !== labelColumn && column.numericShare >= 0.8 && !INDEX_COLUMN.test(column.name))
  for (const column of columns) {
    if (column !== labelColumn && !numeric.includes(column)) skippedColumns.push(column.name)
  }
  if (!numeric.length) return null
  if (labelColumn && INDEX_COLUMN.test(labelColumn.name) && labelColumn.numericShare === 1) labelColumn = null

  // Primary measure first: the one the request names, otherwise table order.
  const focus = String(options.focus || "").toLowerCase()
  numeric.sort((a, b) => {
    const named = (column: Column) => column.name.toLowerCase().split(/[\s,()/_-]+/).some((word) => word.length >= 4 && focus.includes(word.slice(0, Math.max(4, word.length - 2))))
    return Number(named(b)) - Number(named(a)) || a.index - b.index
  })
  const measuresColumns = numeric.slice(0, ANALYSIS_LIMITS.measures)

  const rawLabels = rows.map((row, at) => (labelColumn ? row[labelColumn.index] || "—" : String(at + 1)))
  const keys = rawLabels.map(timeKey)
  const isTime = Boolean(labelColumn) && keys.filter(Boolean).length / rawLabels.length >= 0.8
  const axis: Axis = !labelColumn ? "index" : isTime ? "time" : "category"

  // Duplicate labels (long format) collapse into one value per label.
  const order: string[] = []
  const buckets = new Map<string, number[]>()
  rows.forEach((_, at) => {
    const label = rawLabels[at]
    if (!buckets.has(label)) { buckets.set(label, []); order.push(label) }
    buckets.get(label)!.push(at)
  })
  const aggregatedDuplicates = order.length < rows.length

  let labels = order
  if (axis === "time") {
    const sortable = labels.map((label) => ({ label, key: timeKey(label) }))
    const comparable = sortable.every((item) => item.key && item.key.kind === sortable[0].key?.kind && item.key.kind !== "monthName")
    if (comparable) labels = [...sortable].sort((a, b) => a.key!.key - b.key!.key).map((item) => item.label)
  }
  labels = labels.slice(0, ANALYSIS_LIMITS.labels)
  const labelKeys = axis === "time" ? labels.map(timeKey) as TimeKey[] : null

  const measures: MeasureStats[] = measuresColumns.map((column) => {
    const aggregation: Aggregation = MEAN_LIKE.test(column.name) ? "mean" : "sum"
    const percent = /%|процент|percent/iu.test(column.name) || column.texts.some((cell) => /%$/.test(cell))
    const series: Array<number | null> = labels.map((label) => {
      const values = buckets.get(label)!.map((at) => column.numbers[at]).filter((value): value is number => value !== null)
      if (!values.length) return null
      const total = values.reduce((a, b) => a + b, 0)
      return aggregation === "mean" ? total / values.length : total
    })
    const points = labels.map((label, at) => ({ label, value: series[at] })).filter((point): point is Point => point.value !== null)
    const values = points.map((point) => point.value)
    const sum = values.reduce((a, b) => a + b, 0)
    const mean = values.length ? sum / values.length : 0
    const std = values.length ? Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length) : 0
    const min = points.reduce((best, point) => (point.value < best.value ? point : best), points[0])
    const max = points.reduce((best, point) => (point.value > best.value ? point : best), points[0])
    const first = points[0]
    const last = points[points.length - 1]
    const change = last.value - first.value
    const changePct = first.value !== 0 ? (change / Math.abs(first.value)) * 100 : null

    const steps = labels.map((label, at) => {
      const value = series[at]
      const previous = at > 0 ? series[at - 1] : null
      const delta = value !== null && previous !== null && previous !== undefined ? value - previous : null
      const deltaPct = delta !== null && previous ? (delta / Math.abs(previous)) * 100 : null
      return { label, value, delta, deltaPct }
    })
    let biggestRise: MeasureStats["biggestRise"] = null
    let biggestDrop: MeasureStats["biggestDrop"] = null
    if (axis !== "category") {
      steps.forEach((step, at) => {
        if (step.delta === null || step.value === null) return
        const from = steps[at - 1]?.label || ""
        if (step.delta > 0 && (!biggestRise || step.delta > biggestRise.delta)) biggestRise = { label: step.label, value: step.value, delta: step.delta, from }
        if (step.delta < 0 && (!biggestDrop || step.delta < biggestDrop.delta)) biggestDrop = { label: step.label, value: step.value, delta: step.delta, from }
      })
    }

    let cagrPct: number | null = null
    let cagrYears: number | null = null
    const firstKey = labelKeys?.[labels.indexOf(first.label)]
    const lastKey = labelKeys?.[labels.indexOf(last.label)]
    if (axis === "time" && firstKey?.kind === "year" && lastKey?.kind === "year" && lastKey.key > firstKey.key && first.value > 0 && last.value > 0) {
      cagrYears = lastKey.key - firstKey.key
      cagrPct = ((last.value / first.value) ** (1 / cagrYears) - 1) * 100
    }

    const shares = axis === "category" && aggregation === "sum" && !percent && values.length >= 2 && values.every((value) => value >= 0) && sum > 0
      ? [...points].sort((a, b) => b.value - a.value).map((point) => ({ ...point, share: (point.value / sum) * 100 }))
      : null

    let trend: MeasureStats["trend"] = null
    if (axis === "time" && values.length >= 4 && values.length === labels.length) {
      const fit = linearTrend(values)
      const ahead = fit.r2 >= 0.3 ? 3 : 0
      const future = nextLabels(labels, labelKeys, locale, ahead)
      trend = {
        slope: fit.slope,
        intercept: fit.intercept,
        r2: fit.r2,
        forecast: future.map((label, step) => ({ label, value: fit.intercept + fit.slope * (values.length - 1 + step + 1) })),
      }
    }

    const anomalies: MeasureStats["anomalies"] = []
    if (values.length >= 6) {
      const center = medianOf(values)
      const mad = medianOf(values.map((value) => Math.abs(value - center)))
      if (mad > 0) {
        for (const point of points) {
          const score = (0.6745 * (point.value - center)) / mad
          if (Math.abs(score) > 3.5) anomalies.push({ ...point, score })
        }
      }
    }

    return {
      name: column.name,
      unit: columnUnit(column.name) || (percent ? "%" : ""),
      currency: detectCurrency(column.name, column.texts),
      percent,
      aggregation,
      count: values.length,
      missing: labels.length - values.length,
      sum, mean, median: medianOf(values), std, min, max, first, last, change, changePct, cagrPct, cagrYears,
      steps, biggestRise, biggestDrop, shares, trend, anomalies,
    }
  }).filter((measure) => measure.count >= 2)
  if (!measures.length) return null

  const correlations: DataAnalysis["correlations"] = []
  for (let a = 0; a < measures.length; a += 1) {
    for (let b = a + 1; b < measures.length; b += 1) {
      const x: number[] = [], y: number[] = []
      measures[a].steps.forEach((step, at) => {
        const other = measures[b].steps[at]?.value
        if (step.value !== null && other !== null && other !== undefined) { x.push(step.value); y.push(other) }
      })
      const r = pearson(x, y)
      if (r !== null) correlations.push({ a: measures[a].name, b: measures[b].name, r, n: x.length })
    }
  }
  correlations.sort((left, right) => Math.abs(right.r) - Math.abs(left.r))

  // A second text column (region, product, manager) in a time table: totals by it.
  let categoryTotals: DataAnalysis["categoryTotals"] = null
  const category = columns.find((column) => column !== labelColumn && column.numericShare < 0.5 && new Set(column.texts.filter(Boolean)).size >= 2 && new Set(column.texts.filter(Boolean)).size <= 40)
  const primary = measuresColumns.find((column) => column.name === measures[0].name)
  if (category && primary && measures[0].aggregation === "sum") {
    const totals = new Map<string, number>()
    rows.forEach((row, at) => {
      const value = primary.numbers[at]
      if (value === null) return
      const key = row[category.index] || "—"
      totals.set(key, (totals.get(key) || 0) + value)
    })
    const total = [...totals.values()].reduce((a, b) => a + b, 0)
    if (totals.size >= 2 && total > 0 && [...totals.values()].every((value) => value >= 0)) {
      categoryTotals = {
        by: category.name,
        measure: measures[0].name,
        rows: [...totals.entries()].map(([label, value]) => ({ label, value, share: (value / total) * 100 })).sort((a, b) => b.value - a.value),
      }
    }
  }

  return {
    rows: rows.length,
    columns: header.length,
    truncated: Boolean(input.truncated) || input.rows.length > ANALYSIS_LIMITS.rows,
    labelColumn: labelColumn?.name || null,
    axis,
    labels,
    measures,
    correlations: correlations.slice(0, 5),
    categoryTotals,
    aggregatedDuplicates,
    skippedColumns,
  }
}
