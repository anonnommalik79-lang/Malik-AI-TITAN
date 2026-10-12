/**
 * Deterministic evaluation of a monthly/daily production table pasted into chat.
 * No invented gas standard, reservoir model, dates, forecasts, or field measurements.
 * The result is shared by Ling and MalikLLM MAX before model selection.
 */
import { createHash } from "node:crypto"
import { strictDate } from "./production"
import type { PetroleumReceipt } from "./engine"
import { petroleumReport, petroleumLanguage } from "./report"

type InlineRow = { period: string; oil: number; water: number; gas: number | null; waterCutPct: number | null; gor: number | null }
const HEADER_FIELDS = ["oil_rate_bbl_day", "water_rate_bbl_day", "gas_rate_scf_day"] as const
const valid = (n: string) => /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(n) && Number.isFinite(Number(n)) && Number(n) <= 1e12
const fail = (reason: string, inputHash: string): PetroleumReceipt => ({
  ok: false, version: "malik-petroleum-inline-1.0.0", inputHash,
  task: { op: "inline-production" }, error: "INLINE_TABLE_INVALID: " + reason,
  method: "No calculation: strict table validation failed", variables: "oil bbl/day, water bbl/day, gas scf/day",
  units: "bbl/day, scf/day, %, scf/bbl",
  assumptions: [], evidence: ["Missing Evidence"], humanReview: true,
  uncertainty: "Unvalidated or ambiguous inline input",
  limitations: ["No reservoir, equipment or safety action performed"],
})
export function analyzeInlinePetroleumTable(prompt: string): { receipt: PetroleumReceipt; content: string } | null {
  // Conservative detection: require an explicit, unit-bearing CSV header.
  const source = String(prompt || "")
  const lines = source.replace(/\r/g, "").split("\n")
  let headerAt = -1
  let positions: Record<string, number> = {}
  let width = 0
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim().replace(/^\uFEFF/, "")
    const columns = raw.split(",").map(s => s.trim().toLowerCase())
    if (!["месяц", "month", "date", "дата"].includes(columns[0])) continue
    const fields = columns.slice(1)
    if (!fields.includes("oil_rate_bbl_day") || !fields.includes("water_rate_bbl_day")) continue
    if (fields.some(f => !HEADER_FIELDS.includes(f as typeof HEADER_FIELDS[number]))) continue
    if (new Set(fields).size !== fields.length) continue
    headerAt = i
    width = columns.length
    positions = Object.fromEntries(fields.map((key, j) => [key, j + 1]))
    break
  }
  if (headerAt < 0) return null
  const rawRows: string[][] = []
  for (let i = headerAt + 1; i < lines.length && rawRows.length <= 200; i++) {
    const raw = lines[i].trim()
    if (!raw || raw.startsWith("```")) break
    if (!/^\d{4}-\d{2}(?:-\d{2})?\s*,/.test(raw)) {
      if (rawRows.length) break // user's instructions after the table are not table rows
      return null
    }
    rawRows.push(raw.split(",").map(s => s.trim()))
  }
  const inputHash = createHash("sha256").update(lines.slice(headerAt, headerAt + rawRows.length + 1).join("\n")).digest("hex")
  const rejected = (why: string) => {
    const receipt = fail(why, inputHash)
    return { receipt, content: petroleumReport(receipt, petroleumLanguage(prompt)) }
  }
  if (rawRows.length < 2 || rawRows.length > 200) return rejected("2..200 rows required")
  const rows: InlineRow[] = []
  const known = new Set<string>()
  let precision: "month" | "day" | null = null
  const gasColumn = positions.gas_rate_scf_day
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    if (row.length !== width) return rejected("Row " + (i + 1) + ": column count mismatch")
    const period = row[0]
    const mode = /^\d{4}-\d{2}$/.test(period) ? "month" : "day"
    const iso = mode === "month" ? period + "-01" : period
    if ((precision && precision !== mode) || !strictDate(iso) || known.has(period)) return rejected("Row " + (i + 1) + ": invalid, duplicated or mixed-precision period")
    if (rows.length && period <= rows.at(-1)!.period) return rejected("Dates must be strictly increasing")
    precision = mode
    known.add(period)
    const oilRaw = row[positions.oil_rate_bbl_day]
    const waterRaw = row[positions.water_rate_bbl_day]
    const gasRaw = gasColumn === undefined ? undefined : row[gasColumn]
    if (![oilRaw, waterRaw, gasRaw].filter((v): v is string => v !== undefined).every(valid)) return rejected("Row " + (i + 1) + ": nonnumeric/negative or oversized rate")
    const oil = Number(oilRaw), water = Number(waterRaw), gas = gasRaw === undefined ? null : Number(gasRaw)
    const waterCutPct = oil + water === 0 ? null : (water / (oil + water)) * 100
    const gor = oil === 0 || gas === null ? null : gas / oil
    rows.push({ period, oil, water, gas, waterCutPct, gor })
  }
  const first = rows[0], last = rows[rows.length - 1]
  const changePct = first.oil === 0 ? null : 100 * (last.oil - first.oil) / first.oil
  const gasReference = source.match(/(?:^|\n)\s*gasReference\s*[:=]\s*([^\n]+)/i)?.[1]?.trim().slice(0,80) || null
  const result = { periodPrecision: precision, rows, oilChangePct: changePct, oilDeclinePct: changePct === null ? null : -changePct, gasReference }
  const receipt: PetroleumReceipt = {
    ok: true, version: "malik-petroleum-inline-1.0.0", inputHash,
    task: { op: "inline-production", periodPrecision: precision, rowCount: rows.length, gasReference },
    result,
    method: "WC%=100*water/(oil+water); GOR=gas/oil; oil change%=100*(last-first)/first",
    variables: "Daily oil and water rate bbl/day; supplied gas rate scf/day. Monthly labels remain month-level dates.",
    units: "WC %, GOR scf/bbl, oil change %",
    assumptions: ["Pasted values are synthetic or user-reported; calibration and provenance not verified", "Rates are not cumulative volumes; no interpolated sampling dates or reservoir reserves", "No decline-model fit or production forecast performed"],
    evidence: ["Deterministic Calculation", "Missing Evidence"], humanReview: true,
    uncertainty: gasColumn === undefined ? "Gas rate not supplied; no GOR" : !gasReference ? "Gas reference temperature/pressure not stated; GOR is arithmetic on reported scf/day, not validated standard-condition equivalence" : "Gas reference is user declared and not independently verified",
    limitations: ["No field-control actions or operator certification", "Apparent trends do not establish physical causes"],
  }
  return { receipt, content: petroleumReport(receipt, petroleumLanguage(prompt)) }
}
