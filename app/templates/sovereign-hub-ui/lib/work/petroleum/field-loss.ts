import { convert, finite } from "./units"
import type { ProductionRow } from "./production"
import type { FieldTask, WellId } from "./field-schema"
import { npv, irr } from "./economics"

export const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
export const phaseRate = (row: ProductionRow, phase: FieldTask["phase"]) => phase === "gas" ? row.gas ?? null : row.oilKnown === false ? null : row.oil
export type Baseline = { valid: boolean; value: number | null; kind: string; reason: string; refs: string[]; start?: string; end?: string }
export function baselineFor(task: FieldTask, id: WellId, rows: ProductionRow[]): Baseline {
  const selected = task.baseline, current = rows.at(-1)!, prior = rows.slice(-(task.thresholds.window + 1), -1)
  if (!selected) return { valid: false, value: null, kind: "none", reason: "No production counterfactual supplied; KPI screening is not loss attribution", refs: [] }
  if (selected.kind === "supplied") {
    const index = selected.values.findIndex(v => v.wellId === id), item = selected.values[index]
    if (!item) return { valid: false, value: null, kind: selected.kind, reason: "Reference rate missing for this well", refs: [] }
    return { valid: true, value: convert(item.rate.value, item.rate.unit, task.phase === "gas" ? "scf/day" : "bbl/day", task.gasReference), kind: selected.kind, reason: `User-supplied engineering assumption: ${item.rationale}; source: ${item.source}; physical achievability unverified`, refs: [`input:baseline:${index}`, "method:baseline"] }
  }
  const refs = prior.map(r => `input:row:${r.sourceRow}`), values = prior.map(r => phaseRate(r, task.phase)), positive = values.every(v => v !== null && v > 0)
  let reason = "Historical median of prior samples; stable regime is an assumption, not physically validated"
  const middle = positive ? median(values as number[]) : null
  const gapped = rows.slice(-(task.thresholds.window + 1)).some((r, i, a) => i > 0 && r.day - a[i - 1].day > task.thresholds.maxGapDays)
  if (prior.length < selected.minSamples) reason = "Insufficient prior samples"
  else if (!positive || !middle) reason = "Zero/missing rate cannot establish a producing baseline"
  else if (current.day - prior[0].day > task.thresholds.maxSpanDays || gapped) reason = "Stale or gapped baseline"
  else if (Math.abs((values.at(-1)! as number) - (values[0] as number)) / (values[0] as number) > selected.maxDriftFraction) reason = "Drifting history; constant historical baseline rejected"
  else if ((Math.max(...values as number[]) - Math.min(...values as number[])) / middle > selected.maxSpreadFraction) reason = "Unstable historical spread; baseline rejected"
  else return { valid: true, value: middle, kind: selected.kind, reason, refs: [...refs, "method:baseline"], start: prior[0].date, end: prior.at(-1)!.date }
  return { valid: false, value: null, kind: selected.kind, reason, refs, start: prior[0]?.date, end: prior.at(-1)?.date }
}

