import { add, sub, mul, div, neg, q, pow, type Q } from "../../work/math/rational"

/** Decimal text → exact rational. Never round through Number first. */
export function decimal(value: string): Q {
  // 1,000 can mean a decimal or English thousands. Without locale evidence
  // neither interpretation is a proof; ordinary 0,125 / 1,25 stay supported.
  if (/^[+-]?[1-9]\d{0,2},\d{3}$/u.test(value.trim())) throw new RangeError("Ambiguous numeric locale")
  const raw = value.trim().replace(/[ \u00a0\u202f]/gu, "").replace(",", ".").replace(/−/g, "-")
  if (!/^[+-]?\d{1,36}(?:\.\d{1,18})?$/.test(raw)) throw new RangeError("Unsupported decimal")
  const [whole, fraction = ""] = raw.replace(/^[+-]/, "").split(".")
  return q(BigInt((raw.startsWith("-") ? "-" : "") + whole + fraction), pow(q(10), fraction.length).n)
}

export const equal = (a: Q, b: Q) => a.n * b.d === b.n * a.d
export const less = (a: Q, b: Q) => a.n * b.d < b.n * a.d

/** Decimal half-away-from-zero, with an explicit output precision. */
export function rounded(value: Q, places = 2): string {
  if (!Number.isInteger(places) || places < 0 || places > 18) throw new RangeError("Precision")
  const scale = pow(q(10), places).n
  const negative = value.n < BigInt(0)
  const numerator = (negative ? -value.n : value.n) * scale
  let digits = numerator / value.d
  if ((numerator % value.d) * BigInt(2) >= value.d) digits += BigInt(1)
  const raw = digits.toString().padStart(places + 1, "0")
  const result = places ? `${raw.slice(0, -places)}.${raw.slice(-places)}` : raw
  return negative && digits !== BigInt(0) ? `-${result}` : result
}

export function exactText(value: Q): string {
  let d = value.d
  let twos = 0, fives = 0
  while (d % BigInt(2) === BigInt(0)) { d /= BigInt(2); twos++ }
  while (d % BigInt(5) === BigInt(0)) { d /= BigInt(5); fives++ }
  const places = Math.max(twos, fives)
  return d === BigInt(1) && places <= 18 ? rounded(value, places) : `${value.n}/${value.d}`
}

/** Safe recursive descent, no eval/functions/property access; bounded depth/work. */
export function evaluateDetailed(input: string): { value: Q | null; error?: "unsupported" | "division-by-zero" } {
  const unsupported = { value: null, error: "unsupported" as const }
  if (input.length > 512) return unsupported
  const text = input.replace(/−/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/")
  const pattern = /\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?|[()+*/%^-]/gu
  const tokens = text.match(pattern) || []
  if (!tokens.length || tokens.length > 128 || text.replace(pattern, "").trim()) return unsupported
  let index = 0, depth = 0, undefinedDivision = false
  const atom = (): Q => {
    if (++depth > 16) throw new RangeError("Depth")
    let result: Q
    const token = tokens[index++]
    if (token === "(") { result = sum(); if (tokens[index++] !== ")") throw new Error("Parenthesis") }
    else result = decimal(token || "")
    if (tokens[index] === "^") {
      index++
      const exponent = Number(tokens[index++])
      if (!Number.isInteger(exponent) || exponent < 0 || exponent > 12) throw new RangeError("Exponent")
      result = pow(result, exponent)
    }
    if (tokens[index] === "%") { index++; result = div(result, q(100)) }
    depth--
    return result
  }
  // Exponentiation precedes unary minus: -2^2 = -(2^2), (-2)^2 = 4.
  const unary = (): Q => {
    if (tokens[index] !== "+" && tokens[index] !== "-") return atom()
    if (++depth > 16) throw new RangeError("Depth")
    const negative = tokens[index++] === "-", value = unary()
    depth--
    return negative ? neg(value) : value
  }
  const product = (): Q => {
    let result = unary()
    while (tokens[index] === "*" || tokens[index] === "/") {
      const op = tokens[index++], rhs = unary()
      // Continue syntax validation; a malformed expression is NOT a proof.
      if (op === "/" && rhs.n === BigInt(0)) { undefinedDivision = true; result = q(0) }
      else result = op === "*" ? mul(result, rhs) : div(result, rhs)
    }
    return result
  }
  const sum = (): Q => {
    let result = product()
    while (tokens[index] === "+" || tokens[index] === "-") {
      const op = tokens[index++], rhs = product()
      result = op === "+" ? add(result, rhs) : sub(result, rhs)
    }
    return result
  }
  try {
    const result = sum()
    if (index !== tokens.length) return unsupported
    return undefinedDivision ? { value: null, error: "division-by-zero" } : { value: result }
  } catch { return unsupported }
}

export function evaluateExact(input: string): Q | null { return evaluateDetailed(input).value }

type Unit = { dimension: string; factor: string }
const UNITS: Record<string, Unit> = {
  м: { dimension: "length", factor: "1" }, m: { dimension: "length", factor: "1" },
  км: { dimension: "length", factor: "1000" }, km: { dimension: "length", factor: "1000" },
  см: { dimension: "length", factor: "0.01" }, cm: { dimension: "length", factor: "0.01" },
  мм: { dimension: "length", factor: "0.001" }, mm: { dimension: "length", factor: "0.001" },
  кг: { dimension: "mass", factor: "1" }, kg: { dimension: "mass", factor: "1" },
  г: { dimension: "mass", factor: "0.001" }, g: { dimension: "mass", factor: "0.001" },
  с: { dimension: "time", factor: "1" }, s: { dimension: "time", factor: "1" },
  мин: { dimension: "time", factor: "60" }, min: { dimension: "time", factor: "60" },
  ч: { dimension: "time", factor: "3600" }, h: { dimension: "time", factor: "3600" },
  "км/ч": { dimension: "speed", factor: "5/18" }, "km/h": { dimension: "speed", factor: "5/18" },
  "м/с": { dimension: "speed", factor: "1" }, "m/s": { dimension: "speed", factor: "1" },
  л: { dimension: "volume", factor: "1" }, l: { dimension: "volume", factor: "1" },
  мл: { dimension: "volume", factor: "0.001" }, ml: { dimension: "volume", factor: "0.001" },
}
export function unitDimension(unit: string): string | undefined { return UNITS[unit.toLowerCase()]?.dimension }
export function convertExact(value: string, from: string, to: string): Q | null {
  const a = UNITS[from.toLowerCase()], b = UNITS[to.toLowerCase()]
  if (!a || !b || a.dimension !== b.dimension) return null
  try { return div(mul(decimal(value), evaluateExact(a.factor)!), evaluateExact(b.factor)!) } catch { return null }
}
