/** Deterministic business math. Missing inputs remain missing, never invented. */
export type EconomicsInputs = {
  currency: string
  price: number | null
  variableCost: number | null
  monthlyCustomers: number | null
  monthlyFixedCosts: number | null
  monthlyMarketingSpend: number | null
  newCustomers: number | null
  monthlyChurnPercent: number | null
}

export type EconomicsResult = {
  inputs: EconomicsInputs
  monthlyRevenue: number | null
  contributionPerCustomer: number | null
  grossMarginPercent: number | null
  monthlyProfit: number | null
  cac: number | null
  ltv: number | null
  ltvToCac: number | null
  breakEvenCustomers: number | null
  pricingScenarios: Array<{ price: number; monthlyRevenue: number | null; monthlyProfit: number | null; demandAssumption: string }>
  missing: string[]
}

const FIELDS = ["price", "variableCost", "monthlyCustomers", "monthlyFixedCosts", "monthlyMarketingSpend", "newCustomers", "monthlyChurnPercent"] as const
type NumericField = typeof FIELDS[number]

export function parseEconomicsInputs(raw: Record<string, unknown>): EconomicsInputs {
  const result = { currency: String(raw.currency || "KZT").trim().toUpperCase().slice(0, 3) || "KZT" } as EconomicsInputs
  if (!/^[A-Z]{3}$/.test(result.currency)) throw new Error("INVALID_CURRENCY")
  for (const field of FIELDS) {
    const value = raw[field]
    if (value === undefined || value === null || value === "") {
      result[field] = null
      continue
    }
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))) throw new Error(`INVALID_${field.toUpperCase()}`)
    const number = Number(value)
    if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000 || (field === "monthlyChurnPercent" && number > 100)) throw new Error(`INVALID_${field.toUpperCase()}`)
    result[field] = number
  }
  return result
}

function rounded(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100
}

export function calculateUnitEconomics(inputs: EconomicsInputs): EconomicsResult {
  const { price, variableCost, monthlyCustomers, monthlyFixedCosts, monthlyMarketingSpend, newCustomers, monthlyChurnPercent } = inputs
  const contribution = price !== null && variableCost !== null ? price - variableCost : null
  const revenue = price !== null && monthlyCustomers !== null ? price * monthlyCustomers : null
  const profit = contribution !== null && monthlyCustomers !== null && monthlyFixedCosts !== null
    ? contribution * monthlyCustomers - monthlyFixedCosts : null
  const cac = monthlyMarketingSpend !== null && newCustomers !== null && newCustomers > 0
    ? monthlyMarketingSpend / newCustomers : null
  // A recurring-revenue approximation, NOT a factual customer lifetime.
  const ltv = contribution !== null && monthlyChurnPercent !== null && monthlyChurnPercent > 0 && contribution >= 0
    ? contribution / (monthlyChurnPercent / 100) : null
  const breakEven = contribution !== null && contribution > 0 && monthlyFixedCosts !== null
    ? Math.ceil(monthlyFixedCosts / contribution) : null
  const missing: string[] = FIELDS.filter((field) => inputs[field] === null)
  if (newCustomers === 0) missing.push("newCustomers > 0 for CAC")
  if (monthlyChurnPercent === 0) missing.push("monthlyChurnPercent > 0 for LTV")
  if (contribution !== null && contribution <= 0) missing.push("positive contribution for break-even")
  return {
    inputs,
    monthlyRevenue: rounded(revenue),
    contributionPerCustomer: rounded(contribution),
    grossMarginPercent: price !== null && price > 0 && contribution !== null ? rounded(contribution / price * 100) : null,
    monthlyProfit: rounded(profit),
    cac: rounded(cac),
    ltv: rounded(ltv),
    ltvToCac: cac !== null && cac > 0 && ltv !== null ? rounded(ltv / cac) : null,
    breakEvenCustomers: breakEven,
    pricingScenarios: price === null ? [] : [0.9, 1, 1.1].map((factor) => {
      const scenarioPrice = rounded(price * factor)!
      return {
        price: scenarioPrice,
        monthlyRevenue: monthlyCustomers === null ? null : rounded(scenarioPrice * monthlyCustomers),
        monthlyProfit: monthlyCustomers === null || variableCost === null || monthlyFixedCosts === null
          ? null : rounded((scenarioPrice - variableCost) * monthlyCustomers - monthlyFixedCosts),
        demandAssumption: "Число клиентов не меняется — это сценарий, не прогноз спроса.",
      }
    }),
    missing,
  }
}

export function economicsMarkdown(result: EconomicsResult): string {
  const show = (value: number | null, suffix = "") => value === null ? "Нет данных" : `${value.toLocaleString("ru-RU")}${suffix}`
  const { inputs } = result
  return [
    "# Юнит-экономика",
    "",
    "Все значения ниже рассчитаны только из данных, введённых пользователем. Это сценарий, а не подтверждённые показатели бизнеса.",
    "",
    `- Выручка за месяц: ${show(result.monthlyRevenue, ` ${inputs.currency}`)}`,
    `- Вклад с клиента (цена − переменные затраты): ${show(result.contributionPerCustomer, ` ${inputs.currency}`)}`,
    `- Валовая маржа: ${show(result.grossMarginPercent, "%")}`,
    `- Прибыль за месяц до налогов и прочих неуказанных расходов: ${show(result.monthlyProfit, ` ${inputs.currency}`)}`,
    `- CAC (маркетинговые затраты / новые клиенты): ${show(result.cac, ` ${inputs.currency}`)}`,
    `- LTV (вклад / месячный отток): ${show(result.ltv, ` ${inputs.currency}`)} — только для подписной модели со стабильным оттоком`,
    `- LTV/CAC: ${show(result.ltvToCac)}`,
    `- Точка безубыточности: ${show(result.breakEvenCustomers, " клиентов/мес")}`,
    "",
    "## Сценарии цены",
    "",
    `| Цена (${inputs.currency}) | Выручка/мес | Прибыль/мес |`,
    "|---:|---:|---:|",
    ...result.pricingScenarios.map((row) => `| ${show(row.price)} | ${show(row.monthlyRevenue)} | ${show(row.monthlyProfit)} |`),
    "",
    "Предположение для сценариев: число клиентов и затраты остаются неизменными. Реальный спрос при изменении цены может отличаться.",
    ...(result.missing.length ? ["", `Не хватает данных для части расчётов: ${result.missing.join(", ")}.`] : []),
  ].join("\n")
}
