/**
 * Deterministic financial models for the Visual Engine calculator.
 *
 * The language model never computes these numbers. It picks a model, ranges
 * and starting values (the user's own numbers when given); every result shown
 * on screen comes from the formulas below, recomputed locally on each slider
 * move with no network call.
 *
 * Terms are kept apart on purpose: revenue is not profit, gross margin is not
 * operating margin, and nothing here includes taxes - every model says so.
 */

export type CalculatorInputKind = "money" | "count" | "percent" | "years" | "months"
export type CalculatorFormat = "currency" | "percent" | "count" | "months" | "years" | "ratio"

export type CalculatorInputDef = {
  key: string
  label: string
  kind: CalculatorInputKind
  value: number
  min: number
  max: number
  step: number
  /** Shown after the value, e.g. «/ мес». */
  suffix?: string
  /** An input that may be left at zero to switch its outputs off. */
  optional?: boolean
}

export type CalculatorOutput = {
  key: string
  label: string
  value: number | null
  format: CalculatorFormat
  tone?: "good" | "bad"
  /** Shown instead of a number when value is null. */
  empty?: string
  /** Noun for a count: one, few, many («клиент», «клиента», «клиентов»). */
  noun?: [string, string, string]
  hint?: string
}

export type CalculatorResult = {
  headline: CalculatorOutput
  outputs: CalculatorOutput[]
  details: CalculatorOutput[]
  assumptions: string[]
}

type Values = Record<string, number>

type CalculatorModel = {
  label: string
  subtitle: string
  inputs: CalculatorInputDef[]
  compute: (values: Values) => CalculatorResult
}

const safeDiv = (a: number, b: number) => (b === 0 || !Number.isFinite(a / b) ? null : a / b)

