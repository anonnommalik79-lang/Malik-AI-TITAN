export const BARREL_M3 = 0.158987294928
export const FT3_M3 = 0.028316846592
const UNITS = {
  bbl: ["liquid-volume", BARREL_M3], m3: ["liquid-volume", 1],
  "bbl/day": ["liquid-rate", BARREL_M3], "m3/day": ["liquid-rate", 1],
  scf: ["standard-gas-volume", FT3_M3], sm3: ["standard-gas-volume", 1],
  "scf/day": ["standard-gas-rate", FT3_M3], "sm3/day": ["standard-gas-rate", 1],
  psi: ["pressure", 6894.757293168], bar: ["pressure", 100000], kPa: ["pressure", 1000], MPa: ["pressure", 1000000],
  kg: ["mass", 1], tonne: ["mass", 1000], day: ["time", 86400], hour: ["time", 3600],
} as const
export type PetroleumUnit = keyof typeof UNITS
export const petroleumUnits = Object.keys(UNITS) as PetroleumUnit[]
export function finite(value: number, name = "value", nonnegative = true) {
  if (!Number.isFinite(value) || nonnegative && value < 0 || Math.abs(value) > 1e15) throw new RangeError(`${name}: finite ${nonnegative ? "non-negative " : ""}value <= 1e15 required`)
  return value
}
export function convert(value: number, from: PetroleumUnit, to: PetroleumUnit, reference?: string) {
  finite(value)
  if (!(from in UNITS) || !(to in UNITS) || UNITS[from][0] !== UNITS[to][0]) throw new RangeError("DIMENSION_MISMATCH")
  if (UNITS[from][0].startsWith("standard-gas") && !reference?.trim()) throw new RangeError("Gas reference temperature/pressure required; conversion preserves that basis")
  return finite(value * UNITS[from][1] / UNITS[to][1], "converted")
}
export type Quantity = { value: number; unit: PetroleumUnit; reference?: string }
export function waterCut(oil: Quantity, water: Quantity) {
  if (!["bbl/day", "m3/day"].includes(oil.unit)) throw new RangeError("Liquid rates required")
  const qo = convert(oil.value, oil.unit, "m3/day"), qw = convert(water.value, water.unit, "m3/day")
  return qo + qw === 0 ? null : qw / (qo + qw)
}
export function gasOilRatio(oil: Quantity, gas: Quantity) {
  const qo = convert(oil.value, oil.unit, "bbl/day"), qg = convert(gas.value, gas.unit, "scf/day", gas.reference)
  return qo === 0 ? null : finite(qg / qo, "GOR")
}
