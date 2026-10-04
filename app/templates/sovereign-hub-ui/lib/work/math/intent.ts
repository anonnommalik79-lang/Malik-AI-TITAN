import type { MathTask } from "./engine"

/**
 * Finds a computation in a chat message and writes it as an engine task:
 * «реши x² − 5x + 6 = 0», «производная x^3·sin x», «интеграл от 0 до π
 * sin x dx», «переведи 100 км/ч в м/с», «сколько будет 2^64». Only explicit,
 * well-formed requests become tasks — a word problem stays with the model,
 * and nothing here guesses a formula. Runs locally, no model call.
 */

/**
 * `explicit`: the person asked for a computation in words («реши», «вычисли»),
 * so even an engine refusal is worth reporting. A bare expression is only
 * reported when the engine computed it.
 */
export type MathIntent = { task: MathTask; source: string; explicit: boolean }

const UNIT_WORDS: Array<[RegExp, string]> = [
  [/км\/ч/giu, "km/h"], [/м\/с\^?2|м\/с²/giu, "m/s^2"], [/м\/с/giu, "m/s"],
  [/кВт[·*⋅]?ч/giu, "kWh"], [/Вт[·*⋅]?ч/giu, "Wh"],
  [/°\s?C|℃|градус(?:а|ов)?\s+Цельси(?:я|ю)/giu, "degC"], [/°\s?F|℉|градус(?:а|ов)?\s+Фаренгейт(?:а|у)?/giu, "degF"],
  [/кельвин\p{L}{0,3}(?!\p{L})/giu, "K"],
  [/километр\p{L}{0,3}(?!\p{L})/giu, "km"], [/сантиметр\p{L}{0,3}(?!\p{L})/giu, "cm"], [/миллиметр\p{L}{0,3}(?!\p{L})/giu, "mm"], [/метр\p{L}{0,3}(?!\p{L})/giu, "m"],
  [/килограмм\p{L}{0,3}(?!\p{L})/giu, "kg"], [/грамм\p{L}{0,3}(?!\p{L})/giu, "g"], [/тонн\p{L}{0,3}(?!\p{L})/giu, "tonne"],
  [/секунд\p{L}{0,3}(?!\p{L})/giu, "s"], [/минут\p{L}{0,3}(?!\p{L})/giu, "minute"], [/час\p{L}{0,3}(?!\p{L})/giu, "h"], [/сут(?:ки|ок)/giu, "day"],
  [/литр\p{L}{0,3}(?!\p{L})/giu, "L"], [/миллилитр\p{L}{0,3}(?!\p{L})/giu, "mL"],
  [/мил(?:ях|ями|ям|ь|я|и|е|ю)(?!\p{L})/giu, "mile"], [/фут\p{L}{0,3}(?!\p{L})/giu, "ft"], [/дюйм\p{L}{0,3}(?!\p{L})/giu, "inch"], [/ярд\p{L}{0,3}(?!\p{L})/giu, "yard"],
  [/фунт\p{L}{0,3}(?!\p{L})/giu, "lbm"], [/унци(?:я|и|й)/giu, "oz"], [/галлон\p{L}{0,3}(?!\p{L})/giu, "gal"],
  [/ньютон\p{L}{0,3}(?!\p{L})/giu, "N"], [/джоул(?:ь|я|ей)/giu, "J"], [/ватт\p{L}{0,3}(?!\p{L})/giu, "W"], [/паскал(?:ь|я|ей)/giu, "Pa"],
  [/(?<![\p{L}])кН(?![\p{L}])/gu, "kN"], [/(?<![\p{L}])МН(?![\p{L}])/gu, "MN"], [/(?<![\p{L}])Н(?![\p{L}])/gu, "N"],
  [/(?<![\p{L}])кДж(?![\p{L}])/gu, "kJ"], [/(?<![\p{L}])МДж(?![\p{L}])/gu, "MJ"], [/(?<![\p{L}])Дж(?![\p{L}])/gu, "J"],
  [/(?<![\p{L}])МВт(?![\p{L}])/gu, "MW"], [/(?<![\p{L}])кВт(?![\p{L}])/gu, "kW"], [/(?<![\p{L}])Вт(?![\p{L}])/gu, "W"],
  [/(?<![\p{L}])МПа(?![\p{L}])/gu, "MPa"], [/(?<![\p{L}])кПа(?![\p{L}])/gu, "kPa"], [/(?<![\p{L}])Па(?![\p{L}])/gu, "Pa"],
  [/(?<![\p{L}])атм(?![\p{L}])/gu, "atm"], [/(?<![\p{L}])бар(?![\p{L}])/gu, "bar"],
  [/(?<![\p{L}])ГГц(?![\p{L}])/gu, "GHz"], [/(?<![\p{L}])МГц(?![\p{L}])/gu, "MHz"], [/(?<![\p{L}])кГц(?![\p{L}])/gu, "kHz"], [/(?<![\p{L}])Гц(?![\p{L}])/gu, "Hz"],
  [/(?<![\p{L}])мА(?![\p{L}])/gu, "mA"], [/(?<![\p{L}])кВ(?![\p{L}])/gu, "kV"], [/(?<![\p{L}])В(?![\p{L}])/gu, "V"], [/(?<![\p{L}])А(?![\p{L}])/gu, "A"], [/(?<![\p{L}])Ом(?![\p{L}])/gu, "ohm"],
  [/(?<![\p{L}])эВ(?![\p{L}])/gu, "eV"], [/(?<![\p{L}])ккал(?![\p{L}])/gu, "kcal"], [/(?<![\p{L}])кал(?![\p{L}])/gu, "cal"], [/(?<![\p{L}])моль(?![\p{L}])/gu, "mol"],
  [/(?<![\p{L}])км(?![\p{L}])/gu, "km"], [/(?<![\p{L}])см(?![\p{L}])/gu, "cm"], [/(?<![\p{L}])мм(?![\p{L}])/gu, "mm"], [/(?<![\p{L}])м(?![\p{L}])/gu, "m"],
  [/(?<![\p{L}])кг(?![\p{L}])/gu, "kg"], [/(?<![\p{L}])мг(?![\p{L}])/gu, "mg"], [/(?<![\p{L}])г(?![\p{L}])/gu, "g"], [/(?<![\p{L}])т(?![\p{L}])/gu, "tonne"],
  [/(?<![\p{L}])мин(?![\p{L}])/gu, "minute"], [/(?<![\p{L}])ч(?![\p{L}])/gu, "h"], [/(?<![\p{L}])сек(?![\p{L}])/gu, "s"], [/(?<![\p{L}])с(?![\p{L}])/gu, "s"], [/(?<![\p{L}])мс(?![\p{L}])/gu, "ms"],
  [/(?<![\p{L}])мл(?![\p{L}])/gu, "mL"], [/(?<![\p{L}])л(?![\p{L}])/gu, "L"], [/(?<![\p{L}])К(?![\p{L}])/gu, "K"],
]

