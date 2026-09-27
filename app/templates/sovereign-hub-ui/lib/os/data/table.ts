/**
 * Data analyst mode: a CSV or spreadsheet becomes a table, and the table
 * becomes numbers computed exactly — column types, counts, missing values,
 * min/max/mean/median, top categories, correlations and group totals.
 * The model only explains these numbers; it never computes them.
 */

export type Table = { header: string[]; rows: string[][]; truncated: boolean }

export const TABLE_LIMITS = { rows: 50_000, columns: 60, cellChars: 500 }

export function detectDelimiter(firstLine: string) {
  const candidates = [",", ";", "\t", "|"]
  let best = ","
  let bestCount = 0
  for (const candidate of candidates) {
    let count = 0
    let quoted = false
    for (const char of firstLine) {
      if (char === '"') quoted = !quoted
      else if (!quoted && char === candidate) count += 1
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/** RFC 4180 CSV with quotes, escaped quotes and newlines inside quotes. */
export function parseCsv(text: string, limits = TABLE_LIMITS): string[][] {
  const source = text.replace(/^﻿/, "")
  const delimiter = detectDelimiter(source.slice(0, source.indexOf("\n") >= 0 ? source.indexOf("\n") : 2_000))
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"' && cell === "") quoted = true
    else if (char === delimiter) {
      row.push(cell)
      cell = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1
      row.push(cell)
      cell = ""
      if (row.some((value) => value.trim() !== "")) rows.push(row.slice(0, limits.columns))
      row = []
      if (rows.length > limits.rows) break
    } else {
      cell += char
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    if (row.some((value) => value.trim() !== "")) rows.push(row.slice(0, limits.columns))
  }
  return rows
}

const NUMBER = /^[-+]?(?:\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,]\d+)?%?$/
const DATE = /^(?:\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?|\d{1,2}[./]\d{1,2}[./]\d{2,4})$/

export function toNumber(value: string): number | null {
  const text = String(value || "").trim().replace(/[₸$€₽£]/g, "").trim()
  if (!text || !NUMBER.test(text)) return null
  const normalized = text.replace(/[   ]/g, "").replace("%", "").replace(",", ".")
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function toDate(value: string): number | null {
  const text = String(value || "").trim()
  if (!DATE.test(text)) return null
  const dotted = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/)
  const time = dotted
    ? Date.UTC(Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]), Number(dotted[2]) - 1, Number(dotted[1]))
    : Date.parse(text)
  return Number.isFinite(time) ? time : null
}

export function toTable(rows: string[][]): Table {
  const clean = rows.map((row) => row.map((cell) => String(cell ?? "").trim().slice(0, TABLE_LIMITS.cellChars)))
  if (!clean.length) return { header: [], rows: [], truncated: false }
  const width = Math.min(TABLE_LIMITS.columns, Math.max(...clean.slice(0, 50).map((row) => row.length)))
  const first = clean[0]
  // A header row is mostly text while the rows under it are not.
  const firstNumeric = first.filter((cell) => toNumber(cell) !== null).length
  const hasHeader = firstNumeric <= Math.floor(width / 3) && first.some((cell) => cell !== "")
  const header = Array.from({ length: width }, (_, index) => (hasHeader && first[index] ? first[index] : `Столбец ${index + 1}`))
  const body = (hasHeader ? clean.slice(1) : clean).map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""))
  const truncated = body.length > TABLE_LIMITS.rows
  return { header, rows: body.slice(0, TABLE_LIMITS.rows), truncated }
}

export type ColumnProfile = {
  name: string
  type: "number" | "date" | "text" | "empty"
  filled: number
  missing: number
  unique: number
  min?: number
  max?: number
  mean?: number
  median?: number
  sum?: number
  std?: number
  firstDate?: string
  lastDate?: string
  top?: Array<{ value: string; count: number }>
}

export type TableProfile = {
  rows: number
  columns: number
  truncated: boolean
  profiles: ColumnProfile[]
  correlations: Array<{ a: string; b: string; r: number }>
  groups: Array<{ by: string; measure: string; rows: Array<{ key: string; sum: number; mean: number; count: number }> }>
}

