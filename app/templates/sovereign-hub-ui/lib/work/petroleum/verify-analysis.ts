import type { PetroleumAnalysisRequest, PetroleumAnalysisResult } from "./analysis-contract"

/** Independent raw-data identities, including yearless monthly tables. No fitted model is a measurement. */
export function verifyOilAnalysis(request: PetroleumAnalysisRequest, result: PetroleumAnalysisResult) {
  const mismatches: string[] = []
  let checked = 0
  const close = (id: string, actual: number | null, expected: number | null) => {
    checked++
    if (actual === null || expected === null ? actual !== expected : !Number.isFinite(actual) || Math.abs(actual - expected) > 1e-9 * Math.max(1, Math.abs(expected))) mismatches.push(id)
  }
  for (const series of result.wells) for (let i = 0; i < series.t.length; i++) {
    const raw = request.dataset.wells.filter(w => series.isField || w.id === series.id)
    const points = raw.map(w => ({ w, at: w.t.indexOf(series.t[i]) }))
    if (points.some(p => p.at < 0)) { mismatches.push(`${series.id}:missing-source`); continue }
    const oil = points.reduce((sum, p) => sum + p.w.oil[p.at], 0)
    const sum = (key: "water" | "gas") => points.some(p => p.w[key]?.[p.at] === null || p.w[key]?.[p.at] === undefined) ? null : points.reduce((s, p) => s + p.w[key]![p.at]!, 0)
    const water = sum("water"), gas = sum("gas")
    const gorFactor = request.units.liquid === "t/day" ? 1 : request.units.gas === "scf/day" ? request.units.liquid === "bbl/day" ? 1 : 1 / 0.158987294928 : request.units.liquid === "m3/day" ? 1 : 0.158987294928
    close(`${series.id}:${i}:oil`, series.oil[i], oil)
    close(`${series.id}:${i}:water`, series.water[i], water)
    close(`${series.id}:${i}:gas`, series.gas[i], gas)
    close(`${series.id}:${i}:wc`, series.wc[i], water !== null && oil + water > 0 ? water / (oil + water) : null)
    close(`${series.id}:${i}:wor`, series.wor[i], water !== null && oil > 0 ? water / oil : null)
    close(`${series.id}:${i}:gor`, series.gor[i], gas !== null && oil > 0 ? gas / (oil * gorFactor) : null)
  }
  for (const chart of result.chartSeries) for (const series of chart.series) for (const value of series.values) {
    checked++
    if (value !== null && !Number.isFinite(value)) mismatches.push(`${chart.well}:${chart.id}:nonfinite`)
  }
  return { ok: mismatches.length === 0, checked, mismatches }
}
