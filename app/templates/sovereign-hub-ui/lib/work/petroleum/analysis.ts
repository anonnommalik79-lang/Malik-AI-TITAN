import { BARREL_M3 } from "./units"
import {
  OIL_ANALYSES, OIL_ANALYSIS_ENGINE_VERSION, OIL_ANALYSIS_SCHEMA_VERSION,
  type OilAnalysisId, type OilEvidence, type OilModelFit, type OilModelId, type OilWellAnalysis,
  type PetroleumAnalysisRequest, type PetroleumAnalysisResult,
} from "./analysis-contract"

/**
 * Deterministic production analytics behind the visual oil report.
 *
 * Pure functions only (no I/O, no clock, no randomness), so the server and the
 * browser produce the same report from the same validated request. Rates are
 * the user's numbers in the declared units; nothing is interpolated, rounded
 * or guessed. Where an input is missing the metric is null and the report says
 * what is missing.
 */

export const FIELD_ID = "__field__"
/** Mean calendar month, used only where a month has no calendar date. */
export const DAYS_PER_MONTH = 365.25 / 12
const JUMP = 0.3
const STABLE_CV = 0.02

type Num = number | null
type Request = PetroleumAnalysisRequest
type Granularity = Request["dataset"]["granularity"]
type Context = {
  granularity: Granularity
  calendar: boolean
  forecastPeriods: number
  gorFactor: number
  hasWater: boolean
  hasGas: boolean
  price: Request["parameters"]["price"]
  priceFactor: number | null
}

const isNum = (value: Num | undefined): value is number => typeof value === "number" && Number.isFinite(value)
const relative = (from: Num, to: Num): Num => isNum(from) && isNum(to) && from !== 0 ? (to - from) / from : null

/** Two 32-bit multiplicative hashes, 16 hex digits. Identifies a request; not a security hash. */
export function requestFingerprint(text: string): string {
  let first = 0x811c9dc5, second = 0x050c5d1f
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x5bd1e995) ^ (second >>> 15)
  }
  return (first >>> 0).toString(16).padStart(8, "0") + (second >>> 0).toString(16).padStart(8, "0")
}

