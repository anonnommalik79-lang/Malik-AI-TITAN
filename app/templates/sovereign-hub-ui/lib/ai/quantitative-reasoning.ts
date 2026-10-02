/**
 * Detects explicit quantitative / formal-reasoning questions without routing
 * unrelated questions about model names, prices or media into a math workflow.
 * Runs locally; no extra provider calls or credentials.
 */
export type QuantitativeDomain = "arithmetic" | "algebra" | "geometry" | "physics" | "logic" | "statistics" | "chemistry" | "economics"
export type QuantitativeIntent = { domain: QuantitativeDomain; complex: boolean }

const DOMAINS: readonly [QuantitativeDomain, RegExp][] = [
  ["physics", /физик|механик|кинематик|динамик.*(сил|тел)|скорост.*(врем|ускорен|расстоян)|ускорен|импульс|джоул|ньютон|электрическ.*(цеп|ток)|закон\s+(?:ом|ньюто|кулон)|physics|kinematic|velocity|acceleration|newton.s law|kinetic energy|күш|жылдамдық/iu],
  ["algebra", /алгебр|уравнен|неравенств|систем.*уравнен|многочлен|квадратн.*(?:корн|уравнен)|реши\s+(?:для\s+)?[a-z]\s*[=+\-*/^]|algebra|equation|inequalit|polynomial|quadratic|теңдеу|теңсіздік/iu],
  ["geometry", /геометр|треугольник|окружност|периметр|площадь\s+(?:круг|фигур|треугольн)|теорем.*пифагор|геометрия|geometry|triangle|circumference|pythagor|үшбұрыш|ауданын/iu],
  ["statistics", /статистик|вероятност|дисперси|медиан[аы]|стандартн.*отклон|доверительн.*интервал|распределени.*вероятност|статистика|probability|statistics|variance|standard deviation|confidence interval|ықтималдық/iu],
  ["chemistry", /стехиометр|молярн|химическ.*(?:реакц|уравнен)|сбалансируй.*(?:реакц|уравнен)|химия.*(?:задач|расчет|расчёт)|stoichiometr|molar mass|balance.*chemical|химиялық.*(?:есеп|реакц)/iu],
  ["economics", /(?:рассчитай|посчитай|вычисли|calculate|compute).*(?:процент|прибыл|марж|ставк|инфляц|сложн.*процент)|(?:прибыл|марж|инфляц|сложн.*процент).*(?:формул|рассч|вычисл)|compound interest|net present value/iu],
  ["logic", /логическ.*(?:задач|вывод|ошибк|парадокс)|реши.*(?:головоломк|парадокс)|силлогизм|контрпример|формальн.*логик|булев.*алгебр|logic puzzle|logical deduction|syllogism|counterexample|truth table|логикалық.*есеп/iu],
  ["arithmetic", /математик|арифметик|посчитай|вычисли|сколько\s+будет|реши\s+(?:пример|задач)|найди\s+(?:значени|сумму|разност|произведени)|math(?:ematics)?|calculate|compute|evaluate\s+(?:the\s+)?(?:expression|\d)|solve\s+(?:this\s+)?(?:math|problem)|есепте|математика/iu],
]
const SYMBOLIC_EQUATION = /(?:^|\s)(?:[xyz]\s*(?:\^\s*[23]|[²³])|(?:\d+\s*)?[xyz]\s*[+\-])[\s\dxyz+*/^²³.−-]{0,60}=\s*[-+]?\d/iu
const EXPRESSION = /^\s*(?:сколько\s+будет\s*|what\s+is\s*|есепте\s*)?[−+\-]?(?:\d+(?:[.,]\d+)?|\(\s*\d+\s*\))\s*(?:[+\-−*/×÷^]|%\s*(?:от|of))\s*[−+\-]?\d+(?:[.,]\d+)?(?:\s*(?:[+\-−*/×÷^]|=)\s*\d+(?:[.,]\d+)?)?\s*[?!.]?\s*$/iu
const ADVANCED = /доказ|теорем|интеграл|производн|предел\s+функц|дифференциал|матрич|вектор|оптимизац|систем.*уравнен|неравенств|квадратн.*уравнен|вероятност|дисперси|стехиометр|формальн.*логик|парадокс|(?:нескольк|двух|трех|трёх).*этап|олимпиад|выведи\s+формул|prove|theorem|integral|derivative|limit\s+of|matrix|optimization|quadratic|system of equations|probability|stoichiometr|multi.step|deduction|дәлелде/iu