const round = (value: number, digits = 4) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function median(sorted: number[]) {
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function pearson(x: number[], y: number[]) {
  const n = x.length
  if (n < 3) return null
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  if (!sxx || !syy) return null
  return sxy / Math.sqrt(sxx * syy)
}

export function profileTable(table: Table): TableProfile {
  const profiles: ColumnProfile[] = table.header.map((name, column) => {
    const values = table.rows.map((row) => row[column] ?? "")
    const filled = values.filter((value) => value !== "")
    const numbers = filled.map(toNumber)
    const dates = filled.map(toDate)
    const numericShare = filled.length ? numbers.filter((value) => value !== null).length / filled.length : 0
    const dateShare = filled.length ? dates.filter((value) => value !== null).length / filled.length : 0
    const base = { name, filled: filled.length, missing: values.length - filled.length, unique: new Set(filled).size }
    if (!filled.length) return { ...base, type: "empty" as const }
    if (numericShare >= 0.9) {
      const list = numbers.filter((value): value is number => value !== null)
      const sorted = [...list].sort((a, b) => a - b)
      const sum = list.reduce((a, b) => a + b, 0)
      const mean = sum / list.length
      const std = Math.sqrt(list.reduce((total, value) => total + (value - mean) ** 2, 0) / list.length)
      return { ...base, type: "number" as const, min: sorted[0], max: sorted[sorted.length - 1], mean: round(mean), median: round(median(sorted)), sum: round(sum), std: round(std) }
    }
    if (dateShare >= 0.9) {
      const list = dates.filter((value): value is number => value !== null).sort((a, b) => a - b)
      return { ...base, type: "date" as const, firstDate: new Date(list[0]).toISOString().slice(0, 10), lastDate: new Date(list[list.length - 1]).toISOString().slice(0, 10) }
    }
    const counts = new Map<string, number>()
    for (const value of filled) counts.set(value, (counts.get(value) || 0) + 1)
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value: value.slice(0, 80), count }))
    return { ...base, type: "text" as const, top }
  })

  const numeric = profiles.map((profile, index) => ({ profile, index })).filter(({ profile }) => profile.type === "number").slice(0, 12)
  const correlations: TableProfile["correlations"] = []
  for (let i = 0; i < numeric.length; i += 1) {
    for (let j = i + 1; j < numeric.length; j += 1) {
      const x: number[] = []
      const y: number[] = []
      for (const row of table.rows) {
        const a = toNumber(row[numeric[i].index])
        const b = toNumber(row[numeric[j].index])
        if (a !== null && b !== null) {
          x.push(a)
          y.push(b)
        }
      }
      const r = pearson(x, y)
      if (r !== null) correlations.push({ a: numeric[i].profile.name, b: numeric[j].profile.name, r: round(r, 3) })
    }
  }
  correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))

  const category = profiles
    .map((profile, index) => ({ profile, index }))
    .find(({ profile }) => profile.type === "text" && profile.unique >= 2 && profile.unique <= 40)
  const groups: TableProfile["groups"] = []
  if (category) {
    for (const { profile, index } of numeric.slice(0, 3)) {
      const buckets = new Map<string, { sum: number; count: number }>()
      for (const row of table.rows) {
        const key = row[category.index] || "—"
        const value = toNumber(row[index])
        if (value === null) continue
        const bucket = buckets.get(key) || { sum: 0, count: 0 }
        bucket.sum += value
        bucket.count += 1
        buckets.set(key, bucket)
      }
      groups.push({
        by: category.profile.name,
        measure: profile.name,
        rows: [...buckets.entries()]
          .map(([key, bucket]) => ({ key, sum: round(bucket.sum, 2), mean: round(bucket.sum / bucket.count, 2), count: bucket.count }))
          .sort((a, b) => b.sum - a.sum)
          .slice(0, 12),
      })
    }
  }

  return { rows: table.rows.length, columns: table.header.length, truncated: table.truncated, profiles, correlations: correlations.slice(0, 8), groups }
}

const format = (value: number | undefined) => (value === undefined ? "—" : Math.abs(value) >= 1000 ? value.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) : String(round(value, 3)))

/** The computed facts as Markdown tables: shown to the person and given to the model. */
export function profileMarkdown(profile: TableProfile) {
  const lines = [
    `**Строк:** ${profile.rows}${profile.truncated ? " (прочитаны первые)" : ""} · **столбцов:** ${profile.columns}`,
    "",
    "| Столбец | Тип | Заполнено | Пусто | Уникальных | Мин | Макс | Среднее | Медиана | Сумма |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...profile.profiles.map((column) => `| ${column.name.replace(/\|/g, "/")} | ${column.type} | ${column.filled} | ${column.missing} | ${column.unique} | ${format(column.min)} | ${format(column.max)} | ${format(column.mean)} | ${format(column.median)} | ${format(column.sum)} |`),
  ]
  const text = profile.profiles.filter((column) => column.top?.length)
  if (text.length) {
    lines.push("", "**Частые значения**", "")
    for (const column of text.slice(0, 6)) lines.push(`- ${column.name}: ${column.top!.map((item) => `${item.value} (${item.count})`).join(", ")}`)
  }
  if (profile.correlations.length) {
    lines.push("", "**Связи между числовыми столбцами (корреляция Пирсона)**", "")
    for (const pair of profile.correlations.slice(0, 5)) lines.push(`- ${pair.a} ↔ ${pair.b}: r = ${pair.r}`)
  }
  for (const group of profile.groups) {
    lines.push("", `**${group.measure} по «${group.by}»**`, "", "| Группа | Сумма | Среднее | Строк |", "|---|---|---|---|")
    for (const row of group.rows) lines.push(`| ${row.key.replace(/\|/g, "/")} | ${format(row.sum)} | ${format(row.mean)} | ${row.count} |`)
  }
  return lines.join("\n")
}

export function tableToCsv(table: Table, maxChars = 380_000) {
  const escape = (value: string) => (/[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const lines = [table.header.map(escape).join(",")]
  let size = lines[0].length
  let included = 0
  for (const row of table.rows) {
    const line = row.map(escape).join(",")
    if (size + line.length + 1 > maxChars) break
    lines.push(line)
    size += line.length + 1
    included += 1
  }
  return { csv: lines.join("\n"), includedRows: included }
}