/** t is year*12 + (month-1) for calendar months. */
export function monthOf(t: number) { return { year: Math.floor(t / 12), month: ((t % 12) + 12) % 12 } }
export function daysInMonthT(t: number) {
  const { year, month } = monthOf(t)
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function ols(x: number[], y: number[]) {
  const n = x.length
  if (n < 2) return null
  let mx = 0, my = 0
  for (let index = 0; index < n; index++) { mx += x[index]; my += y[index] }
  mx /= n; my /= n
  let sxx = 0, sxy = 0
  for (let index = 0; index < n; index++) { sxx += (x[index] - mx) ** 2; sxy += (x[index] - mx) * (y[index] - my) }
  if (sxx === 0) return null
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

function goodness(actual: number[], predicted: number[]) {
  const n = actual.length
  const mean = actual.reduce((sum, value) => sum + value, 0) / n
  let residual = 0, total = 0
  for (let index = 0; index < n; index++) { residual += (actual[index] - predicted[index]) ** 2; total += (actual[index] - mean) ** 2 }
  return { rmse: Math.sqrt(residual / n), r2: total > 0 ? 1 - residual / total : null }
}

export function predictModel(fit: OilModelFit, tau: number): Num {
  if (!fit.valid) return null
  if (fit.model === "linear") return isNum(fit.a) && isNum(fit.b) ? fit.a + fit.b * tau : null
  if (!isNum(fit.qi) || !isNum(fit.D)) return null
  return fit.model === "exponential" ? fit.qi * Math.exp(-fit.D * tau) : fit.qi / (1 + fit.D * tau)
}

/** Linear, exponential (Arps b=0) and harmonic (Arps b=1) fitted by least squares on their linear forms. */
export function fitDeclineModels(tau: number[], rate: number[]): OilModelFit[] {
  const empty = (model: OilModelId, reason: string): OilModelFit => ({ model, valid: false, reason, a: null, b: null, qi: null, D: null, r2: null, rmse: null, n: tau.length })
  if (tau.length < 3) return (["linear", "exponential", "harmonic"] as const).map((model) => empty(model, "TOO_FEW_POINTS"))
  const fits: OilModelFit[] = []
  const linear = ols(tau, rate)
  if (!linear) fits.push(empty("linear", "NO_TIME_SPREAD"))
  else {
    const fit: OilModelFit = { model: "linear", valid: linear.slope < 0, reason: linear.slope < 0 ? undefined : "NOT_DECLINING", a: linear.intercept, b: linear.slope, qi: null, D: null, r2: null, rmse: null, n: tau.length }
    Object.assign(fit, goodness(rate, tau.map((value) => linear.intercept + linear.slope * value)))
    fits.push(fit)
  }
  const positive = rate.every((value) => value > 0)
  const exponential = positive ? ols(tau, rate.map(Math.log)) : null
  if (!positive) fits.push(empty("exponential", "ZERO_RATES"))
  else if (!exponential) fits.push(empty("exponential", "NO_TIME_SPREAD"))
  else {
    const qi = Math.exp(exponential.intercept), D = -exponential.slope
    const fit: OilModelFit = { model: "exponential", valid: D > 0, reason: D > 0 ? undefined : "NOT_DECLINING", a: null, b: null, qi, D, r2: null, rmse: null, n: tau.length }
    Object.assign(fit, goodness(rate, tau.map((value) => qi * Math.exp(-D * value))))
    fits.push(fit)
  }
  const harmonic = positive ? ols(tau, rate.map((value) => 1 / value)) : null
  if (!positive) fits.push(empty("harmonic", "ZERO_RATES"))
  else if (!harmonic) fits.push(empty("harmonic", "NO_TIME_SPREAD"))
  else if (!(harmonic.intercept > 0) || !(harmonic.slope > 0)) fits.push({ ...empty("harmonic", "NOT_DECLINING") })
  else {
    const qi = 1 / harmonic.intercept, D = harmonic.slope / harmonic.intercept
    const fit: OilModelFit = { model: "harmonic", valid: true, a: null, b: null, qi, D, r2: null, rmse: null, n: tau.length }
    Object.assign(fit, goodness(rate, tau.map((value) => qi / (1 + D * value))))
    fits.push(fit)
  }
  return fits
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function periodsPerYear(granularity: Granularity) { return granularity === "month" ? 12 : granularity === "day" ? 365.25 : null }

function stepOf(t: number[], granularity: Granularity) {
  if (granularity !== "day" || t.length < 2) return 1
  return Math.max(1, Math.round(median(t.slice(1).map((value, index) => value - t[index]))))
}

/** Days a rate stands for, when the calendar says so: a calendar month, or one day of consecutive daily data. */
function periodDays(t: number[], context: Context): number[] | null {
  if (!context.calendar) return null
  if (context.granularity === "month") return t.map(daysInMonthT)
  if (context.granularity === "day" && t.every((value, index) => index === 0 || value - t[index - 1] === 1)) return t.map(() => 1)
  return null
}

const WATER_HYPOTHESES = ["WATER_CONING", "WATER_CHANNELING", "INJECTION_BREAKTHROUGH", "BEHIND_CASING_FLOW", "COMPLETION_LEAK", "AQUIFER_ENCROACHMENT", "MEASUREMENT_ALLOCATION"]
const WATER_MEASUREMENTS = ["WATER_CHEMISTRY", "PLT", "RESERVOIR_PRESSURE", "WELL_TEST", "CEMENT_LOG", "OFFSET_INJECTION", "TEST_SEPARATOR"]
const GAS_HYPOTHESES = ["BELOW_BUBBLE_POINT", "GAS_CAP_CONING", "GAS_MEASUREMENT"]
const GAS_MEASUREMENTS = ["PVT_BUBBLE_POINT", "RESERVOIR_PRESSURE", "GAS_METER"]
const PRODUCTIVITY_HYPOTHESES = ["RESERVOIR_DEPLETION", "SKIN_DAMAGE", "LIFT_PERFORMANCE"]
const PRODUCTIVITY_MEASUREMENTS = ["WELL_TEST", "BOTTOMHOLE_PRESSURE", "LIFT_DIAGNOSTICS"]

function analyzeSeries(id: string, input: { t: number[]; period: string[]; oil: number[]; water: Num[]; gas: Num[] }, context: Context, wellsInField = 0): OilWellAnalysis {
  const { t, period, oil, water, gas } = input
  const n = t.length
  const liquid = oil.map((value, index) => isNum(water[index]) ? value + (water[index] as number) : null)
  const wc = liquid.map((value, index) => isNum(value) && value > 0 ? (water[index] as number) / value : null)
  const gor = gas.map((value, index) => isNum(value) && oil[index] > 0 ? value / (oil[index] * context.gorFactor) : null)
  const wor = water.map((value, index) => isNum(value) && oil[index] > 0 ? value / oil[index] : null)
  const worDerivative = wor.map((value, index) => index > 0 && isNum(value) && isNum(wor[index - 1]) ? (value - (wor[index - 1] as number)) / (t[index] - t[index - 1]) : null)
  const at = (index: number) => ({ oil: oil[index], water: water[index], gas: gas[index], liquid: liquid[index], wc: wc[index], gor: gor[index], wor: wor[index] })
  const first = at(0), last = at(n - 1)
  const change: Record<string, Num> = {
    oil: relative(first.oil, last.oil), water: relative(first.water, last.water), gas: relative(first.gas, last.gas), liquid: relative(first.liquid, last.liquid),
    wcPP: isNum(first.wc) && isNum(last.wc) ? (last.wc - first.wc) * 100 : null,
    gorRel: relative(first.gor, last.gor),
    worAbs: isNum(first.wor) && isNum(last.wor) ? last.wor - first.wor : null,
    oilAbs: last.oil - first.oil,
  }
  const elapsed = t[n - 1] - t[0]

  const liquids = liquid.filter(isNum)
  let liquidStats: OilWellAnalysis["liquidStats"] = null
  if (n >= 2 && liquids.length === n) {
    const mean = liquids.reduce((sum, value) => sum + value, 0) / n
    const std = Math.sqrt(liquids.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n)
    const cv = mean > 0 ? std / mean : null
    liquidStats = { mean, std, cv, stable: isNum(cv) && cv <= STABLE_CV }
  }
  const balance: OilWellAnalysis["balance"] = n >= 2 && isNum(first.water) && isNum(last.water) && isNum(first.liquid) && isNum(last.liquid) ? {
    deltaOil: last.oil - first.oil,
    deltaWater: last.water - first.water,
    deltaLiquid: last.liquid - first.liquid,
    replacement: last.oil < first.oil ? (last.water - first.water) / (first.oil - last.oil) : null,
    liquidConserved: first.liquid > 0 && Math.abs(last.liquid - first.liquid) <= 0.01 * first.liquid,
  } : null

  const perYear = periodsPerYear(context.granularity)
  const perPeriod = n >= 2 && elapsed > 0 && first.oil > 0 && last.oil > 0 ? 1 - (last.oil / first.oil) ** (1 / elapsed) : null
  const decline = {
    total: first.oil > 0 && n >= 2 ? (first.oil - last.oil) / first.oil : null,
    perPeriod,
    effectiveAnnual: isNum(perPeriod) && perYear ? 1 - (1 - perPeriod) ** perYear : null,
    declining: n >= 2 && last.oil < first.oil,
  }

  const tau = t.map((value) => value - t[0])
  const models = fitDeclineModels(tau, oil)
  const valid = models.filter((fit) => fit.valid && isNum(fit.rmse))
  const preference: OilModelId[] = ["exponential", "harmonic", "linear"]
  valid.sort((left, right) => {
    const scale = Math.max(1e-12, Math.abs(left.rmse as number), Math.abs(right.rmse as number))
    const difference = (left.rmse as number) - (right.rmse as number)
    return Math.abs(difference) <= 1e-9 * scale ? preference.indexOf(left.model) - preference.indexOf(right.model) : difference
  })
  const selected = valid[0]?.model ?? null

  let forecast: OilWellAnalysis["forecast"] = null
  let forecastBlocked: string | null = null
  if (context.forecastPeriods === 0) forecastBlocked = "NO_HORIZON"
  else if (n < 4) forecastBlocked = "TOO_FEW_POINTS"
  else if (!valid.length) forecastBlocked = models.some((fit) => fit.reason === "ZERO_RATES") && !models.some((fit) => fit.valid) ? "ZERO_RATES" : "NO_DECLINING_TREND"
  else {
    const step = stepOf(t, context.granularity)
    const future = Array.from({ length: context.forecastPeriods }, (_, index) => t[n - 1] + (index + 1) * step)
    const byModel = (model: OilModelId) => {
      const fit = models.find((item) => item.model === model)
      return future.map((value) => fit && fit.valid ? predictModel(fit, value - t[0]) : null)
    }
    const rawLinear = byModel("linear")
    const linearFit = models.find((item) => item.model === "linear")
    forecast = {
      t: future,
      linear: rawLinear.map((value) => isNum(value) ? Math.max(0, value) : null),
      exponential: byModel("exponential"),
      harmonic: byModel("harmonic"),
      linearClamped: rawLinear.some((value) => isNum(value) && value <= 0),
      linearZeroT: linearFit?.valid && isNum(linearFit.a) && isNum(linearFit.b) && linearFit.b < 0 ? t[0] + -linearFit.a / linearFit.b : null,
    }
  }

  const periodChanges = t.slice(1).map((value, offset) => {
    const index = offset + 1
    return {
      t: value,
      oil: relative(oil[index - 1], oil[index]),
      water: relative(water[index - 1], water[index]),
      gas: relative(gas[index - 1], gas[index]),
      liquid: relative(liquid[index - 1], liquid[index]),
      wcPP: isNum(wc[index]) && isNum(wc[index - 1]) ? ((wc[index] as number) - (wc[index - 1] as number)) * 100 : null,
      gorRel: relative(gor[index - 1], gor[index]),
    }
  })

  const anomalies: OilWellAnalysis["anomalies"] = []
  const step = stepOf(t, context.granularity)
  for (let index = 0; index < n; index++) {
    if (oil[index] === 0) anomalies.push({ code: "ZERO_OIL", t: t[index], value: 0 })
    if (index === 0) continue
    const changeAt = periodChanges[index - 1]
    const gap = t[index] - t[index - 1]
    if (context.granularity === "day" ? gap > 1.5 * step : gap > 1) anomalies.push({ code: "GAP", t: t[index], value: context.granularity === "day" ? gap : gap - 1 })
    if (isNum(changeAt.oil) && Math.abs(changeAt.oil) >= JUMP) anomalies.push({ code: "OIL_JUMP", t: t[index], value: changeAt.oil })
    if (isNum(changeAt.liquid) && Math.abs(changeAt.liquid) >= JUMP) anomalies.push({ code: "LIQUID_JUMP", t: t[index], value: changeAt.liquid })
    if (isNum(changeAt.gorRel) && Math.abs(changeAt.gorRel) >= JUMP) anomalies.push({ code: "GOR_JUMP", t: t[index], value: changeAt.gorRel })
    if (isNum(changeAt.wcPP) && Math.abs(changeAt.wcPP) >= 10) anomalies.push({ code: "WC_JUMP", t: t[index], value: changeAt.wcPP })
  }
  const best = valid[0]
  if (best && n >= 6) {
    const residuals = tau.map((value, index) => oil[index] - (predictModel(best, value) as number))
    const center = median(residuals)
    const mad = median(residuals.map((value) => Math.abs(value - center)))
    if (mad > 1e-9 * Math.max(1, Math.abs(center))) residuals.forEach((value, index) => {
      const z = 0.6745 * (value - center) / mad
      if (Math.abs(z) > 3.5) anomalies.push({ code: "RESIDUAL_OUTLIER", t: t[index], value: z })
    })
  }

  const days = periodDays(t, context)
  const cumulative: OilWellAnalysis["cumulative"] = days ? {
    oil: oil.reduce((sum, value, index) => sum + value * days[index], 0),
    water: water.every(isNum) ? (water as number[]).reduce((sum, value, index) => sum + value * days[index], 0) : null,
    gas: gas.every(isNum) ? (gas as number[]).reduce((sum, value, index) => sum + value * days[index], 0) : null,
    days: days.reduce((sum, value) => sum + value, 0),
    basis: context.granularity === "month" ? "calendar-month" : "daily",
  } : null

  let economics: OilWellAnalysis["economics"] = null
  if (context.price && isNum(context.priceFactor) && n >= 1) {
    const unitValue = context.price.value * context.priceFactor
    const dailyGap = (first.oil - last.oil) * unitValue
    const forecastDays = forecast && context.calendar ? (context.granularity === "month" ? forecast.t.map(daysInMonthT) : forecast.t.map(() => stepOf(t, context.granularity))) : null
    const revenue = (values: Num[]) => forecastDays && values.every(isNum) ? (values as number[]).reduce((sum, value, index) => sum + value * forecastDays[index] * unitValue, 0) : null
    economics = {
      dailyGap,
      monthGap: dailyGap * DAYS_PER_MONTH,
      historicalGap: days ? oil.reduce((sum, value, index) => sum + (first.oil - value) * days[index] * unitValue, 0) : null,
      forecastRevenue: forecast && forecastDays ? { linear: revenue(forecast.linear), exponential: revenue(forecast.exponential), harmonic: revenue(forecast.harmonic) } : null,
    }
  }

  const hypotheses = { water: [] as string[], gas: [] as string[], productivity: [] as string[], measurements: [] as string[] }
  if (isNum(change.wcPP) && change.wcPP >= 5) { hypotheses.water = WATER_HYPOTHESES; hypotheses.measurements.push(...WATER_MEASUREMENTS) }
  if (isNum(change.gorRel) && change.gorRel >= 0.1) { hypotheses.gas = GAS_HYPOTHESES; hypotheses.measurements.push(...GAS_MEASUREMENTS) }
  if (isNum(decline.total) && decline.total >= 0.1 && (!isNum(change.liquid) || change.liquid <= -0.05)) { hypotheses.productivity = PRODUCTIVITY_HYPOTHESES; hypotheses.measurements.push(...PRODUCTIVITY_MEASUREMENTS) }
  hypotheses.measurements = [...new Set(hypotheses.measurements)]

  let chan: OilWellAnalysis["chan"] = null
  if (n >= 4 && wor.every((value) => isNum(value) && value > 0)) {
    const loglog = ols(tau.map((value) => Math.log(value + 1)), (wor as number[]).map(Math.log))
    const derivative = worDerivative.slice(1) as Num[]
    const trend = derivative.every(isNum) ? ols(t.slice(1), derivative as number[]) : null
    const scale = Math.max(1e-12, ...derivative.filter(isNum).map(Math.abs))
    chan = {
      slope: loglog ? loglog.slope : null,
      derivativeTrend: trend ? (Math.abs(trend.slope) <= 1e-9 * scale ? "flat" : trend.slope > 0 ? "rising" : "falling") : null,
    }
  }

  return {
    id, isField: id === FIELD_ID, wellsInField,
    t: [...t], period: [...period], oil: [...oil], water: [...water], gas: [...gas],
    liquid, wc, gor, wor, worDerivative,
    first: { ...first }, last: { ...last }, change, elapsed,
    liquidStats, balance, decline, models, selected, forecast, forecastBlocked,
    periodChanges, anomalies, cumulative, economics, hypotheses, chan,
  }
}

/** Sums the wells over the periods every well reports; partial periods are left out and flagged. */
function fieldSeries(wells: Request["dataset"]["wells"]) {
  const shared = wells.map((well) => new Set(well.t)).reduce((left, right) => new Set([...left].filter((value) => right.has(value))))
  const t = [...shared].sort((a, b) => a - b)
  const union = new Set(wells.flatMap((well) => well.t))
  const pick = (well: Request["dataset"]["wells"][number], value: number) => well.t.indexOf(value)
  const sum = (key: "water" | "gas") => t.map((value) => {
    let total = 0
    for (const well of wells) {
      const column = well[key]
      const entry = column ? column[pick(well, value)] : null
      if (!isNum(entry)) return null
      total += entry
    }
    return total
  })
  const reference = wells[0]
  return {
    t,
    period: t.map((value) => {
      const index = pick(reference, value)
      return index >= 0 ? reference.period[index] : String(value)
    }),
    oil: t.map((value) => wells.reduce((total, well) => total + well.oil[pick(well, value)], 0)),
    water: sum("water"),
    gas: sum("gas"),
    excluded: union.size - t.length,
  }
}

function priceFactor(request: Request): number | null {
  const price = request.parameters.price
  if (!price) return null
  const unit = request.units.liquid, density = request.units.oilDensityKgM3
  const toM3 = unit === "m3/day" ? 1 : unit === "bbl/day" ? BARREL_M3 : density ? 1000 / density : null
  if (price.per === "t") return unit === "t/day" ? 1 : density ? (toM3 as number) * density / 1000 : null
  if (toM3 === null) return null
  return price.per === "m3" ? toM3 : toM3 / BARREL_M3
}

function gorSetup(request: Request) {
  const { liquid, gas } = request.units
  if (!gas) return { factor: 1, unit: null }
  if (liquid === "t/day") return { factor: 1, unit: gas === "scf/day" ? "scf/t" : "sm3/t" }
  if (gas === "scf/day") return { factor: liquid === "bbl/day" ? 1 : 1 / BARREL_M3, unit: "scf/bbl" }
  return { factor: liquid === "m3/day" ? 1 : BARREL_M3, unit: "sm3/m3" }
}

type Metric = PetroleumAnalysisResult["calculatedMetrics"][number]

function wellMetrics(well: OilWellAnalysis, units: { liquid: string; gas: string | null; gor: string | null }, price: Request["parameters"]["price"]): Metric[] {
  const out: Metric[] = []
  const add = (id: string, value: Num | undefined, unit: string, evidence: OilEvidence = "Deterministic Calculation") => out.push({ id, well: well.id, value: isNum(value) ? value : null, unit, evidence })
  add("oil_first", well.first.oil, units.liquid); add("oil_last", well.last.oil, units.liquid); add("oil_change", well.change.oil, "fraction"); add("oil_change_abs", well.change.oilAbs, units.liquid)
  add("water_first", well.first.water, units.liquid); add("water_last", well.last.water, units.liquid); add("water_change", well.change.water, "fraction")
  add("liquid_first", well.first.liquid, units.liquid); add("liquid_last", well.last.liquid, units.liquid); add("liquid_change", well.change.liquid, "fraction")
  add("liquid_mean", well.liquidStats?.mean, units.liquid); add("liquid_cv", well.liquidStats?.cv, "fraction")
  add("wc_first", well.first.wc, "fraction"); add("wc_last", well.last.wc, "fraction"); add("wc_change_pp", well.change.wcPP, "pp")
  add("wor_first", well.first.wor, "ratio"); add("wor_last", well.last.wor, "ratio")
  if (units.gas) {
    add("gas_first", well.first.gas, units.gas); add("gas_last", well.last.gas, units.gas); add("gas_change", well.change.gas, "fraction")
    add("gor_first", well.first.gor, units.gor || ""); add("gor_last", well.last.gor, units.gor || ""); add("gor_change", well.change.gorRel, "fraction")
  }
  add("decline_total", well.decline.total, "fraction"); add("decline_per_period", well.decline.perPeriod, "fraction/period"); add("decline_effective_annual", well.decline.effectiveAnnual, "fraction/year")
  for (const fit of well.models) {
    const prefix = `model_${fit.model}`
    if (fit.model === "linear") { add(`${prefix}_a`, fit.a, units.liquid, "Statistical Estimate"); add(`${prefix}_b`, fit.b, `${units.liquid}/period`, "Statistical Estimate") }
    else { add(`${prefix}_qi`, fit.qi, units.liquid, "Statistical Estimate"); add(`${prefix}_D`, fit.D, "1/period", "Statistical Estimate") }
    add(`${prefix}_r2`, fit.r2, "", "Statistical Estimate"); add(`${prefix}_rmse`, fit.rmse, units.liquid, "Statistical Estimate")
  }
  well.forecast?.t.forEach((_, index) => {
    for (const model of ["linear", "exponential", "harmonic"] as const) add(`forecast_${model}_${index + 1}`, well.forecast?.[model][index], units.liquid, "Statistical Estimate")
  })
  if (well.cumulative) {
    add("cum_oil", well.cumulative.oil, units.liquid.replace("/day", ""), "Engineering Assumption")
    add("cum_water", well.cumulative.water, units.liquid.replace("/day", ""), "Engineering Assumption")
    if (units.gas) add("cum_gas", well.cumulative.gas, units.gas.replace("/day", ""), "Engineering Assumption")
  }
  if (well.economics && price) {
    add("revenue_gap_daily", well.economics.dailyGap, `${price.currency}/day`, "Engineering Assumption")
    add("revenue_gap_month", well.economics.monthGap, `${price.currency}/month`, "Engineering Assumption")
    add("revenue_gap_history", well.economics.historicalGap, price.currency, "Engineering Assumption")
  }
  return out
}

/** The analysis. Throws only on a request that does not match the contract. */
export function analyzePetroleumDataset(request: Request): PetroleumAnalysisResult {
  const { dataset, units, parameters, metadata } = request
  const gor = gorSetup(request)
  const hasWater = dataset.wells.some((well) => well.water !== null)
  const hasGas = units.gas !== null && dataset.wells.some((well) => well.gas !== null)
  const context: Context = {
    granularity: dataset.granularity, calendar: dataset.calendar, forecastPeriods: parameters.forecastPeriods,
    gorFactor: gor.factor, hasWater, hasGas, price: parameters.price, priceFactor: priceFactor(request),
  }
  const fill = (values: Num[] | null, length: number): Num[] => values ? values : Array.from({ length }, () => null)
  const analyses: OilWellAnalysis[] = dataset.wells.map((well) => analyzeSeries(well.id, {
    t: well.t, period: well.period, oil: well.oil, water: fill(well.water, well.t.length), gas: hasGas ? fill(well.gas, well.t.length) : fill(null, well.t.length),
  }, context))
  const qualityFlags: PetroleumAnalysisResult["qualityFlags"] = []
  const flag = (code: string, severity: "info" | "warning" | "critical", extra: { well?: string | null; t?: number | null; row?: number | null; column?: string | null } = {}) =>
    qualityFlags.push({ code, severity, well: extra.well ?? null, t: extra.t ?? null, row: extra.row ?? null, column: extra.column ?? null })

  let field: OilWellAnalysis | null = null
  if (dataset.wells.length > 1) {
    const aggregate = fieldSeries(dataset.wells)
    if (aggregate.t.length) field = analyzeSeries(FIELD_ID, { ...aggregate, gas: hasGas ? aggregate.gas : aggregate.gas.map(() => null) }, context, dataset.wells.length)
    if (aggregate.excluded > 0) flag("FIELD_PARTIAL_PERIODS", "warning", { well: FIELD_ID, row: aggregate.excluded })
    if (!aggregate.t.length) flag("FIELD_NO_SHARED_PERIODS", "warning", { well: FIELD_ID })
  }
  const wells = field ? [field, ...analyses] : analyses
  const primary = wells[0]

  for (const item of metadata.issues) flag(item.code, "warning", { row: item.row, column: item.column ?? null })
  if (metadata.rejectedRows > 0) flag("ROWS_REJECTED", "warning", { row: metadata.rejectedRows })
  for (const note of metadata.notes) flag(note, "info")
  if (metadata.omittedWells > 0) flag("WELLS_OMITTED", "warning", { row: metadata.omittedWells })
  if (metadata.dataKind === "synthetic") flag("SYNTHETIC_DATA", "info")
  if (hasGas && !units.gasReference) flag("GAS_REFERENCE_NOT_STATED", "info")
  if (units.liquid === "t/day") flag("MASS_BASIS", "info")
  if (!hasWater) flag("NO_WATER_COLUMN", "info")
  if (!hasGas) flag("NO_GAS_COLUMN", "info")
  for (const well of wells) {
    const id = well.id
    if (well.t.length < 6 && well.t.length >= 3) flag("LOW_SAMPLE", "warning", { well: id })
    const best = well.models.find((fit) => fit.model === well.selected)
    if (best && isNum(best.r2) && best.r2 < 0.8) flag("WEAK_FIT", "warning", { well: id })
    if (well.forecast?.linearClamped) flag("LINEAR_REACHES_ZERO", "warning", { well: id, t: well.forecast.linearZeroT })
    for (const anomaly of well.anomalies) flag(anomaly.code, anomaly.code === "GAP" || anomaly.code === "RESIDUAL_OUTLIER" || anomaly.code === "ZERO_OIL" ? "warning" : "info", { well: id, t: anomaly.t })
    if (well.cumulative && well.anomalies.some((anomaly) => anomaly.code === "GAP")) flag("CUMULATIVE_WITH_GAPS", "warning", { well: id })
  }
  if (parameters.price && context.priceFactor === null) flag("PRICE_UNIT_NEEDS_DENSITY", "warning")

  const requested = new Set<OilAnalysisId>(request.requestedAnalyses)
  const status = (id: OilAnalysisId): PetroleumAnalysisResult["analysisSections"][number] => {
    const section = (state: "computed" | "insufficient-data" | "not-applicable", reason: string | null = null) => ({ id, status: state, reason })
    if (!requested.has(id)) return section("not-applicable", "NOT_REQUESTED")
    switch (id) {
      case "water-cut": case "wor": case "liquid": case "water-oil-balance": return hasWater ? section("computed") : section("insufficient-data", "NO_WATER_DATA")
      case "gor": case "gas": return hasGas ? section("computed") : section("insufficient-data", "NO_GAS_DATA")
      case "forecast": return primary.forecast ? section("computed") : section("insufficient-data", primary.forecastBlocked)
      case "oil-decline": case "period-changes": return primary.t.length >= 2 ? section("computed") : section("insufficient-data", "TOO_FEW_POINTS")
      case "decline-models": return primary.t.length >= 3 ? section("computed") : section("insufficient-data", "TOO_FEW_POINTS")
      case "cumulative": return primary.cumulative ? section("computed") : section("not-applicable", "NO_CALENDAR_PERIODS")
      case "hypotheses": return wells.some((well) => well.hypotheses.measurements.length) ? section("computed") : section("not-applicable", "NO_TRIGGER")
      case "multiwell": return dataset.wells.length > 1 ? section("computed") : section("not-applicable", "SINGLE_WELL")
      case "economics": return !parameters.price ? section("insufficient-data", "NO_PRICE") : context.priceFactor === null ? section("insufficient-data", "PRICE_UNIT_NEEDS_DENSITY") : section("computed")
      case "chan": return primary.chan ? section("computed") : section("insufficient-data", hasWater ? "TOO_FEW_POINTS" : "NO_WATER_DATA")
      default: return section("computed")
    }
  }
  const analysisSections = OIL_ANALYSES.map(status)

  const unitSummary = { liquid: units.liquid, gas: hasGas ? units.gas : null, gor: hasGas ? gor.unit : null }
  const calculatedMetrics = wells.flatMap((well) => wellMetrics(well, unitSummary, parameters.price))
  const percent = (values: Num[]) => values.map((value) => isNum(value) ? value * 100 : null)
  const chartSeries: PetroleumAnalysisResult["chartSeries"] = wells.flatMap((well) => {
    const charts: PetroleumAnalysisResult["chartSeries"] = [{
      id: "rates", well: well.id, unit: units.liquid, x: well.t, forecastFrom: null,
      series: [
        { id: "oil", values: well.oil, role: "fact", style: "solid" },
        ...(hasWater ? [{ id: "water", values: well.water, role: "fact" as const, style: "dash" as const }, { id: "liquid", values: well.liquid, role: "fact" as const, style: "dot" as const }] : []),
      ],
    }]
    if (hasGas) {
      charts.push({ id: "gas", well: well.id, unit: units.gas as string, x: well.t, forecastFrom: null, series: [{ id: "gas", values: well.gas, role: "fact", style: "solid" }] })
      charts.push({ id: "gor", well: well.id, unit: gor.unit as string, x: well.t, forecastFrom: null, series: [{ id: "gor", values: well.gor, role: "fact", style: "solid" }] })
    }
    if (hasWater) {
      charts.push({ id: "water-cut", well: well.id, unit: "%", x: well.t, forecastFrom: null, series: [{ id: "wc", values: percent(well.wc), role: "fact", style: "solid" }] })
      charts.push({ id: "wor", well: well.id, unit: "ratio", x: well.t, forecastFrom: null, series: [{ id: "wor", values: well.wor, role: "fact", style: "solid" }] })
      if (well.chan) charts.push({ id: "chan", well: well.id, unit: "ratio/period", x: well.t, forecastFrom: null, series: [{ id: "worDerivative", values: well.worDerivative, role: "fact", style: "dash" }] })
    }
    if (well.forecast) {
      const history = well.t.length
      const pad = (values: Num[]) => [...Array.from({ length: history - 1 }, () => null), well.oil[history - 1], ...values]
      charts.push({
        id: "forecast", well: well.id, unit: units.liquid, x: [...well.t, ...well.forecast.t], forecastFrom: well.t[history - 1],
        series: [
          { id: "oil", values: [...well.oil, ...well.forecast.t.map(() => null)], role: "fact", style: "solid" },
          { id: "linear", values: pad(well.forecast.linear), role: "model", style: "dash" },
          { id: "exponential", values: pad(well.forecast.exponential), role: "model", style: "dashdot" },
          { id: "harmonic", values: pad(well.forecast.harmonic), role: "model", style: "dot" },
        ],
      })
    }
    return charts
  })

  const tableDatasets: PetroleumAnalysisResult["tableDatasets"] = wells.flatMap((well) => {
    const tables: PetroleumAnalysisResult["tableDatasets"] = [{
      id: "production", well: well.id,
      columns: [{ id: "period", unit: "" }, { id: "oil", unit: units.liquid }, { id: "water", unit: units.liquid }, { id: "gas", unit: units.gas || "" }, { id: "liquid", unit: units.liquid }, { id: "wc", unit: "%" }, { id: "gor", unit: gor.unit || "" }, { id: "wor", unit: "ratio" }],
      rows: well.t.map((_, index) => [well.period[index], well.oil[index], well.water[index], well.gas[index], well.liquid[index], isNum(well.wc[index]) ? (well.wc[index] as number) * 100 : null, well.gor[index], well.wor[index]]),
    }]
    if (well.forecast) tables.push({
      id: "forecast", well: well.id,
      columns: [{ id: "t", unit: "" }, { id: "linear", unit: units.liquid }, { id: "exponential", unit: units.liquid }, { id: "harmonic", unit: units.liquid }],
      rows: well.forecast.t.map((value, index) => [value, well.forecast!.linear[index], well.forecast!.exponential[index], well.forecast!.harmonic[index]]),
    })
    return tables
  })
  if (dataset.wells.length > 1) tableDatasets.push({
    id: "multiwell", well: null,
    columns: [{ id: "well", unit: "" }, { id: "oil_first", unit: units.liquid }, { id: "oil_last", unit: units.liquid }, { id: "oil_change", unit: "%" }, { id: "oil_loss", unit: units.liquid }, { id: "wc_change_pp", unit: "pp" }, { id: "gor_change", unit: "%" }],
    rows: analyses.map((well) => [well.id, well.first.oil, well.last.oil, isNum(well.change.oil) ? well.change.oil * 100 : null, isNum(well.first.oil) && isNum(well.last.oil) ? well.first.oil - well.last.oil : null, well.change.wcPP, isNum(well.change.gorRel) ? well.change.gorRel * 100 : null]),
  })

  const formulaDefinitions = [
    { id: "wc", tex: "WC = \\frac{q_w}{q_o + q_w} \\cdot 100\\%", variables: ["q_w", "q_o"] },
    { id: "gor", tex: "GOR = \\frac{q_g}{q_o}", variables: ["q_g", "q_o"] },
    { id: "wor", tex: "WOR = \\frac{q_w}{q_o}", variables: ["q_w", "q_o"] },
    { id: "liquid", tex: "q_L = q_o + q_w", variables: ["q_o", "q_w"] },
    { id: "decline", tex: "\\Delta q_o = \\frac{q_{o,1} - q_{o,n}}{q_{o,1}} \\cdot 100\\%", variables: ["q_{o,1}", "q_{o,n}"] },
    { id: "decline-rate", tex: "d = 1 - (q_{o,n} / q_{o,1})^{1/\\Delta t}", variables: ["q_{o,1}", "q_{o,n}", "\\Delta t"] },
    { id: "linear", tex: "q(t) = a + b \\, t", variables: ["a", "b", "t"] },
    { id: "exponential", tex: "q(t) = q_i \\, e^{-D t}", variables: ["q_i", "D", "t"] },
    { id: "harmonic", tex: "q(t) = \\frac{q_i}{1 + D t}", variables: ["q_i", "D", "t"] },
    { id: "cumulative", tex: "N_p = \\sum_k q_{o,k} \\, \\Delta t_k", variables: ["q_{o,k}", "\\Delta t_k"] },
  ]

  const warnings = ["ENGINEER_REVIEW_REQUIRED"]
  if (wells.some((well) => well.forecast)) warnings.push("TREND_EXTRAPOLATION_NOT_RESERVOIR_FORECAST", "SCENARIOS_NOT_CONFIDENCE_INTERVALS")
  if (wells.some((well) => well.hypotheses.measurements.length)) warnings.push("MECHANISM_NOT_DETERMINED")
  const limitations = ["USER_DATA_UNVERIFIED", "NO_PRESSURE_PVT_DATA", "NO_RESERVES_CLASSIFICATION", "NO_EQUIPMENT_CONTROL"]
  if (wells.some((well) => well.cumulative)) limitations.push("CUMULATIVE_ASSUMES_AVERAGE_RATES")
  if (parameters.price) limitations.push("ECONOMICS_GROSS_PRETAX")

  const analysisId = `oa-${requestFingerprint(JSON.stringify(request))}`
  const evidence: Record<string, OilEvidence> = {}
  for (const metric of calculatedMetrics) evidence[metric.id] = metric.evidence
  evidence.hypotheses = "Engineering Hypothesis"
  const rows = dataset.wells.reduce((sum, well) => sum + well.t.length, 0)

  return {
    schemaVersion: OIL_ANALYSIS_SCHEMA_VERSION,
    analysisId,
    engineVersion: OIL_ANALYSIS_ENGINE_VERSION,
    language: request.language,
    sourceSummary: {
      wells: dataset.wells.length, periods: new Set(dataset.wells.flatMap((well) => well.t)).size, rows,
      granularity: dataset.granularity, calendar: dataset.calendar, source: metadata.source, dataKind: metadata.dataKind, sourceHash: metadata.sourceHash,
      firstT: Math.min(...dataset.wells.map((well) => well.t[0])), lastT: Math.max(...dataset.wells.map((well) => well.t[well.t.length - 1])),
      omittedWells: metadata.omittedWells,
    },
    validatedInputs: { acceptedRows: metadata.acceptedRows, rejectedRows: metadata.rejectedRows, units: { ...unitSummary, gasReference: units.gasReference, basis: units.liquid === "t/day" ? "mass" : "volume" }, notes: [...metadata.notes] },
    calculatedMetrics,
    analysisSections,
    chartSeries,
    tableDatasets,
    formulaDefinitions,
    modelOutputs: wells.map((well) => ({ well: well.id, models: well.models, selected: well.selected })),
    economicOutputs: parameters.price && context.priceFactor !== null ? {
      currency: parameters.price.currency, per: parameters.price.per, price: parameters.price.value,
      wells: wells.map((well) => ({ well: well.id, dailyGap: well.economics?.dailyGap ?? null, monthGap: well.economics?.monthGap ?? null, historicalGap: well.economics?.historicalGap ?? null })),
    } : null,
    qualityFlags,
    warnings,
    limitations,
    provenance: { engineVersion: OIL_ANALYSIS_ENGINE_VERSION, schemaVersion: OIL_ANALYSIS_SCHEMA_VERSION, analysisId, evidence, deterministic: true },
    wells,
  }
}

/** The values a chat answer stores so a later recalculation can be compared with what was shown. */
export function oilMetricPairs(result: PetroleumAnalysisResult): Array<[string, number | null]> {
  return result.calculatedMetrics.map((metric) => [`${metric.well}|${metric.id}`, metric.value])
}

/**
 * Compares stored metrics with a recalculation. Engines may differ in the last
 * bit of exp/log, so values match within a relative 1e-9; anything else - a
 * changed number, a missing or invented metric - is a mismatch.
 */
export function compareOilMetrics(stored: Array<[string, number | null]>, recomputed: Array<[string, number | null]>) {
  const fresh = new Map(recomputed)
  const mismatches: string[] = []
  const seen = new Set<string>()
  for (const [key, value] of stored) {
    seen.add(key)
    if (!fresh.has(key)) { mismatches.push(key); continue }
    const actual = fresh.get(key) ?? null
    if (value === null || actual === null) { if (value !== actual) mismatches.push(key); continue }
    if (Math.abs(value - actual) > 1e-9 * Math.max(1, Math.abs(actual))) mismatches.push(key)
  }
  for (const key of fresh.keys()) if (!seen.has(key)) mismatches.push(key)
  return mismatches
}
