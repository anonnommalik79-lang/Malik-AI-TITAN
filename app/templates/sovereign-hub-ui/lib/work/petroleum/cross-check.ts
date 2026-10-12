import { analyzeProduction } from "./production"
import { BARREL_M3, FT3_M3 } from "./units"
import { monthOf, type analyzePetroleumDataset } from "./analysis"
import type { PetroleumAnalysisRequest } from "./analysis-contract"

/**
 * Independent verification: the same rows go through the production module
 * that serves CSV/XLSX uploads (lib/work/petroleum/production.ts - a separate
 * parser, unit converter and implementation). First and last rates, water cut,
 * GOR and oil change must agree for every well. Pure, so the report re-runs it
 * in the browser instead of trusting a stored verdict.
 */

export const CROSS_CHECK_ENGINE = "production.ts"

export type OilCrossCheck = { status: "passed" | "failed" | "skipped"; checked: number; mismatches: string[]; reason: string | null }

const close = (left: number | null | undefined, right: number | null | undefined) =>
  left === null || left === undefined || right === null || right === undefined ? left == right : Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(right))

function isoDate(t: number, granularity: PetroleumAnalysisRequest["dataset"]["granularity"]) {
  if (granularity === "month") {
    const { year, month } = monthOf(t)
    return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-01`
  }
  return new Date(t * 86_400_000).toISOString().slice(0, 10)
}

export function crossCheckOil(request: PetroleumAnalysisRequest, result: ReturnType<typeof analyzePetroleumDataset>): OilCrossCheck {
  const skip = (reason: string): OilCrossCheck => ({ status: "skipped", checked: 0, mismatches: [], reason })
  const { dataset, units } = request
  if (units.liquid === "t/day") return skip("MASS_BASIS")
  if (!dataset.calendar || dataset.granularity === "index") return skip("NO_CALENDAR_DATES")
  if (dataset.wells.some((well) => !/^[\p{L}\p{N}_. -]{1,80}$/u.test(well.id))) return skip("WELL_ID_FORMAT")
  const liquid = units.liquid === "bbl/day" ? "bbl" : "m3"
  const withWater = dataset.wells.every((well) => well.water?.every((value) => value !== null))
  const withGas = Boolean(units.gas) && dataset.wells.every((well) => well.gas?.every((value) => value !== null))
  const gasColumn = units.gas === "sm3/day" ? "sm3" : "scf"
  if (dataset.wells.some((well) => [...well.oil, ...(well.water || []), ...(well.gas || [])].some((value) => value !== null && /e/i.test(String(value))))) return skip("NUMBER_FORMAT")
  const header = ["well_id", "date", `oil_${liquid}_day`, ...(withWater ? [`water_${liquid}_day`] : []), ...(withGas ? [`gas_${gasColumn}_day`] : [])]
  const lines = [header.join(",")]
  for (const well of dataset.wells) well.t.forEach((t, index) => {
    lines.push([well.id, isoDate(t, dataset.granularity), String(well.oil[index]), ...(withWater ? [String(well.water![index])] : []), ...(withGas ? [String(well.gas![index])] : [])].join(","))
  })
  let other: ReturnType<typeof analyzeProduction>
  try { other = analyzeProduction(lines.join("\n"), 0, withGas ? "as reported by the source" : undefined) }
  catch { return { status: "failed", checked: 0, mismatches: ["ENGINE_REJECTED"], reason: null } }
  const toBbl = liquid === "bbl" ? 1 : 1 / BARREL_M3
  const gorScale = units.gas === "sm3/day" ? FT3_M3 / BARREL_M3 : 1
  const mismatches: string[] = []
  let checked = 0
  const compare = (key: string, mine: number | null | undefined, theirs: number | null | undefined) => { checked += 1; if (!close(mine, theirs)) mismatches.push(key) }
  if (other.audit.acceptedRows !== dataset.wells.reduce((sum, well) => sum + well.t.length, 0)) mismatches.push("rows")
  for (const well of result.wells.filter((item) => !item.isField)) {
    const theirs = other.wells.find((item) => item.well === well.id)
    if (!theirs) { mismatches.push(`${well.id}:missing`); continue }
    compare(`${well.id}:oil_first`, well.first.oil === null ? null : well.first.oil * toBbl, theirs.firstRate)
    compare(`${well.id}:oil_last`, well.last.oil === null ? null : well.last.oil * toBbl, theirs.lastRate)
    compare(`${well.id}:oil_change`, well.change.oil, theirs.changeFraction)
    if (withWater) { compare(`${well.id}:wc_first`, well.first.wc, theirs.waterCutFirst); compare(`${well.id}:wc_last`, well.last.wc, theirs.waterCutLast) }
    if (withGas) {
      compare(`${well.id}:gor_first`, well.first.gor, theirs.gorFirst === null ? null : theirs.gorFirst * gorScale)
      compare(`${well.id}:gor_last`, well.last.gor, theirs.gorLast === null ? null : theirs.gorLast * gorScale)
    }
  }
  return { status: mismatches.length ? "failed" : "passed", checked, mismatches, reason: null }
}
