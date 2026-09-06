export type EconomicsInput = { price: number; variable: number; fixed: number; volume: number; cash: number }

/** Deterministic scenario arithmetic. No inferred prices, taxes or forecasts. */
export function calculateEconomics(input: EconomicsInput) {
  if (Object.values(input).some((value) => !Number.isFinite(value) || value < 0 || value > 1e12)) return null
  const contribution = input.price - input.variable
  const revenue = input.price * input.volume
  const operatingResult = contribution * input.volume - input.fixed
  return {
    contribution, revenue, operatingResult,
    breakEvenUnits: contribution > 0 ? Math.ceil(input.fixed / contribution) : null,
    runwayMonths: operatingResult < 0 ? input.cash / -operatingResult : null,
  }
}
