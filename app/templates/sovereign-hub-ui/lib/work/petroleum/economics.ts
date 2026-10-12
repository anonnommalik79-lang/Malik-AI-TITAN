import { finite } from "./units"
/** Periodic end-period cash flows; CF0 at t=0. Rate is per period, not implicitly annual. */
export function npv(cashflows: number[], rate: number) {
  if (!cashflows.length || cashflows.length > 1201 || !Number.isFinite(rate) || rate <= -1 || rate > 100) throw new RangeError("Invalid periodic cashflows/discount rate")
  let sum = 0, correction = 0
  for (let t = 0; t < cashflows.length; t++) {
    finite(cashflows[t], `CF${t}`, false)
    const value = cashflows[t] / (1 + rate) ** t - correction
    const next = sum + value
    correction = next - sum - value; sum = next
  }
  return finite(sum, "NPV", false)
}
/** Fail closed on nonconventional flows (multiple IRRs possible). No spurious root from Newton iteration. */
export function irr(cashflows: number[]): { rate: number | null; reason?: string; residual?: number } {
  npv(cashflows, 0)
  const signs = cashflows.filter(x => x !== 0).map(Math.sign)
  const changes = signs.slice(1).filter((s, i) => s !== signs[i]).length
  if (changes !== 1 || cashflows[0] >= 0) return { rate: null, reason: "Conventional investment cashflows with exactly one sign change required" }
  let low = -0.9, high = 1, a: number
  try { a = npv(cashflows, low) } catch { low = 0; a = npv(cashflows, low) }
  let b = npv(cashflows, high)
  while (a * b > 0 && high < 100) { high = Math.min(100, high * 2 + 1); b = npv(cashflows, high) }
  if (a * b > 0) return { rate: null, reason: "No root bracketed in supported rate interval" }
  for (let i = 0; i < 160; i++) {
    const middle = (low + high) / 2, value = npv(cashflows, middle)
    if (Math.abs(value) <= Math.max(1e-8, Math.max(...cashflows.map(Math.abs)) * 1e-10)) return { rate: middle, residual: value }
    if (Math.sign(value) === Math.sign(a)) { low = middle; a = value } else high = middle
  }
  return { rate: null, reason: "IRR tolerance not met" }
}
export type EconomicsInput = { volumes: number[]; price: number; variableOpex: number; fixedOpex: number; capex: number; discountRate: number; period: "year" | "month"; currency: string }
export function economics(input: EconomicsInput) {
  const { volumes, price, variableOpex, fixedOpex, capex, discountRate } = input
  if (!volumes.length || volumes.length > 1200) throw new RangeError("Volume horizon required")
  for (const v of [price, variableOpex, fixedOpex, capex, ...volumes]) finite(v)
  const cashflows = [-capex, ...volumes.map(v => finite(v * (price - variableOpex) - fixedOpex, "cashflow", false))]
  let cumulative = -capex, payback: number | null = capex === 0 ? 0 : null
  cashflows.slice(1).forEach((cf, i) => { const previous = cumulative; cumulative += cf; if (payback === null && previous < 0 && cumulative >= 0 && cf > 0) payback = i + (-previous / cf) })
  const pvVolumes = npv([0, ...volumes], discountRate)
  const breakEvenPrice = pvVolumes > 0 ? variableOpex + (capex + npv([0, ...volumes.map(() => fixedOpex)], discountRate)) / pvVolumes : null
  return { cashflows, npv: npv(cashflows, discountRate), irr: irr(cashflows), paybackPeriods: payback, breakEvenPrice,
    sensitivity: [0.8, 1, 1.2].map(factor => ({ price: price * factor, npv: npv([-capex, ...volumes.map(v => v * (price * factor - variableOpex) - fixedOpex)], discountRate) })),
    assumptions: ["Pre-tax, unlevered; no royalties, tax, inflation, FX, abandonment or working capital included", `Price and variable OPEX per unit of supplied volumes; fixed OPEX per ${input.period}; discount rate per ${input.period}`, "Price scenarios ±20% are assumptions, not probabilities; payback uses uniform cash accrual within period"] }
}
