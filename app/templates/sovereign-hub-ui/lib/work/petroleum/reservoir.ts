import { finite } from "./units"
export function decline(qi: number, nominalDeclinePerDay: number, days: number, b = 0) {
  finite(qi, "qi"); finite(nominalDeclinePerDay, "D"); finite(days, "t")
  if (!Number.isFinite(b) || b < 0 || b > 1) throw new RangeError("Hyperbolic exponent b must be in [0,1]; transient b>1 not supported")
  return finite(qi * Math.exp(b === 0 ? -nominalDeclinePerDay * days : -Math.log1p(b * nominalDeclinePerDay * days) / b), "q(t)")
}
export function declineVolume(qi: number, d: number, fromDay: number, toDay: number, b = 0) {
  decline(qi, d, fromDay, b); decline(qi, d, toDay, b)
  if (toDay < fromDay) throw new RangeError("Reversed interval")
  if (d === 0) return finite(qi * (toDay - fromDay))
  if (b === 0) return finite(qi / d * Math.exp(-d * fromDay) * -Math.expm1(-d * (toDay - fromDay)))
  if (b === 1) return finite(qi / d * Math.log1p(d * (toDay - fromDay) / (1 + d * fromDay)))
  const power = (b - 1) / b
  return finite(qi / (d * (b - 1)) * Math.exp(power * Math.log1p(b * d * fromDay)) * Math.expm1(power * Math.log1p(b * d * (toDay - fromDay) / (1 + b * d * fromDay))))
}
/** OLS log-rate on actual elapsed days; zeros are not silently deleted. */
export function fitExponential(points: Array<{ day: number; rate: number }>) {
  if (points.length < 6 || points.some(p => !Number.isFinite(p.day) || !Number.isFinite(p.rate) || p.rate <= 0)) return { ok: false as const, reason: "At least six positive rates required; zeros/shut-ins cannot be fitted" }
  const first = points[0].day, x = points.map(p => p.day - first), y = points.map(p => Math.log(p.rate))
  const mx = x.reduce((a,b) => a+b,0)/x.length, my = y.reduce((a,b) => a+b,0)/y.length
  const xx = x.reduce((a,v) => a+(v-mx)**2,0)
  if (xx === 0 || x[x.length-1] <= 0) return { ok: false as const, reason: "Distinct ordered dates required" }
  const slope = x.reduce((a,v,i) => a+(v-mx)*(y[i]-my),0)/xx, intercept = my-slope*mx
  const residuals = y.map((v,i) => v-intercept-slope*x[i])
  const ss = y.reduce((a,v) => a+(v-my)**2,0), error = residuals.reduce((a,v) => a+v*v,0)
  const r2 = ss === 0 ? 1 : 1-error/ss
  if (slope >= 0 || r2 < 0.8) return { ok: false as const, reason: "No stable declining trend (D>0 and log-rate R²>=0.8 required)", r2 }
  return { ok: true as const, qi: Math.exp(intercept), declinePerDay: -slope, r2, logResidualStd: Math.sqrt(error/(points.length-2)), lastDay: x[x.length-1], n: points.length }
}