export function detectQuantitativeReasoning(value: unknown): QuantitativeIntent | null {
  const prompt = String(value || "").replace(/\s+/g, " ").trim()
  if (!prompt) return null
  const domain = DOMAINS.find(([, pattern]) => pattern.test(prompt))?.[0]
  if (!domain && !EXPRESSION.test(prompt) && !SYMBOLIC_EQUATION.test(prompt)) return null
  const selected = domain || (SYMBOLIC_EQUATION.test(prompt) ? "algebra" : "arithmetic")
  const complex = ADVANCED.test(prompt) || SYMBOLIC_EQUATION.test(prompt) || prompt.length >= 250 || /(?:^|[;:])\s*(?:\d+[.)]|[а-яa-z]+\s*=)/iu.test(prompt)
  return { domain: selected, complex }
}

/** User-facing solution structure, not a claim that executable verification ran. */
export function quantitativeSystemInstruction(intent: QuantitativeIntent): string {
  const foundation = [
    "[MALIK_QUANTITATIVE_REASONING]",
    "Solve the exact problem rather than producing a generic explanation. Prefer correctness over confident-sounding speed. Never make up theorem names, sources, calculations, tool runs or certainty.",
    "Identify givens, unknowns and constraints. State missing information when the problem is underdetermined, contradictory, or has multiple valid cases.",
    "Show the essential mathematical derivation or explanatory steps appropriate for the user's level, not private hidden chain-of-thought. For a tiny arithmetic question, respond directly.",
    "Privately cross-check the final result with an independent method when practical. If no computation tool actually ran, do not claim a numerical program or symbolic checker verified it.",
    "Use exact forms (fractions, radicals, symbolic expressions) when useful, distinguish exact from rounded values, specify units and rounding. Never invent precision.",
    "When a problem has no solution or insufficient information, say so and explain the decisive condition rather than fabricate one.",
  ]
  const perDomain: Record<QuantitativeDomain, string> = {
    arithmetic: "Respect operation order, signs, fractions and percentages. Independently estimate magnitude before finalizing.",
    algebra: "Track domains and excluded values, transformations and extraneous roots. Substitute each proposed root into the ORIGINAL equation; represent all valid cases.",
    geometry: "Define the diagram assumptions, relevant angle/length relationships and units. Do not infer unmarked properties from a drawing.",
    physics: "Specify the physical model and assumptions, use SI units where appropriate, check dimensional consistency, signs, limiting behavior and whether the numerical result is physically plausible.",
    logic: "Separate premises from conclusions. Test the inference with a counterexample or truth table where helpful; distinguish validity from factual truth of premises.",
    statistics: "Define the sample, random variables and assumptions. Distinguish correlation from causation and sample from population; give uncertainty and correct units.",
    chemistry: "Balance reactions and conservation constraints, track moles, mass, units, limiting reactants and conditions. Avoid unsupported experimental or safety claims.",
    economics: "State the period, currency, rates and compounding assumptions, calculate consistently and distinguish estimates from guaranteed outcomes.",
  }
  return [...foundation, perDomain[intent.domain], intent.complex
    ? "For this multi-step task, check each constraint and alternative case before the final result. Present a compact, comprehensible solution and a clearly marked answer."
    : "Keep simple tasks concise; do not inflate a one-line calculation into a long workflow.", "[/MALIK_QUANTITATIVE_REASONING]"].join("\n")
}