export function intervalDays(date: string, interval: "day" | "month") {
  if (interval === "day") return 1
  if (!date.endsWith("-01")) throw new Error("MONTH_AVERAGE_REQUIRES_FIRST_DAY")
  const [year, month] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
export function lossesFor(task: FieldTask, id: WellId, row: ProductionRow, baseline: Baseline) {
  const rate = phaseRate(row, task.phase), unit = task.phase === "gas" ? "scf" : "bbl"
  const planIndex = task.plan.findIndex(p => p.wellId === id && p.date === row.date), plan = task.plan[planIndex]
  const plannedRate = plan ? convert(plan.rate.value, plan.rate.unit, `${unit}/day`, task.gasReference) : null
  const gapRate = baseline.valid && rate !== null ? Math.max(0, baseline.value! - rate) : null
  if (task.rateBasis === "snapshot") return { rateGap: gapRate, rateUnit: `${unit}/day`, observedVolume: null, baselineVolume: null, gapVolume: null, downtimeSupportedEstimate: null, unassignedGap: null, planGap: rate !== null && plannedRate !== null ? Math.max(0, plannedRate - rate) : null, planUnit: `${unit}/day`, volumeUnit: unit, periodDays: null, refs: ["method:production-gap", ...baseline.refs, `input:row:${row.sourceRow}`, ...(plan ? [`input:plan:${planIndex}`] : [])], limitation: "Snapshot rates do not establish volumes or monetary losses" }
  if (!task.interval) throw new Error("AVERAGING_INTERVAL_REQUIRED")
  const days = intervalDays(row.date, task.interval), hours = days * 24
  if (row.period !== undefined && Math.abs(row.period - hours) > 1e-8) throw new Error("DOWNTIME_PERIOD_NOT_CALENDAR_INTERVAL")
  if (task.rateBasis === "operating-average" && (row.period === undefined || row.downtime === undefined)) throw new Error("OPERATING_AVERAGE_REQUIRES_REGISTERED_DOWNTIME_AND_PERIOD")
  const producingDays = task.rateBasis === "operating-average" ? days - row.downtime! / 24 : days
  const observedVolume = rate === null ? null : finite(rate * producingDays, "observed volume")
  const baselineVolume = baseline.valid ? finite(baseline.value! * days, "baseline volume") : null
  const gapVolume = observedVolume !== null && baselineVolume !== null ? Math.max(0, baselineVolume - observedVolume) : null
  const downtimeSupportedEstimate = gapVolume === null || row.downtime === undefined ? null : Math.min(gapVolume, finite(baseline.value! * row.downtime / 24, "downtime estimate"))
  const unassignedGap = gapVolume === null ? null : gapVolume - (downtimeSupportedEstimate ?? 0)
  return { rateGap: gapVolume === null ? null : gapVolume / days, rateUnit: `${unit}/day`, observedVolume, baselineVolume, gapVolume, downtimeSupportedEstimate, unassignedGap, planGap: observedVolume !== null && plannedRate !== null ? Math.max(0, finite(plannedRate * days) - observedVolume) : null, planUnit: unit, volumeUnit: unit, periodDays: days, refs: ["method:production-gap", ...baseline.refs, `input:row:${row.sourceRow}`, ...(plan ? [`input:plan:${planIndex}`] : [])], limitation: "Downtime-supported volume is a counterfactual estimate, not proven causation; plan gap overlaps baseline gap and is never added" }
}
export type Losses = ReturnType<typeof lossesFor>
export function recoveryScenarios(task: FieldTask, row: ProductionRow, loss: Losses) {
  return task.scenarios.map((scenario, index) => {
    const refs = [`input:scenario:${index}`, "method:recovery-economics", ...loss.refs]
    if (scenario.priceVolumeUnit !== loss.volumeUnit) return { id:scenario.id,status:"missing-input" as const,reason:"Price/OPEX volume basis does not match the production phase; no conversion or pricing basis is guessed",refs }
    if (loss.rateGap === null) return { id: scenario.id, status: "missing-input" as const, reason: "No screened reference rate", refs }
    if (scenario.waterDisposalPerBbl > 0 && (task.phase !== "oil" || row.water === undefined || row.oil <= 0)) return { id: scenario.id, status: "missing-input" as const, reason: "Water disposal needs measured oil/water ratio; gas scenario cannot infer one", refs }
    const volume = finite(loss.rateGap * scenario.recoveryFraction * scenario.durationDays, "scenario volume")
    const waterVolume = scenario.waterDisposalPerBbl > 0 ? finite(volume * row.water! / row.oil) : 0
    const revenue = finite(volume * scenario.pricePerUnit), cost = finite(volume * scenario.variableCostPerUnit + waterVolume * scenario.waterDisposalPerBbl + scenario.fixedCost)
    const cashflows = [-scenario.capex, finite(revenue - cost, "cashflow", false)]
    const rate = Math.expm1(Math.log1p(scenario.annualDiscountRate) * scenario.durationDays / 365.25)
    const value = npv(cashflows, rate)
    return { id: scenario.id, status: "calculated" as const, volume, volumeUnit: loss.volumeUnit, waterVolume, revenue, cost, capex: scenario.capex, npv: value, currency: scenario.currency, durationDays: scenario.durationDays, cashflows, irr: irr(cashflows), periodDiscountRate: rate, refs, dataKind: "scenario" as const, assumptions: ["No guaranteed recovery; one end-horizon cashflow with initial CAPEX", "Constant gap rate and phase ratio over supplied horizon", "Pre-tax; excludes royalties, FX, inflation, abandonment, financing and operational feasibility"] }
  })
}