/** Cyrillic unit names → mathjs units, only inside the extracted value. */
function units(text: string) {
  let result = text
  for (const [pattern, unit] of UNIT_WORDS) result = result.replace(pattern, ` ${unit} `)
  return result.replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").replace(/\s*\^\s*/g, "^").trim()
}

const WORD_OPERATORS: Array<[RegExp, string]> = [
  [/квадратн\p{L}*\s+корень\s+из\s+/giu, "sqrt "], [/кубическ\p{L}*\s+корень\s+из\s+/giu, "cbrt "], [/корень\s+из\s+/giu, "sqrt "],
  [/\s+в\s+квадрате/giu, "^2"], [/\s+в\s+кубе/giu, "^3"], [/\s+в\s+степени\s+/giu, "^"],
  [/\s+(?:умножить|умноженное|умножь)\s+на\s+/giu, " * "], [/\s+(?:разделить|делить|поделить|делённое|деленное)\s+на\s+/giu, " / "],
  [/\s+плюс\s+/giu, " + "], [/\s+минус\s+/giu, " - "],
  [/(\d+)\s+факториал/giu, "$1!"], [/факториал\s+(\d+)/giu, "$1!"],
  [/(\d+(?:\.\d+)?)\s*%\s*(?:от|of)\s*(\d+(?:\.\d+)?)/giu, "($1/100)*$2"],
]