export const CALCULATOR_MODELS = {
  saas: {
    label: "SaaS-модель",
    subtitle: "Выручка, расходы и безубыточность подписки",
    inputs: [
      { key: "users", label: "Платящие пользователи", kind: "count", value: 650, min: 0, max: 10_000, step: 10 },
      { key: "price", label: "Стоимость подписки", kind: "money", value: 17, min: 1, max: 500, step: 1, suffix: "/ мес" },
      { key: "fixedCosts", label: "Фиксированные расходы", kind: "money", value: 1_120, min: 0, max: 50_000, step: 10, suffix: "/ мес" },
      { key: "variableCost", label: "Переменные расходы на клиента", kind: "money", value: 1.8, min: 0, max: 100, step: 0.1, suffix: "/ мес" },
      { key: "churn", label: "Отток клиентов", kind: "percent", value: 0, min: 0, max: 30, step: 0.5, suffix: "/ мес", optional: true },
      { key: "cac", label: "Стоимость привлечения (CAC)", kind: "money", value: 0, min: 0, max: 1_000, step: 1, optional: true },
    ],
    compute: (v) => {
      const mrr = v.users * v.price
      const costs = v.fixedCosts + v.variableCost * v.users
      const profit = mrr - costs
      const contribution = v.price - v.variableCost
      const breakEven = contribution > 0 ? Math.ceil(v.fixedCosts / contribution - 1e-9) : null
      const ltv = v.churn > 0 && contribution > 0 ? contribution / (v.churn / 100) : null
      const details: CalculatorOutput[] = [
        { key: "breakEven", label: "Точка безубыточности", value: breakEven, format: "count", noun: ["клиент", "клиента", "клиентов"], empty: "недостижима: цена ниже переменных расходов" },
        { key: "arr", label: "ARR (годовая выручка)", value: mrr * 12, format: "currency" },
        { key: "grossMargin", label: "Валовая маржа", value: v.price > 0 ? (contribution / v.price) * 100 : null, format: "percent" },
      ]
      if (ltv !== null) details.push({ key: "ltv", label: "LTV клиента", value: ltv, format: "currency" })
      if (ltv !== null && v.cac > 0) details.push({ key: "ltvCac", label: "LTV / CAC", value: ltv / v.cac, format: "ratio", tone: ltv / v.cac >= 3 ? "good" : "bad" })
      if (v.cac > 0) details.push({ key: "payback", label: "Окупаемость CAC", value: contribution > 0 ? v.cac / contribution : null, format: "months", empty: "не окупается" })
      return {
        headline: { key: "mrr", label: "Прогнозируемая выручка / месяц", value: mrr, format: "currency" },
        outputs: [
          { key: "mrr", label: "MRR", value: mrr, format: "currency" },
          { key: "costs", label: "Расходы", value: costs, format: "currency" },
          { key: "profit", label: "Остаток до налогов", value: profit, format: "currency", tone: profit >= 0 ? "good" : "bad" },
          { key: "margin", label: "Операционная маржа", value: mrr > 0 ? (profit / mrr) * 100 : null, format: "percent" },
        ],
        details,
        assumptions: [
          `Переменные расходы: {variableCost} на клиента`,
          "Остаток не учитывает налоги и другие неуказанные расходы.",
        ],
      }
    },
  },
  "unit-economics": {
    label: "Юнит-экономика",
    subtitle: "Продажи, валовая прибыль и точка безубыточности",
    inputs: [
      { key: "units", label: "Продажи в месяц", kind: "count", value: 500, min: 0, max: 100_000, step: 10 },
      { key: "price", label: "Цена за единицу", kind: "money", value: 40, min: 0.1, max: 10_000, step: 0.5 },
      { key: "unitCost", label: "Себестоимость единицы", kind: "money", value: 22, min: 0, max: 10_000, step: 0.5 },
      { key: "fixedCosts", label: "Фиксированные расходы", kind: "money", value: 5_000, min: 0, max: 1_000_000, step: 100, suffix: "/ мес" },
    ],
    compute: (v) => {
      const revenue = v.units * v.price
      const gross = v.units * (v.price - v.unitCost)
      const profit = gross - v.fixedCosts
      const contribution = v.price - v.unitCost
      return {
        headline: { key: "revenue", label: "Выручка / месяц", value: revenue, format: "currency" },
        outputs: [
          { key: "gross", label: "Валовая прибыль", value: gross, format: "currency" },
          { key: "grossMargin", label: "Валовая маржа", value: v.price > 0 ? (contribution / v.price) * 100 : null, format: "percent" },
          { key: "profit", label: "Операционная прибыль", value: profit, format: "currency", tone: profit >= 0 ? "good" : "bad" },
          { key: "margin", label: "Операционная маржа", value: revenue > 0 ? (profit / revenue) * 100 : null, format: "percent" },
        ],
        details: [
          { key: "breakEven", label: "Точка безубыточности", value: contribution > 0 ? Math.ceil(v.fixedCosts / contribution - 1e-9) : null, format: "count", noun: ["продажа", "продажи", "продаж"], empty: "недостижима: цена не выше себестоимости" },
        ],
        assumptions: ["Операционная прибыль до налогов, процентов и амортизации."],
      }
    },
  },
  loan: {
    label: "Кредит",
    subtitle: "Аннуитетный платёж и переплата",
    inputs: [
      { key: "principal", label: "Сумма кредита", kind: "money", value: 10_000_000, min: 100_000, max: 200_000_000, step: 100_000 },
      { key: "rate", label: "Ставка", kind: "percent", value: 18, min: 0, max: 60, step: 0.1, suffix: "годовых" },
      { key: "years", label: "Срок", kind: "years", value: 5, min: 1, max: 30, step: 1 },
    ],
    compute: (v) => {
      const months = Math.max(1, Math.round(v.years * 12))
      const r = v.rate / 100 / 12
      const payment = r === 0 ? v.principal / months : (v.principal * r) / (1 - Math.pow(1 + r, -months))
      const total = payment * months
      return {
        headline: { key: "payment", label: "Ежемесячный платёж", value: payment, format: "currency" },
        outputs: [
          { key: "total", label: "Всего выплат", value: total, format: "currency" },
          { key: "overpay", label: "Переплата", value: total - v.principal, format: "currency", tone: "bad" },
          { key: "months", label: "Платежей", value: months, format: "count" },
          { key: "share", label: "Доля переплаты", value: safeDiv(total - v.principal, v.principal) === null ? null : ((total - v.principal) / v.principal) * 100, format: "percent" },
        ],
        details: [],
        assumptions: ["Аннуитетная схема, фиксированная ставка, без комиссий и страховок банка."],
      }
    },
  },
  runway: {
    label: "Runway",
    subtitle: "На сколько месяцев хватит денег",
    inputs: [
      { key: "cash", label: "Деньги на счету", kind: "money", value: 120_000, min: 0, max: 50_000_000, step: 1_000 },
      { key: "burn", label: "Расходы в месяц", kind: "money", value: 18_000, min: 0, max: 5_000_000, step: 500 },
      { key: "revenue", label: "Выручка в месяц", kind: "money", value: 6_000, min: 0, max: 5_000_000, step: 500 },
      { key: "growth", label: "Рост выручки", kind: "percent", value: 5, min: 0, max: 50, step: 0.5, suffix: "/ мес" },
    ],
    compute: (v) => {
      let cash = v.cash
      let revenue = v.revenue
      let runway: number | null = null
      let profitableMonth: number | null = revenue >= v.burn ? 0 : null
      for (let month = 1; month <= 120; month += 1) {
        cash -= v.burn - revenue
        if (cash < 0 && runway === null && profitableMonth === null) { runway = month - 1; break }
        revenue *= 1 + v.growth / 100
        if (profitableMonth === null && revenue >= v.burn) profitableMonth = month
      }
      return {
        headline: { key: "runway", label: "Денег хватит на", value: runway, format: "months", empty: profitableMonth !== null ? "компания выходит в плюс раньше" : "более 10 лет" },
        outputs: [
          { key: "netBurn", label: "Чистый расход сейчас", value: v.burn - v.revenue, format: "currency", tone: v.burn - v.revenue > 0 ? "bad" : "good" },
          { key: "profitable", label: "Выход в плюс", value: profitableMonth, format: "months", empty: "не в пределах 10 лет" },
        ],
        details: [],
        assumptions: ["Расходы постоянные, выручка растёт с указанным темпом каждый месяц, без привлечения денег."],
      }
    },
  },
} satisfies Record<string, CalculatorModel>

