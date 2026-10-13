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

export type CalculatorInputKind = "money" | "count" | "percent" | "years" | "months" | "decimal"
export type CalculatorFormat = "currency" | "percent" | "count" | "months" | "years" | "ratio" | "decimal"

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

  "free-fall": {
    label: "Свободное падение",
    subtitle: "Падение без сопротивления воздуха из состояния покоя",
    inputs: [
      { key:"height",label:"Начальная высота (м)",kind:"decimal",value:80,min:0,max:100000,step:1 },
      { key:"gravity",label:"Ускорение g (м/с²)",kind:"decimal",value:9.81,min:0.1,max:30,step:0.01 },
    ],
    compute: (v) => {
      const ok=Number.isFinite(v.height)&&Number.isFinite(v.gravity)&&v.height>=0&&v.gravity>0
      return {
        headline:{key:"fallTime",label:"Время падения (с)",value:ok?Math.sqrt(2*v.height/v.gravity):null,format:"decimal"},
        outputs:[{key:"impactSpeed",label:"Скорость удара (м/с)",value:ok?Math.sqrt(2*v.gravity*v.height):null,format:"decimal"}],
        details:[],assumptions:["Нулевая начальная скорость; постоянное g; без сопротивления воздуха. Не использовать для решений по безопасности."],
      }
    },
  },
  "rc-transient": {
    label:"Переходный процесс RC",
    subtitle:"Заряд изначально разряженного конденсатора, идеальная цепь",
    inputs:[
      {key:"voltage",label:"Напряжение источника (В)",kind:"decimal",value:5,min:0,max:1000,step:0.1},
      {key:"resistance",label:"Сопротивление (Ом)",kind:"decimal",value:1000,min:0.001,max:1000000,step:1},
      {key:"capacitanceMicroF",label:"Ёмкость (мкФ)",kind:"decimal",value:1000,min:0.001,max:1000000,step:1},
      {key:"timeSeconds",label:"Время (с)",kind:"decimal",value:3,min:0,max:3600,step:0.1},
    ],
    compute:(v)=>{
      const tau=v.resistance*v.capacitanceMicroF*1e-6
      const ok=Object.values(v).every(Number.isFinite)&&v.voltage>=0&&v.resistance>0&&v.capacitanceMicroF>0&&v.timeSeconds>=0&&Number.isFinite(tau)&&tau>0
      const decay=ok?Math.exp(-v.timeSeconds/tau):null
      return {
        headline:{key:"capacitorVoltage",label:"Напряжение на конденсаторе (В)",value:decay===null?null:v.voltage*(1-decay),format:"decimal"},
        outputs:[
          {key:"timeConstant",label:"Постоянная времени (с)",value:ok?tau:null,format:"decimal"},
          {key:"chargingCurrent",label:"Ток заряда (А)",value:decay===null?null:v.voltage/v.resistance*decay,format:"decimal"},
        ],details:[],
        assumptions:["Идеальная RC-цепь, начальное Uc = 0. Uc(t) = U (1 - exp(-t/RC)). Модель, не эксперимент."],
      }
    },
  },
  "oil-water-cut": {
    label:"Обводнённость скважины",
    subtitle:"Только сопоставимые дебиты нефти и воды за один период",
    inputs:[
      {key:"oilRate",label:"Нефть (барр./сут)",kind:"decimal",value:100,min:0,max:1000000,step:1},
      {key:"waterRate",label:"Вода (барр./сут)",kind:"decimal",value:20,min:0,max:1000000,step:1},
    ],
    compute:(v)=>{
      const ok=Object.values(v).every(Number.isFinite)&&v.oilRate>=0&&v.waterRate>=0
      const total=ok?v.oilRate+v.waterRate:null
      return {
        headline:{key:"waterCut",label:"Обводнённость (%)",value:total!==null&&total>0?100*v.waterRate/total:null,format:"percent",empty:"отсутствует жидкостный дебит"},
        outputs:[
          {key:"liquidRate",label:"Жидкость (барр./сут)",value:total,format:"decimal"},
          {key:"wor",label:"Водонефтяное отношение (WOR)",value:ok&&v.oilRate>0?v.waterRate/v.oilRate:null,format:"decimal",empty:"не определено при нулевой нефти"},
        ],details:[],
        assumptions:["Одинаковые условия измерения и единицы дебитов за один период. История добычи не выводится из единственной точки."],
      }
    },
  },
  "oil-exponential-decline": {
    label:"Экспоненциальный спад дебита",
    subtitle:"Аналитический сценарий Арпса (b = 0), а не доказанный прогноз месторождения",
    inputs:[
      {key:"initialRate",label:"Начальный дебит (барр./сут)",kind:"decimal",value:100,min:0,max:1000000,step:1},
      {key:"declinePctPerDay",label:"Номинальный спад (%/сут)",kind:"decimal",value:0.5,min:0,max:10,step:0.01},
      {key:"days",label:"Длительность (сут)",kind:"decimal",value:180,min:0,max:3650,step:1},
    ],
    compute:(v)=>{
      const ok=Object.values(v).every(Number.isFinite)&&v.initialRate>=0&&v.declinePctPerDay>=0&&v.days>=0
      const d=v.declinePctPerDay/100
      const lost=ok?-Math.expm1(-d*v.days):null
      return {
        headline:{key:"rateAtEnd",label:"Дебит в конце периода (барр./сут)",value:lost===null?null:v.initialRate*(1-lost),format:"decimal"},
        outputs:[
          {key:"cumulative",label:"Накопленная добыча за период (барр.)",value:lost===null?null:d===0?v.initialRate*v.days:v.initialRate*lost/d,format:"decimal"},
          {key:"declineTotal",label:"Падение за период (%)",value:lost===null?null:lost*100,format:"percent"},
        ],details:[],
        assumptions:["q(t)=q₀ exp(-D t), D задан в %/сут. Сценарная кривая не является наблюдением, history matching или оценкой неопределённости."],
      }
    },
  },
  "projectile-motion": {
    label: "Движение тела под углом",
    subtitle: "Баллистика без сопротивления воздуха, одинаковая высота старта и финиша",
    inputs: [
      { key: "speed", label: "Начальная скорость (м/с)", kind: "decimal", value: 20, min: 0, max: 300, step: 0.1 },
      { key: "angleDegrees", label: "Угол броска (°)", kind: "decimal", value: 45, min: 0, max: 90, step: 0.5 },
      { key: "gravity", label: "Ускорение g (м/с²)", kind: "decimal", value: 9.81, min: 0.1, max: 30, step: 0.01 },
    ],
    compute: (v) => {
      const valid = v.speed >= 0 && v.angleDegrees >= 0 && v.angleDegrees <= 90 && v.gravity > 0
      const theta = v.angleDegrees * Math.PI / 180
      const flight = valid ? 2 * v.speed * Math.sin(theta) / v.gravity : null
      const range = valid ? v.speed * v.speed * Math.sin(2 * theta) / v.gravity : null
      const height = valid ? Math.pow(v.speed * Math.sin(theta), 2) / (2 * v.gravity) : null
      return {
        headline: { key: "range", label: "Горизонтальная дальность (м)", value: range, format: "decimal", empty: "недопустимые параметры" },
        outputs: [
          { key: "flight", label: "Время полёта (с)", value: flight, format: "decimal" },
          { key: "height", label: "Максимальная высота (м)", value: height, format: "decimal" },
          { key: "horizontalSpeed", label: "Горизонтальная скорость (м/с)", value: valid ? v.speed * Math.cos(theta) : null, format: "decimal" },
        ],
        details: [],
        assumptions: ["Постоянное g, плоская поверхность, без сопротивления воздуха, начальная и конечная высоты одинаковы. Результаты — расчёт модели, не измерения."],
      }
    },
  },
  "ohms-law": {
    label: "Закон Ома",
    subtitle: "Постоянный ток и идеальный резистор",
    inputs: [
      { key: "voltage", label: "Напряжение (В)", kind: "decimal", value: 12, min: 0, max: 10000, step: 0.1 },
      { key: "resistance", label: "Сопротивление (Ом)", kind: "decimal", value: 6, min: 0.001, max: 100000, step: 0.1 },
    ],
    compute: (v) => {
      const valid = v.resistance > 0 && v.voltage >= 0
      const current = valid ? v.voltage / v.resistance : null
      return {
        headline: { key: "current", label: "Сила тока (А)", value: current, format: "decimal", empty: "R должно быть больше нуля" },
        outputs: [
          { key: "power", label: "Мощность (Вт)", value: current === null ? null : v.voltage * current, format: "decimal" },
          { key: "conductance", label: "Проводимость (См)", value: valid ? 1 / v.resistance : null, format: "decimal" },
        ],
        details: [],
        assumptions: ["Постоянное напряжение, идеальный линейный резистор. Нет поправок на нагрев, допуски и перегрузку."],
      }
    },
  },
  "ideal-gas": {
    label: "Уравнение идеального газа",
    subtitle: "pV = nRT, только абсолютные давление и температура",
    inputs: [
      { key: "moles", label: "Количество вещества (моль)", kind: "decimal", value: 1, min: 0, max: 10000, step: 0.1 },
      { key: "temperatureK", label: "Температура (K)", kind: "decimal", value: 300, min: 0.1, max: 2000, step: 1 },
      { key: "pressurePa", label: "Давление абсолютное (Па)", kind: "decimal", value: 101325, min: 1, max: 10000000, step: 25 },
    ],
    compute: (v) => {
      const valid = v.moles >= 0 && v.temperatureK > 0 && v.pressurePa > 0
      const pv = valid ? v.moles * 8.31446261815324 * v.temperatureK : null
      const volume = pv === null ? null : pv / v.pressurePa
      return {
        headline: { key: "volumeL", label: "Объём газа (л)", value: volume === null ? null : volume * 1000, format: "decimal" },
        outputs: [
          { key: "volumeM3", label: "Объём газа (м³)", value: volume, format: "decimal" },
          { key: "pv", label: "Произведение pV (Дж)", value: pv, format: "decimal" },
        ],
        details: [],
        assumptions: ["Газ считается идеальным: Z = 1; R = 8.31446261815324 Дж/(моль·K). Не использовать для реального пластового газа без PVT/Z-коррекции."],
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
