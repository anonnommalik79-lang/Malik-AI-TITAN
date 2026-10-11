import { add, sub, mul, div, q, pow, type Q } from "../../work/math/rational"
import { decimal } from "./exact"

function periods(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 1200) throw new RangeError("Periods must be 0..1200")
}
/** Rate is a fraction per period (0.05 = 5%). Round only the final currency amount. */
export function compound(principal: string, ratePerPeriod: string, count: number): Q {
  periods(count)
  return mul(decimal(principal), pow(add(q(1), decimal(ratePerPeriod)), count))
}
export function annuityPayment(principal: string, ratePerPeriod: string, count: number): Q {
  periods(count)
  if (!count) throw new RangeError("No payment periods")
  const p = decimal(principal), rate = decimal(ratePerPeriod)
  if (rate.n === BigInt(0)) return div(p, q(count))
  const factor = pow(add(q(1), rate), count)
  return div(mul(mul(p, rate), factor), sub(factor, q(1)))
}
export function netPresentValue(cashFlows: string[], ratePerPeriod: string): Q {
  if (!cashFlows.length || cashFlows.length > 121) throw new RangeError("Cash flow limit")
  const growth = add(q(1), decimal(ratePerPeriod))
  if (growth.n <= BigInt(0)) throw new RangeError("Discount rate must be > -1")
  let result = q(0), factor = q(1)
  for (const flow of cashFlows) { result = add(result, div(decimal(flow), factor)); factor = mul(factor, growth) }
  return result
}
export function percentChange(before: string, after: string): Q {
  const a = decimal(before)
  return mul(div(sub(decimal(after), a), a), q(100))
}