export type CalculatorModelId = keyof typeof CALCULATOR_MODELS

export type CalculatorInputState = CalculatorInputDef & { value: number }

/** Merge the model's defaults with the block's ranges and starting values. */
export function calculatorInputs(model: CalculatorModelId, overrides: Record<string, { value: number; min?: number; max?: number; step?: number; label?: string }> = {}): CalculatorInputState[] {
  return CALCULATOR_MODELS[model].inputs
    .filter((input) => !(input as CalculatorInputDef).optional || overrides[input.key])
    .map((input) => {
      const own = overrides[input.key]
      const min = own?.min ?? Math.min(input.min, own?.value ?? input.min)
      const max = own?.max ?? Math.max(input.max, (own?.value ?? 0) * 2, own?.value ?? input.max)
      const step = own?.step && own.step > 0 ? own.step : input.step
      const value = clamp(own?.value ?? input.value, min, max)
      return { ...input, label: own?.label || input.label, min, max, step, value }
    })
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

/** Every input of the model, with zero for optional inputs left out. */
export function computeCalculator(model: CalculatorModelId, values: Values): CalculatorResult {
  const full: Values = {}
  for (const input of CALCULATOR_MODELS[model].inputs) {
    const value = values[input.key]
    full[input.key] = Number.isFinite(value) ? value : (input as CalculatorInputDef).optional ? 0 : input.value
  }
  return (CALCULATOR_MODELS[model].compute as (values: Values) => CalculatorResult)(full)
}