/** Typography and notation people use → mathjs syntax. */
export function normalizeMath(text: string): string {
  let value = String(text || "")
    .replace(/[×✕✖∙⋅·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/\*\*/g, "^")
    .replace(/²/g, "^2").replace(/³/g, "^3").replace(/⁴/g, "^4")
    .replace(/½/g, "(1/2)").replace(/¼/g, "(1/4)").replace(/¾/g, "(3/4)")
    .replace(/π/g, "pi").replace(/∞/g, "Infinity")
    .replace(/√\s*\(/g, "sqrt(")
    .replace(/√\s*(\d+(?:\.\d+)?|[a-zA-Z]\w*)/g, "sqrt($1)")
    .replace(/(\d),(\d)/g, "$1.$2")
  for (const [pattern, replacement] of WORD_OPERATORS) value = value.replace(pattern, replacement)
  value = value
    .replace(/\bsqrt\s+(\d+(?:\.\d+)?|[a-zA-Z]\w*)/g, "sqrt($1)")
    .replace(/\bcbrt\s+(\d+(?:\.\d+)?|[a-zA-Z]\w*)/g, "cbrt($1)")
    // Names from Russian textbooks: tg, ctg, ln, lg, arctg …
    .replace(/\b(arcsin|arccos|arctg|arctan|arcctg|ctg|tg|ln|lg)(?=\s*\(|\s+[a-zA-Z0-9])/g, (name) => ({ arcsin: "asin", arccos: "acos", arctg: "atan", arctan: "atan", arcctg: "acot", ctg: "cot", tg: "tan", ln: "log", lg: "log10" } as Record<string, string>)[name] || name)
    // sin x → sin(x) for a single argument written without brackets.
    .replace(/\b(sin|cos|tan|cot|asin|acos|atan|acot|log|log10|exp|sqrt|cbrt|abs)\s+([a-zA-Z]|\d+(?:\.\d+)?)(?![\w(])/g, "$1($2)")
  return value.replace(/\s+/g, " ").trim()
}

function stripTail(text: string) {
  return text
    .replace(/[,\s]+(?:пожалуйста|плиз|please|pls)\s*[?!.]*$/iu, "")
    .replace(/\s*(?:\?+|\.+|(?<![\d)])!+|=\s*\??|\s+равно\??)\s*$/u, "")
    .replace(/^[:\s]+/, "")
    .trim()
}

const MATHY = /[0-9a-zA-Z)\]]\s*[-+*/^=!]|[-+*/^]\s*[0-9a-zA-Z(]|\b(?:sqrt|sin|cos|tan|log|exp|abs)\(/

function interval(text: string): { rest: string; interval?: [number, number] } {
  const match = text.match(/\s*(?:на\s+(?:отрезке|интервале|промежутке)|on(?:\s+the)?\s+interval|on)\s*\[\s*(-?[\d.]+)\s*[;,]\s*(-?[\d.]+)\s*\]\s*$/iu)
  if (!match) return { rest: text }
  const a = Number(match[1])
  const b = Number(match[2])
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? { rest: text.slice(0, match.index).trim(), interval: [a, b] } : { rest: text }
}

function variableOf(text: string): { rest: string; variable?: string } {
  const match = text.match(/\s+(?:по|with\s+respect\s+to|wrt|относительно)\s+([a-zA-Z])\b\s*$/iu) || text.match(/\s+(?:по|with\s+respect\s+to|wrt|относительно)\s+([a-zA-Z])\b/iu)
  if (!match) return { rest: text }
  return { rest: (text.slice(0, match.index) + text.slice((match.index || 0) + match[0].length)).trim(), variable: match[1] }
}

function pointOf(text: string): { rest: string; at?: number } {
  const match = text.match(/\s*(?:в\s+точке|при|at)\s+(?:[a-zA-Z]\s*=\s*)?(-?[\d.]+(?:\/\d+)?|pi(?:\/\d+)?)\s*$/iu)
  if (!match) return { rest: text }
  const raw = match[1]
  const at = raw.startsWith("pi") ? Math.PI / Number(raw.split("/")[1] || 1) : raw.includes("/") ? Number(raw.split("/")[0]) / Number(raw.split("/")[1]) : Number(raw)
  return Number.isFinite(at) ? { rest: text.slice(0, match.index).trim(), at } : { rest: text }
}

function withoutFunctionName(text: string) {
  return text.replace(/^(?:функци[ия]\s+)?(?:[fgyh]\s*\(\s*[a-z]\s*\)|y)\s*=\s*/iu, "").trim()
}

const ORDER_WORDS: Array<[RegExp, number]> = [[/втор\p{L}*|second|2-?(?:ю|ая|ой|го)/iu, 2], [/трет\p{L}*|third|3-?(?:ю|ая|ей|го)/iu, 3], [/четв[её]рт\p{L}*|fourth|4-?(?:ю|ая|ой|го)/iu, 4]]

/**
 * The engine task a message asks for, or null. `text` is the person's
 * latest message, as typed.
 */
export function detectMathTask(text: string): MathIntent | null {
  const original = String(text || "").replace(/\s+/g, " ").trim()
  if (!original || original.length > 400) return null
  // Code is not arithmetic: «const x = a + b;», «=>», braces.
  if (/```|[{}]|=>|\b(?:const|let|var|function|def|return|import|class)\b/.test(original)) return null
  const normalized = normalizeMath(original)

  // Unit conversion: «переведи 100 км/ч в м/с».
  const conversion = normalized.match(/^(?:пожалуйста,?\s+)?(?:переведи(?:те)?|конвертируй(?:те)?|convert|вырази(?:те)?|сколько\s+будет)\s+(.+?)\s+(?:в|во|to|in|into)\s+([^\s?.!]+(?:\s*[/*^]\s*[^\s?.!]+)*)\s*[?.!]?$/iu)
  if (conversion && /\d/.test(conversion[1])) {
    return { task: { op: "convert", value: units(conversion[1]), to: units(conversion[2]) }, source: original, explicit: true }
  }

  // Derivative.
  const derivative = normalized.match(/^(?:пожалуйста,?\s+)?(?:найди(?:те)?|вычисли(?:те)?|посчитай(?:те)?|возьми(?:те)?|find|compute|calculate)?\s*(?:(втор\p{L}*|трет\p{L}*|четв[её]рт\p{L}*|second|third|fourth|\d-?\p{L}*)\s+)?(?:производн\p{L}*|derivative|туынды\p{L}*)\s*(?:(втор\p{L}*|трет\p{L}*|\d-?\p{L}*)\s+порядка\s*)?(?:от|of|функции|для|for)?\s*:?\s*(.+)$/iu)
    || normalized.match(/^(?:пожалуйста,?\s+)?(?:продифференцируй(?:те)?|differentiate|дифференцируй(?:те)?)\s*:?\s*(?:функцию\s+)?()()(.+)$/iu)
  if (derivative) {
    const orderWord = derivative[1] || derivative[2] || ""
    const order = ORDER_WORDS.find(([pattern]) => pattern.test(orderWord))?.[1] || 1
    let rest = stripTail(derivative[3])
    const point = pointOf(rest)
    rest = point.rest
    const variable = variableOf(rest)
    rest = withoutFunctionName(stripTail(variable.rest))
    if (rest && MATHY.test(rest) || /^[a-z](?:\^\d+)?$/i.test(rest)) {
      return { task: { op: "derivative", expression: rest, variable: variable.variable, order, at: point.at }, source: original, explicit: true }
    }
    return null
  }

  // Integral.
  const integral = normalized.match(/^(?:пожалуйста,?\s+)?(?:найди(?:те)?|вычисли(?:те)?|посчитай(?:те)?|возьми(?:те)?|find|compute|calculate|evaluate)?\s*(?:the\s+)?(?:определ[её]нн\p{L}+\s+|неопредел[её]нн\p{L}+\s+|definite\s+|indefinite\s+)?(?:интеграл\p{L}*|integral|integrate|∫|интеграл)\s*(.+)$/iu)
  if (integral) {
    const rest = stripTail(integral[1]).replace(/^(?:of|от\s+функции|функции)\s+/iu, "")
    const tex = rest.match(/^_\{?([^}^\s]+)\}?\s*\^\s*\{?([^}\s]+)\}?\s*(.+?)\s*d([a-z])$/i)
    if (tex) return { task: { op: "integrate", expression: tex[3], variable: tex[4], from: tex[1], to: tex[2] }, source: original, explicit: true }
    const boundsFirst = rest.match(/^(?:от|from)\s+(\S+)\s+(?:до|to)\s+(\S+?)\s+(?:(?:от|of)\s+)?(?:функции\s+)?(.+?)(?:\s*d([a-z]))?$/iu)
    if (boundsFirst) return { task: { op: "integrate", expression: boundsFirst[3], variable: boundsFirst[4], from: boundsFirst[1], to: boundsFirst[2] }, source: original, explicit: true }
    const boundsLast = rest.match(/^(.+?)(?:\s*d([a-z]))?\s*,?\s+(?:от|from)\s+(\S+)\s+(?:до|to)\s+(\S+)$/iu)
    if (boundsLast) return { task: { op: "integrate", expression: boundsLast[1], variable: boundsLast[2], from: boundsLast[3], to: boundsLast[4] }, source: original, explicit: true }
    const indefinite = rest.match(/^(.+?)\s*d([a-z])$/i) || (MATHY.test(rest) || /^[a-z](?:\^\d+)?$/i.test(rest) ? [rest, rest, undefined] : null)
    if (indefinite) return { task: { op: "integrate", expression: indefinite[1], variable: indefinite[2] || undefined }, source: original, explicit: true }
    return null
  }

  // Simplification.
  const simplify = normalized.match(/^(?:пожалуйста,?\s+)?(?:упрости(?:те)?|simplify|раскрой(?:те)?\s+скобки(?:\s+в)?|expand|ықшамда\p{L}*)\s*(?:выражение|expression)?\s*:?\s*(.+)$/iu)
  if (simplify) {
    const rest = stripTail(simplify[1])
    return MATHY.test(rest) ? { task: { op: "simplify", expression: rest }, source: original, explicit: true } : null
  }

  // Systems and equations.
  const solveCommand = normalized.match(/^(?:пожалуйста,?\s+)?(?:реши(?:те)?|решить|решение|найди(?:те)?\s+(?:корни|корень|решени\p{L}+|[a-z])|solve|find\s+(?:the\s+)?(?:roots?|solutions?)|теңдеуді\s+шеш\p{L}*|шеш\p{L}*)\s*(?:систему(?:\s+уравнений)?|system(?:\s+of\s+equations)?|уравнени[ея]|equation|теңдеу\p{L}*)?\s*:?\s*(.+)$/iu)
  const body = solveCommand ? stripTail(solveCommand[1]) : stripTail(normalized)
  const equals = (body.match(/=/g) || []).length
  if (equals >= 2) {
    const parts = body.split(/\s*(?:;|\n|,\s+|,(?=\s*[a-z0-9(-])|\s+и\s+|\s+and\s+)\s*/iu).map((part) => part.trim()).filter(Boolean)
    if (parts.length >= 2 && parts.every((part) => (part.match(/=/g) || []).length === 1 && /[a-z]/i.test(part) && !/[\p{Script=Cyrillic}]/u.test(part))) {
      return { task: { op: "system", equations: parts }, source: original, explicit: Boolean(solveCommand) }
    }
    return null
  }
  if (equals === 1) {
    const { rest, interval: range } = interval(body)
    const [left, right] = rest.split("=").map((part) => part.trim())
    if (!left || !right) return null
    // A bare «x = 5» is an assignment, not a question.
    const hasVariable = /(?:^|[^a-z])[a-z](?:[^a-z(]|$)/i.test(rest)
    const realEquation = MATHY.test(left) || MATHY.test(right) || /\(/.test(left)
    if (!hasVariable || (!solveCommand && !realEquation)) return null
    if (!solveCommand && /[\p{Script=Cyrillic}]/u.test(rest)) return null
    const variable = solveCommand?.[0].match(/найди(?:те)?\s+([a-z])\b/i)?.[1]
    return { task: { op: "solve", equation: rest, variable, interval: range }, source: original, explicit: Boolean(solveCommand) }
  }
  if (solveCommand && /(?:корни|корень|roots?)/iu.test(solveCommand[0]) && MATHY.test(body)) {
    return { task: { op: "solve", equation: `${body} = 0` }, source: original, explicit: true }
  }

  // Arithmetic and quantities: «сколько будет 17·23», «вычисли 5 кг * 9.81 м/с^2».
  const evaluate = normalized.match(/^(?:пожалуйста,?\s+)?(?:сколько\s+будет|вычисли(?:те)?|посчитай(?:те)?|подсчитай(?:те)?|рассчитай(?:те)?|calculate|compute|evaluate|what\s+is|what's|чему\s+равн\p{L}+|найди(?:те)?\s+значение(?:\s+выражения)?|есепте\p{L}*)\s*:?\s*(.+)$/iu)
  const candidate = evaluate ? stripTail(evaluate[1]) : stripTail(normalized)
  if (!candidate || candidate.length > 300) return null
  const expression = units(candidate)
  if (!/\d/.test(expression)) return null
  if (!evaluate) {
    // A whole message that is nothing but an expression: «2^64 - 1», «(3+4)*5 =».
    if (/[\p{Script=Cyrillic}]/u.test(candidate)) return null
    if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(candidate) || /^\+?\d[\d\s()-]{6,}$/.test(candidate)) return null
    const operators = (candidate.match(/[-+*/^!%]/g) || []).length
    const asked = /[=?]\s*$/.test(original)
    if (!(asked || /[+*^!%]/.test(candidate) || operators >= 2 || /\b(?:sqrt|cbrt|sin|cos|tan|cot|log|log10|log2|exp|abs)\(|\bto\b/.test(candidate))) return null
  }
  return { task: { op: "evaluate", expression }, source: original, explicit: Boolean(evaluate) }
}
