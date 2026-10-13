/** A factual, unit-preserving oil-rate heatmap. Missing samples stay null.
 * Never interpolate timestamps or sum rates as volumes.
 * Pure function: safe to rerun in server tests and client rendering.
 */
export type OilHeatWell = {
  id: string; isField: boolean; t: number[]; oil: Array<number | null>; period: string[]
}
export type OilHeatmap = {
  periods: Array<{ t: number; label: string }>
  wells: Array<{ id: string; values: Array<number | null> }>
  maximum: number
}
export function buildOilRateHeatmap(wells: readonly OilHeatWell[], periodsToShow = 12): OilHeatmap | null {
  const actual = wells.filter((well) => !well.isField)
  if (actual.length < 2) return null
  const sorted = [...new Set(actual.flatMap((well) => well.t.filter(Number.isFinite)))].sort((a,b) => a-b)
  if (!sorted.length) return null
  const ticks = sorted.slice(-Math.max(1,Math.min(24,Math.trunc(periodsToShow)||12)))
  const periods = ticks.map((t) => {
    const found = actual.find((well) => well.t.includes(t))
    const index = found?.t.indexOf(t) ?? -1
    return { t, label: index >= 0 ? String(found?.period[index] ?? t) : String(t) }
  })
  let maximum = 0
  const rows = actual.map((well) => {
    const positions = new Map(well.t.map((t,index) => [t,index]))
    return { id: well.id, values: ticks.map((t) => {
      const at = positions.get(t)
      const value = at === undefined ? null : well.oil[at]
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
      maximum = Math.max(maximum,value)
      return value
    }) }
  })
  return { periods, wells: rows, maximum }
}
