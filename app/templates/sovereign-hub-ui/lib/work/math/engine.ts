import type { MathNode } from "mathjs"

import {
  ENGINE_LABEL,
  MathInputError,
  checkedParse,
  derivativeNode,
  exactInteger,
  highPrecision,
  isIntegerArithmetic,
  math,
  parse,
  polynomialRoot,
  rationalizeNode,
  simplifyNode,
} from "./sandbox"
import * as Q from "./rational"

/**
 * Malik math engine. Deterministic computation for the math, physics and
 * engineering skills: arithmetic with exact integers, units and dimensions,
 * equations (exact for polynomials up to degree 2, numeric with
 * verification otherwise), linear and small non-linear systems,
 * derivatives, definite integrals, simplification.
 *
 * Every result carries the checks that were actually run on it (a root is
 * substituted back into the original equation, a derivative is compared
 * with a finite difference, an integral with a second method). Nothing here
 * calls a model; what the engine cannot do it says it cannot do.
 */

export type MathTask =
  | { op: "evaluate"; expression: string; expectUnit?: string }
  | { op: "convert"; value: string; to: string }
  | { op: "solve"; equation: string; variable?: string; interval?: [number, number] }
  | { op: "system"; equations: string[] }
  | { op: "derivative"; expression: string; variable?: string; order?: number; at?: number }
  | { op: "integrate"; expression: string; variable?: string; from?: string; to?: string }
  | { op: "simplify"; expression: string }

export type MathOp = MathTask["op"]
export type MathCheck = { name: string; ok: boolean; detail: string }
export type MathValue = { label: string; value: string; exact?: string; tex?: string }

export type MathOutcome =
  | {
      ok: true
      op: MathOp
      engine: string
      /** What was computed, in words: «Решение уравнения x^2 − 5x + 6 = 0». */
      title: string
      /** The main result in one line. */
      answer: string
      values: MathValue[]
      steps: string[]
      checks: MathCheck[]
      notes: string[]
      ms: number
    }
  | { ok: false; op: MathOp; engine: string; code: string; error: string; ms: number }

/* ---------------------------------------------------------------- format */

type Complexish = { re: number; im: number }

function isComplex(value: unknown): value is Complexish {
  return Boolean(value && typeof value === "object" && math.isComplex(value))
}

export function formatNumber(value: number): string {
  if (Number.isNaN(value)) return "не определено"
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "−∞"
  if (Object.is(value, -0) || Math.abs(value) < 1e-300) return "0"
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value)
  return math.format(value, { precision: 12 })
}

function formatValue(value: unknown): string {
  if (typeof value === "number") return formatNumber(value)
  if (isComplex(value)) {
    if (Math.abs(value.im) < 1e-12 * Math.max(1, Math.abs(value.re))) return formatNumber(value.re)
    return math.format(value, { precision: 12 })
  }
  try {
    return math.format(value as never, { precision: 12 })
  } catch {
    return String(value)
  }
}

/** Pretty plain text of an expression node: «3x^2·sin(x)» rather than «3 * x ^ 2 * sin(x)». */
export function pretty(node: MathNode | string): string {
  const text = typeof node === "string" ? node : node.toString({ parenthesis: "auto", implicit: "hide" })
  return text
    .replace(/\s*\^\s*/g, "^")
    .replace(/(^|[\s(+\-,])(\d+(?:\.\d+)?)\s*\*\s*([a-zA-Z(])/g, "$1$2$3")
    .replace(/\s*\*\s*/g, "·")
    .replace(/\s+-\s+/g, " − ")
    .replace(/^-/, "−")
    .replace(/\blog\(([^(),]*)\)/g, "ln($1)")
}

function tex(node: MathNode): string | undefined {
  try {
    return node.toTex({ parenthesis: "auto", implicit: "hide" })
  } catch {
    return undefined
  }
}

/**
 * A closed form the number matches to 12 digits: a fraction, a rational
 * multiple of π or a square root. Found numerically — reported as such.
 */
export function recognize(value: number): string | undefined {
  if (!Number.isFinite(value) || Number.isInteger(value)) return undefined
  const fraction = Q.fromNumber(value, 10_000)
  if (fraction) return fraction.d === BigInt(1) ? undefined : Q.toText(fraction).replace(/^-/, "−")
  const piFraction = Q.fromNumber(value / Math.PI, 24)
  if (piFraction && !Q.isZero(piFraction)) {
    const n = piFraction.n.toString()
    const head = n === "1" ? "" : n === "-1" ? "−" : n.replace(/^-/, "−")
    return piFraction.d.toString() === "1" ? `${head}π` : `${head}π/${piFraction.d}`
  }
  const square = Q.fromNumber(value * value, 1_000)
  if (square && Q.sign(square) > 0) {
    const root = Q.sqrtQ(square)
    if (root && root.radicand > BigInt(1)) {
      const sign = value < 0 ? "−" : ""
      const coefficient = root.coefficient
      const n = coefficient.n.toString()
      const d = coefficient.d.toString()
      return `${sign}${n === "1" ? "" : n}√${root.radicand}${d === "1" ? "" : `/${d}`}`
    }
  }
  return undefined
}

/* ------------------------------------------------------------- functions */

type RealFn = (x: number) => number

/** A compiled function of one variable that answers NaN outside its real domain. */
function realFunction(node: MathNode, variable: string): RealFn {
  const code = node.compile()
  return (x: number) => {
    try {
      const value = code.evaluate({ [variable]: x })
      if (typeof value === "number") return value
      if (isComplex(value) && Math.abs(value.im) <= 1e-12 * Math.max(1, Math.abs(value.re))) return value.re
      return Number.NaN
    } catch {
      return Number.NaN
    }
  }
}

function scalar(node: MathNode): number {
  const value = node.compile().evaluate({})
  if (typeof value === "number") return value
  if (isComplex(value) && Math.abs(value.im) < 1e-12) return value.re
  throw new MathInputError("NOT_REAL", "Значение не является действительным числом.")
}

/** A constant expression for a bound or a point: «pi/2», «-inf», «3». */
export function constantValue(text: string | number | undefined, fallback?: number): number {
  if (text === undefined || text === "") {
    if (fallback === undefined) throw new MathInputError("MISSING", "Не хватает числа.")
    return fallback
  }
  if (typeof text === "number") return text
  const cleaned = String(text).trim().replace(/^\+?(?:inf|infinity|∞)$/i, "Infinity").replace(/^-(?:inf|infinity|∞)$/i, "-Infinity")
  const { node } = checkedParse(cleaned, "constants")
  return scalar(node)
}

function pickVariable(names: string[], hint?: string): string {
  if (hint) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(hint)) throw new MathInputError("VARIABLE", `Имя переменной «${hint}» не поддерживается.`)
    return hint
  }
  if (names.length === 1) return names[0]
  if (!names.length) return "x"
  for (const preferred of ["x", "t", "y", "z"]) if (names.includes(preferred)) return preferred
  throw new MathInputError("VARIABLE", `Непонятно, по какой переменной считать: ${names.join(", ")}.`)
}

/* -------------------------------------------------------------- evaluate */

const DIMENSION_SYMBOLS = ["кг", "м", "с", "А", "К", "кд", "моль", "рад", "бит"]
const SUPERSCRIPT: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }

/** The SI dimension of a unit: «кг·м·с⁻²». */
export function dimensionOf(unit: { dimensions: number[] }): string {
  const parts = unit.dimensions.map((power, index) => {
    if (!power) return ""
    const exponent = power === 1 ? "" : String(power).split("").map((char) => SUPERSCRIPT[char] || char).join("")
    return `${DIMENSION_SYMBOLS[index]}${exponent}`
  }).filter(Boolean)
  return parts.length ? parts.join("·") : "безразмерная"
}

type UnitLike = { dimensions: number[]; equalBase: (other: unknown) => boolean; toSI: () => unknown; to: (unit: string) => unknown; toNumber: (unit?: string) => number }

function isUnit(value: unknown): value is UnitLike {
  return Boolean(value && typeof value === "object" && math.isUnit(value))
}

function evaluate(task: { expression: string; expectUnit?: string }): Omit<Extract<MathOutcome, { ok: true }>, "ok" | "op" | "engine" | "ms"> {
  const { node } = checkedParse(task.expression, "units")
  const value = node.compile().evaluate({})
  const shown = pretty(node)
  const checks: MathCheck[] = []
  const notes: string[] = []
  const values: MathValue[] = []
  let answer = formatValue(value)

  if (isUnit(value)) {
    const si = value.toSI()
    values.push({ label: "Результат", value: answer, tex: tex(node) })
    values.push({ label: "В СИ", value: formatValue(si) })
    values.push({ label: "Размерность", value: dimensionOf(value) })
    if (task.expectUnit) {
      const { node: target } = checkedParse(task.expectUnit, "units")
      const expected = target.compile().evaluate({})
      const same = isUnit(expected) && value.equalBase(expected)
      checks.push({ name: "Размерность", ok: same, detail: same ? `совпадает с «${task.expectUnit}»` : `не совпадает: получено ${dimensionOf(value)}, ожидалось ${isUnit(expected) ? dimensionOf(expected) : task.expectUnit}` })
      if (same) {
        answer = formatValue(value.to(task.expectUnit))
        values[0] = { label: "Результат", value: answer }
      }
    } else checks.push({ name: "Размерность", ok: true, detail: `единицы согласованы (${dimensionOf(value)})` })
  } else if (typeof value === "number") {
    const integer = Number.isInteger(value) && isIntegerArithmetic(node) ? exactInteger(task.expression) : null
    if (integer && integer !== String(value)) answer = integer
    const exact = integer ? undefined : recognize(value)
    values.push({ label: "Результат", value: answer, exact, tex: tex(node) })
    if (exact) notes.push(`Точная форма ${exact} распознана численно (совпадение до 12 знаков).`)
    const second = highPrecision(task.expression)
    if (second !== null && Number.isFinite(value)) {
      const ok = Math.abs(second - value) <= 1e-9 * Math.max(1, Math.abs(value))
      checks.push({ name: "Повторный расчёт", ok, detail: ok ? "совпадает в 64-значной десятичной арифметике" : `расхождение: ${formatNumber(second)} при 64 знаках` })
    }
    if (!Number.isFinite(value)) notes.push("Результат не является конечным числом.")
  } else {
    values.push({ label: "Результат", value: answer, tex: tex(node) })
  }
  return { title: `Вычисление ${shown}`, answer, values, steps: [`${shown} = ${answer}`], checks, notes }
}

function convert(task: { value: string; to: string }) {
  const { node } = checkedParse(task.value, "units")
  const { node: target } = checkedParse(task.to, "units")
  const value = node.compile().evaluate({})
  const unit = target.compile().evaluate({})
  if (!isUnit(value) || !isUnit(unit)) throw new MathInputError("NOT_UNIT", "Для перевода нужна величина с единицей и целевая единица.")
  if (!value.equalBase(unit)) throw new MathInputError("DIMENSION", `Нельзя перевести: ${dimensionOf(value)} и ${dimensionOf(unit)} — разные размерности.`)
  const converted = value.to(task.to.trim())
  const answer = formatValue(converted)
  const back = (converted as UnitLike).toNumber(String((value as unknown as { formatUnits: () => string }).formatUnits()))
  const original = value.toNumber(String((value as unknown as { formatUnits: () => string }).formatUnits()))
  const ok = Math.abs(back - original) <= 1e-9 * Math.max(1, Math.abs(original))
  return {
    title: `Перевод ${pretty(node)} в ${task.to.trim()}`,
    answer: `${formatValue(value)} = ${answer}`,
    values: [{ label: "Результат", value: answer }, { label: "Размерность", value: dimensionOf(value) }],
    steps: [`${formatValue(value)} → ${answer}`],
    checks: [{ name: "Обратный перевод", ok, detail: ok ? "даёт исходное значение" : "не сходится" }],
    notes: [],
  }
}

/* ------------------------------------------------------------- equations */

function splitEquation(text: string): [string, string] {
  const source = String(text || "").replace(/==/g, "=")
  const parts = source.split("=")
  if (parts.length === 1) return [parts[0], "0"]
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) throw new MathInputError("EQUATION", "Нужно одно уравнение вида «левая часть = правая часть».")
  return [parts[0], parts[1]]
}

type Poly = { coefficients: number[]; denominator?: MathNode }

/** Polynomial (or rational) form in one variable, via mathjs rationalize. */
function asPolynomial(node: MathNode, variable: string): Poly | null {
  try {
    const result = rationalizeNode(node, {}, true) as unknown as { coefficients?: number[]; variables?: string[]; denominator?: MathNode }
    if (!Array.isArray(result.coefficients) || !result.coefficients.length) return null
    if (result.variables && (result.variables.length > 1 || (result.variables.length === 1 && result.variables[0] !== variable))) return null
    const coefficients = result.coefficients.map(Number)
    if (coefficients.some((value) => !Number.isFinite(value))) return null
    while (coefficients.length > 1 && coefficients[coefficients.length - 1] === 0) coefficients.pop()
    return { coefficients, denominator: result.denominator }
  } catch {
    return null
  }
}

type C = { re: number; im: number }
const cAdd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const cDiv = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
const cAbs = (a: C) => Math.hypot(a.re, a.im)

function cHorner(coefficients: number[], x: C): C {
  let result: C = { re: 0, im: 0 }
  for (let index = coefficients.length - 1; index >= 0; index -= 1) result = cAdd(cMul(result, x), { re: coefficients[index], im: 0 })
  return result
}

/** All complex roots of a polynomial (ascending coefficients), Durand–Kerner then Newton polish. */
function polynomialRoots(coefficients: number[]): C[] {
  const degree = coefficients.length - 1
  const lead = coefficients[degree]
  const monic = coefficients.map((value) => value / lead)
  let roots: C[] = Array.from({ length: degree }, (_, index) => {
    const angle = (2 * Math.PI * index) / degree + 0.4
    return { re: 0.9 * Math.cos(angle) * (1 + index / degree), im: 0.9 * Math.sin(angle) * (1 + index / degree) }
  })
  for (let iteration = 0; iteration < 800; iteration += 1) {
    let change = 0
    roots = roots.map((root, index) => {
      let denominator: C = { re: 1, im: 0 }
      roots.forEach((other, otherIndex) => { if (otherIndex !== index) denominator = cMul(denominator, cSub(root, other)) })
      const next = cSub(root, cDiv(cHorner(monic, root), denominator))
      change = Math.max(change, cAbs(cSub(next, root)))
      return next
    })
    if (change < 1e-15) break
  }
  const derivative = coefficients.slice(1).map((value, index) => value * (index + 1))
  return roots.map((root) => {
    let current = root
    for (let step = 0; step < 8; step += 1) {
      const slope = cHorner(derivative, current)
      if (cAbs(slope) < 1e-300) break
      const next = cSub(current, cDiv(cHorner(coefficients, current), slope))
      if (!Number.isFinite(next.re) || !Number.isFinite(next.im)) break
      current = next
    }
    return current
  })
}

/** Exact roots of a quadratic with rational coefficients, as text. */
function exactQuadratic(coefficients: number[]): { roots: string[]; discriminant: string } | null {
  const [c, b, a] = coefficients.map((value) => Q.fromNumber(value, 1_000_000))
  if (!a || !b || !c || Q.isZero(a)) return null
  const discriminant = Q.sub(Q.mul(b, b), Q.mul(Q.q(4), Q.mul(a, c)))
  const twoA = Q.mul(Q.q(2), a)
  const center = Q.div(Q.neg(b), twoA)
  const magnitude = Q.sqrtQ(Q.sign(discriminant) < 0 ? Q.neg(discriminant) : discriminant)
  if (!magnitude) return null
  const spread = Q.div(magnitude.coefficient, twoA.n < BigInt(0) ? Q.neg(twoA) : twoA)
  const D = Q.toText(discriminant)
  if (Q.isZero(discriminant)) return { roots: [Q.toText(center)], discriminant: D }
  if (magnitude.radicand === BigInt(1) && Q.sign(discriminant) > 0) {
    return { roots: [Q.toText(Q.sub(center, spread)), Q.toText(Q.add(center, spread))], discriminant: D }
  }
  const unit = Q.sign(discriminant) < 0 ? "i" : ""
  const radical = magnitude.radicand === BigInt(1)
    ? `${Q.toText(spread) === "1" && unit ? "" : Q.toText(spread)}${unit}`
    : `${spread.n === BigInt(1) ? "" : spread.n.toString()}√${magnitude.radicand}${spread.d === BigInt(1) ? "" : `/${spread.d}`}${unit}`
  const head = Q.isZero(center) ? "" : `${Q.toText(center).replace(/^-/, "−")} `
  return { roots: head ? [`${head}− ${radical}`, `${head}+ ${radical}`] : [`−${radical}`, radical], discriminant: D }
}

function polyText(coefficients: number[], variable: string): string {
  const terms: string[] = []
  for (let power = coefficients.length - 1; power >= 0; power -= 1) {
    const value = coefficients[power]
    if (!value) continue
    const magnitude = Math.abs(value)
    const coefficient = power > 0 && magnitude === 1 ? "" : formatNumber(magnitude)
    const body = power === 0 ? coefficient : `${coefficient}${variable}${power > 1 ? `^${power}` : ""}`
    terms.push(`${value < 0 ? "−" : terms.length ? "+" : ""} ${body}`.trim())
  }
  return (terms.join(" ") || "0").replace(/^\+ /, "")
}

/** Real roots of f on [a, b]: sign changes refined by bisection, and touching zeros. */
function scanRoots(f: RealFn, a: number, b: number, samples: number): number[] {
  const step = (b - a) / samples
  const xs: number[] = []
  const ys: number[] = []
  for (let index = 0; index <= samples; index += 1) {
    const x = a + index * step
    xs.push(x)
    ys.push(f(x))
  }
  const roots: number[] = []
  for (let index = 0; index < samples; index += 1) {
    const y0 = ys[index]
    const y1 = ys[index + 1]
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue
    if (y0 === 0) { roots.push(xs[index]); continue }
    if (y0 * y1 < 0) {
      let lo = xs[index]
      let hi = xs[index + 1]
      let flo = y0
      for (let iteration = 0; iteration < 200 && hi - lo > 1e-15 * Math.max(1, Math.abs(lo)); iteration += 1) {
        const mid = (lo + hi) / 2
        const fm = f(mid)
        if (!Number.isFinite(fm)) break
        if (fm === 0) { lo = hi = mid; break }
        if (flo * fm < 0) hi = mid
        else { lo = mid; flo = fm }
      }
      roots.push((lo + hi) / 2)
    }
  }
  // Zeros the curve only touches (sin x = 1): local minima of |f|.
  for (let index = 1; index < samples; index += 1) {
    const [left, here, right] = [Math.abs(ys[index - 1]), Math.abs(ys[index]), Math.abs(ys[index + 1])]
    if (![left, here, right].every(Number.isFinite)) continue
    if (!(here <= left && here <= right) || here > 1e-2) continue
    if (ys[index - 1] * ys[index + 1] < 0) continue
    let lo = xs[index - 1]
    let hi = xs[index + 1]
    const g = 0.6180339887498949
    for (let iteration = 0; iteration < 120; iteration += 1) {
      const m1 = hi - g * (hi - lo)
      const m2 = lo + g * (hi - lo)
      if (Math.abs(f(m1)) < Math.abs(f(m2))) hi = m2
      else lo = m1
    }
    const x = (lo + hi) / 2
    if (Math.abs(f(x)) < 1e-12) roots.push(x)
  }
  return roots
}

function dedupe(values: number[], tolerance = 1e-9): number[] {
  const sorted = [...values].sort((x, y) => x - y)
  const result: number[] = []
  for (const value of sorted) {
    if (!result.length || Math.abs(value - result[result.length - 1]) > tolerance * Math.max(1, Math.abs(value))) result.push(value)
  }
  return result.map((value) => (Math.abs(value) < 1e-13 ? 0 : value))
}

function rootText(value: number) {
  const exact = recognize(value)
  const shown = formatNumber(value)
  return exact && exact !== shown ? `${exact} ≈ ${shown}` : shown
}

function solve(task: { equation: string; variable?: string; interval?: [number, number] }) {
  const [leftText, rightText] = splitEquation(task.equation)
  const left = checkedParse(leftText, "variables")
  const right = checkedParse(rightText, "variables")
  const names = [...new Set([...left.names, ...right.names])].sort()
  const variable = pickVariable(names, task.variable)
  const parameters = names.filter((name) => name !== variable)
  if (parameters.length) throw new MathInputError("PARAMETERS", `В уравнении есть параметры (${parameters.join(", ")}); движок решает уравнения с одной неизвестной и числовыми коэффициентами.`)
  const difference = parse(`(${leftText}) - (${rightText})`)
  const lhs = realFunction(left.node, variable)
  const rhs = realFunction(right.node, variable)
  const shown = `${pretty(left.node)} = ${pretty(right.node)}`
  const steps: string[] = []
  const notes: string[] = []
  const checks: MathCheck[] = []

  const verify = (x: number) => {
    const l = lhs(x)
    const r = rhs(x)
    return Number.isFinite(l) && Number.isFinite(r) && Math.abs(l - r) <= 1e-8 * Math.max(1, Math.abs(l), Math.abs(r))
  }

  let real: number[] = []
  const complexRoots: C[] = []
  let exactRoots: string[] | null = null
  let method = ""
  let identity = false
  let interval = task.interval

  const poly = interval ? null : asPolynomial(difference, variable)
  if (poly && poly.coefficients.length - 1 <= 40) {
    const degree = poly.coefficients.length - 1
    steps.push(`Приводим к виду P(${variable}) = 0: ${polyText(poly.coefficients, variable)} = 0${poly.denominator ? ` (знаменатель ${pretty(poly.denominator)} ≠ 0)` : ""}.`)
    if (degree === 0) {
      identity = poly.coefficients[0] === 0
      method = identity ? "тождество" : "противоречие"
    } else if (degree === 1) {
      real = [-poly.coefficients[0] / poly.coefficients[1]]
      method = "линейное уравнение"
    } else if (degree === 2) {
      const quadratic = exactQuadratic(poly.coefficients)
      const roots = polynomialRoot(poly.coefficients[0], poly.coefficients[1], poly.coefficients[2]) as Array<number | Complexish>
      for (const root of roots) {
        if (typeof root === "number") real.push(root)
        else if (Math.abs(root.im) < 1e-12) real.push(root.re)
        else complexRoots.push({ re: root.re, im: root.im })
      }
      if (quadratic) {
        steps.push(`Дискриминант D = b² − 4ac = ${quadratic.discriminant}.`)
        exactRoots = quadratic.roots
      }
      method = "формула корней квадратного уравнения"
    } else {
      const roots = degree === 3
        ? (polynomialRoot(poly.coefficients[0], poly.coefficients[1], poly.coefficients[2], poly.coefficients[3]) as Array<number | Complexish>).map((root) => (typeof root === "number" ? { re: root, im: 0 } : { re: root.re, im: root.im }))
        : polynomialRoots(poly.coefficients)
      for (const root of roots) {
        if (Math.abs(root.im) <= 1e-9 * Math.max(1, Math.abs(root.re))) real.push(root.re)
        else complexRoots.push(root)
      }
      method = degree === 3 ? "формула Кардано (mathjs polynomialRoot)" : `численный поиск всех ${degree} корней многочлена (метод Дюрана — Кернера)`
    }
  } else {
    const [a, b] = interval || [-100, 100]
    if (!(Number.isFinite(a) && Number.isFinite(b) && b > a)) throw new MathInputError("INTERVAL", "Неверный отрезок поиска.")
    const f = realFunction(difference, variable)
    real = scanRoots(f, a, b, 40_000)
    if (!interval) {
      const wide = scanRoots(f, -10_000, 10_000, 40_000).filter((x) => x < a || x > b)
      real.push(...wide)
    }
    method = `численный поиск корней на ${interval ? `[${formatNumber(a)}; ${formatNumber(b)}]` : "[−10 000; 10 000]"} (смена знака + бисекция)`
    interval = interval || [a, b]
  }

  real = dedupe(real)
  const complex = complexRoots
    .sort((a, b) => a.re - b.re || a.im - b.im)
    .map((root) => formatValue(math.complex(Math.abs(root.re) < 1e-13 ? 0 : root.re, root.im)).replace(/^-/, "−").replace(/ - /g, " − "))
  const rejected = real.filter((x) => !verify(x))
  real = real.filter((x) => verify(x))
  if (rejected.length) notes.push(`Отброшены посторонние значения (не удовлетворяют исходному уравнению или вне области определения): ${rejected.map(formatNumber).join(", ")}.`)

  const many = real.length > 12
  if (many) {
    const window = real.filter((x) => x >= 0 && x < 2 * Math.PI)
    notes.push(`Найдено много корней (${real.length}+), вероятно уравнение периодическое; показаны корни на [0; 2π). Общий вид решения движок не выводит.`)
    real = window.length ? window : real.slice(0, 12)
  }

  steps.push(`Метод: ${method}.`)
  if (identity) {
    return { title: `Решение уравнения ${shown}`, answer: `Любое ${variable}${poly?.denominator ? ` (кроме нулей знаменателя ${pretty(poly.denominator)})` : ""}`, values: [], steps, checks: [{ name: "Тождество", ok: true, detail: "после упрощения обе части равны" }], notes }
  }
  const exactMatches = exactRoots && exactRoots.length === real.length + complex.length ? exactRoots : null
  const values: MathValue[] = real.map((x, index) => ({
    label: real.length > 1 ? `${variable}${toSubscript(index + 1)}` : variable,
    value: formatNumber(x),
    exact: exactMatches && !complex.length ? exactMatches[index] : recognize(x),
  }))
  const exactComplex = exactRoots && complex.length === exactRoots.length && !real.length ? exactRoots : null
  complex.forEach((value, index) => values.push({ label: `${variable} (компл.)`, value, exact: exactComplex?.[index] }))
  if (complex.length) {
    const code = difference.compile()
    const ok = complex.every((text) => {
      try {
        const root = math.complex(text.replace(/\s*−\s*/g, (match, offset) => (offset ? " - " : "-")))
        const residual = Number(math.abs(code.evaluate({ [variable]: root }) as never))
        const size = Number(math.abs(root as never))
        return residual <= 1e-8 * Math.max(1, size * size)
      } catch {
        return false
      }
    })
    checks.push({ name: "Подстановка (комплексные корни)", ok, detail: ok ? "комплексные корни обращают уравнение в ноль" : "подстановка комплексных корней не сошлась" })
  }
  if (real.length) {
    checks.push({ name: "Подстановка", ok: true, detail: `каждый корень подставлен в исходное уравнение: левая и правая части совпадают (${real.map((x) => `${variable}=${formatNumber(x)}`).join(", ")})` })
  }
  if (!real.length && !complex.length) {
    notes.push(interval ? `Действительных корней на [${formatNumber(interval[0])}; ${formatNumber(interval[1])}] не найдено.` : "Действительных корней нет.")
  }
  if (complex.length && !real.length) notes.push("Действительных корней нет, только комплексные.")
  if (interval && !task.interval && real.length) notes.push("Корни найдены численно; за пределами отрезка поиска корни не исключены.")
  const answer = real.length
    ? real.map((x, index) => `${values[index].label} = ${values[index].exact && values[index].exact !== formatNumber(x) ? `${values[index].exact} ≈ ${formatNumber(x)}` : formatNumber(x)}`).join("; ") + (complex.length ? `; комплексные: ${complex.join("; ")}` : "")
    : complex.length ? `Комплексные корни: ${(exactComplex || complex).join("; ")}` : "Корней нет"
  return { title: `Решение уравнения ${shown}`, answer, values, steps, checks, notes }
}

function toSubscript(index: number) {
  return String(index).split("").map((digit) => "₀₁₂₃₄₅₆₇₈₉"[Number(digit)]).join("")
}

/* --------------------------------------------------------------- systems */

function system(task: { equations: string[] }) {
  const equations = task.equations.map((text) => String(text || "").trim()).filter(Boolean)
  if (equations.length < 2 || equations.length > 6) throw new MathInputError("SYSTEM", "Система должна содержать от 2 до 6 уравнений.")
  const parsed = equations.map((text) => {
    const [l, r] = splitEquation(text)
    const left = checkedParse(l, "variables")
    const right = checkedParse(r, "variables")
    return { text, left, right, difference: parse(`(${l}) - (${r})`), names: [...left.names, ...right.names] }
  })
  const variables = [...new Set(parsed.flatMap((item) => item.names))].sort()
  if (!variables.length || variables.length > 6) throw new MathInputError("SYSTEM", "Нужно от 1 до 6 неизвестных.")
  const zero = Object.fromEntries(variables.map((name) => [name, 0]))
  const steps: string[] = []
  const notes: string[] = []

  // Linear when every partial derivative is a number.
  const rows: number[][] = []
  const rhs: number[] = []
  let linear = true
  for (const item of parsed) {
    const row: number[] = []
    for (const name of variables) {
      const partial = derivativeNode(item.difference, name)
      const free = new Set<string>()
      partial.traverse((node: MathNode) => { if (node.type === "SymbolNode" && variables.includes((node as unknown as { name: string }).name)) free.add((node as unknown as { name: string }).name) })
      if (free.size) { linear = false; break }
      row.push(scalar(partial))
    }
    if (!linear) break
    rows.push(row)
    rhs.push(-(item.difference.compile().evaluate(zero) as number))
  }

  const verify = (point: Record<string, number>) => parsed.every((item) => {
    const l = item.left.node.compile().evaluate(point)
    const r = item.right.node.compile().evaluate(point)
    return typeof l === "number" && typeof r === "number" && Math.abs(l - r) <= 1e-8 * Math.max(1, Math.abs(l), Math.abs(r))
  })

  if (linear) {
    steps.push(`Система линейная: ${variables.length} неизвестных, ${parsed.length} уравнений.`)
    const exact = rows.every((row) => row.every((value) => Q.fromNumber(value))) && rhs.every((value) => Q.fromNumber(value))
    const result = exact ? gaussExact(rows.map((row) => row.map((value) => Q.fromNumber(value)!)), rhs.map((value) => Q.fromNumber(value)!)) : gaussFloat(rows, rhs)
    steps.push(`Метод: исключение Гаусса${exact ? " в точных дробях" : ""}.`)
    if (result.kind === "none") return { title: "Решение системы", answer: "Решений нет (система несовместна)", values: [], steps, checks: [{ name: "Ранг", ok: true, detail: "ранг расширенной матрицы больше ранга матрицы коэффициентов" }], notes }
    if (result.kind === "many") return { title: "Решение системы", answer: "Бесконечно много решений", values: [], steps, checks: [{ name: "Ранг", ok: true, detail: `ранг ${result.rank} меньше числа неизвестных ${variables.length}` }], notes }
    const point = Object.fromEntries(variables.map((name, index) => [name, result.values[index]]))
    const ok = verify(point)
    const values = variables.map((name, index) => ({ label: name, value: formatNumber(result.values[index]), exact: result.exact?.[index] }))
    return {
      title: "Решение системы",
      answer: values.map((value) => `${value.label} = ${value.exact && value.exact !== value.value ? value.exact : value.value}`).join("; "),
      values,
      steps,
      checks: [{ name: "Подстановка", ok, detail: ok ? "решение подставлено во все уравнения" : "подстановка не сошлась" }],
      notes,
    }
  }

  if (variables.length > 3) throw new MathInputError("NONLINEAR", "Нелинейные системы движок решает только для 2–3 неизвестных.")
  steps.push("Система нелинейная: метод Ньютона из сетки начальных точек.")
  const fns = parsed.map((item) => item.difference.compile())
  const jacobian = parsed.map((item) => variables.map((name) => derivativeNode(item.difference, name).compile()))
  const starts = [-10, -3, -1, 0.5, 1, 3, 10]
  const grid: number[][] = variables.reduce<number[][]>((acc) => acc.flatMap((prefix) => starts.map((value) => [...prefix, value])), [[]])
  const found: number[][] = []
  for (const start of grid) {
    let x = [...start]
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const point = Object.fromEntries(variables.map((name, index) => [name, x[index]]))
      const F = fns.map((fn) => fn.evaluate(point) as number)
      if (F.some((value) => typeof value !== "number" || !Number.isFinite(value))) break
      if (Math.max(...F.map(Math.abs)) < 1e-13) break
      const J = jacobian.map((row) => row.map((fn) => fn.evaluate(point) as number))
      const step = gaussFloat(J, F.map((value) => -value))
      if (step.kind !== "one") break
      x = x.map((value, index) => value + step.values[index])
      if (x.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e8)) break
    }
    const point = Object.fromEntries(variables.map((name, index) => [name, x[index]]))
    if (x.every(Number.isFinite) && verify(point) && !found.some((other) => other.every((value, index) => Math.abs(value - x[index]) < 1e-7 * Math.max(1, Math.abs(value))))) found.push(x.map((value) => (Math.abs(value) < 1e-12 ? 0 : value)))
  }
  found.sort((a, b) => a[0] - b[0] || (a[1] || 0) - (b[1] || 0))
  notes.push(`Решения найдены численно из ${grid.length} начальных точек; другие решения не исключены.`)
  const values = found.flatMap((x, index) => variables.map((name, column) => ({ label: `${name}${found.length > 1 ? toSubscript(index + 1) : ""}`, value: formatNumber(x[column]), exact: recognize(x[column]) })))
  return {
    title: "Решение системы",
    answer: found.length ? found.map((x) => `(${variables.map((name, column) => `${name} = ${rootText(x[column])}`).join(", ")})`).join("; ") : "Действительных решений не найдено",
    values,
    steps,
    checks: found.length ? [{ name: "Подстановка", ok: true, detail: "каждое решение подставлено во все уравнения" }] : [],
    notes,
  }
}

type GaussResult = { kind: "one"; values: number[]; exact?: string[] } | { kind: "none" } | { kind: "many"; rank: number }

function gaussFloat(matrix: number[][], vector: number[]): GaussResult {
  const rows = matrix.length
  const columns = matrix[0]?.length || 0
  const a = matrix.map((row, index) => [...row, vector[index]])
  let rank = 0
  const pivots: number[] = []
  for (let column = 0; column < columns && rank < rows; column += 1) {
    let best = rank
    for (let row = rank + 1; row < rows; row += 1) if (Math.abs(a[row][column]) > Math.abs(a[best][column])) best = row
    if (Math.abs(a[best][column]) < 1e-12) continue
    ;[a[rank], a[best]] = [a[best], a[rank]]
    for (let row = 0; row < rows; row += 1) {
      if (row === rank) continue
      const factor = a[row][column] / a[rank][column]
      for (let k = column; k <= columns; k += 1) a[row][k] -= factor * a[rank][k]
    }
    pivots.push(column)
    rank += 1
  }
  for (let row = rank; row < rows; row += 1) if (Math.abs(a[row][columns]) > 1e-9) return { kind: "none" }
  if (rank < columns) return { kind: "many", rank }
  const values = new Array(columns).fill(0)
  pivots.forEach((column, row) => { values[column] = a[row][columns] / a[row][column] })
  return { kind: "one", values }
}

function gaussExact(matrix: Q.Q[][], vector: Q.Q[]): GaussResult {
  const rows = matrix.length
  const columns = matrix[0]?.length || 0
  const a = matrix.map((row, index) => [...row, vector[index]])
  let rank = 0
  const pivots: number[] = []
  for (let column = 0; column < columns && rank < rows; column += 1) {
    let pivot = -1
    for (let row = rank; row < rows; row += 1) if (!Q.isZero(a[row][column])) { pivot = row; break }
    if (pivot < 0) continue
    ;[a[rank], a[pivot]] = [a[pivot], a[rank]]
    for (let row = 0; row < rows; row += 1) {
      if (row === rank || Q.isZero(a[row][column])) continue
      const factor = Q.div(a[row][column], a[rank][column])
      for (let k = column; k <= columns; k += 1) a[row][k] = Q.sub(a[row][k], Q.mul(factor, a[rank][k]))
    }
    pivots.push(column)
    rank += 1
  }
  for (let row = rank; row < rows; row += 1) if (!Q.isZero(a[row][columns])) return { kind: "none" }
  if (rank < columns) return { kind: "many", rank }
  const exact: Q.Q[] = new Array(columns).fill(Q.ZERO)
  pivots.forEach((column, row) => { exact[column] = Q.div(a[row][columns], a[row][column]) })
  return { kind: "one", values: exact.map(Q.toNumber), exact: exact.map(Q.toText) }
}

/* ------------------------------------------------------------- calculus */

const SAMPLE_POINTS = [0.731, 1.37, -0.618, 2.29, -1.83, 3.7, 0.113]

function derivative(task: { expression: string; variable?: string; order?: number; at?: number }) {
  const { node, names } = checkedParse(task.expression, "variables")
  const variable = pickVariable(names, task.variable)
  const order = Math.max(1, Math.min(4, Math.floor(task.order || 1)))
  let current = node
  const steps: string[] = []
  const checks: MathCheck[] = []
  for (let level = 1; level <= order; level += 1) {
    const raw = derivativeNode(current, variable)
    let next: MathNode = raw
    try { next = simplifyNode(raw) } catch { next = raw }
    // Check this level against a finite difference of the previous one.
    const previous = realFunction(current, variable)
    const exact = realFunction(next, variable)
    let tested = 0
    let ok = true
    for (const x of SAMPLE_POINTS) {
      const h = 1e-5 * Math.max(1, Math.abs(x))
      const numeric = (previous(x + h) - previous(x - h)) / (2 * h)
      const symbolic = exact(x)
      if (!Number.isFinite(numeric) || !Number.isFinite(symbolic)) continue
      tested += 1
      if (Math.abs(numeric - symbolic) > 1e-4 * Math.max(1, Math.abs(symbolic))) ok = false
      if (tested === 3) break
    }
    checks.push({ name: order > 1 ? `Производная порядка ${level}` : "Численная проверка", ok: tested > 0 && ok, detail: tested ? (ok ? `совпадает с конечной разностью в ${tested} точках` : "не совпала с конечной разностью") : "не удалось проверить: функция не определена в контрольных точках" })
    steps.push(`${order > 1 ? `f${"′".repeat(level)}` : "f′"}(${variable}) = ${pretty(next)}`)
    current = next
  }
  const values: MathValue[] = [{ label: `f${"′".repeat(order)}(${variable})`, value: pretty(current), tex: tex(current) }]
  let answer = `f${"′".repeat(order)}(${variable}) = ${pretty(current)}`
  if (task.at !== undefined) {
    const value = realFunction(current, variable)(task.at)
    values.push({ label: `f${"′".repeat(order)}(${formatNumber(task.at)})`, value: formatNumber(value), exact: recognize(value) })
    answer += `; при ${variable} = ${formatNumber(task.at)}: ${formatNumber(value)}`
  }
  return { title: `Производная ${pretty(node)} по ${variable}`, answer, values, steps, checks, notes: [] as string[] }
}

/**
 * Tanh–sinh quadrature on [a, b]. Points near the ends are placed by their
 * distance to the end, so a singularity there (1/√x at 0) is never hit.
 * Returns the estimate and the change at the last refinement.
 */
function tanhSinh(f: RealFn, a: number, b: number): { value: number; error: number } | null {
  const half = (b - a) / 2
  let h = 1
  let previous = Number.NaN
  let estimate = Number.NaN
  let error = Number.POSITIVE_INFINITY
  for (let level = 0; level < 12; level += 1) {
    let sum = 0
    const limit = Math.ceil(4 / h)
    for (let k = -limit; k <= limit; k += 1) {
      if (level > 0 && k % 2 === 0) continue
      const t = k * h
      const u = (Math.PI / 2) * Math.sinh(t)
      const weight = ((Math.PI / 2) * Math.cosh(t)) / (Math.cosh(u) ** 2)
      if (!(weight > 1e-300)) continue
      // 1 − |tanh u|, computed without cancellation.
      const complement = 2 / (Math.exp(2 * Math.abs(u)) + 1)
      const x = u < 0 ? a + half * complement : b - half * complement
      if (!(x > a && x < b)) continue
      const y = f(x)
      if (!Number.isFinite(y)) return null
      sum += weight * y
    }
    estimate = level === 0 ? half * h * sum : previous / 2 + half * h * sum
    if (level > 0) error = Math.abs(estimate - previous)
    if (level > 2 && error <= 1e-13 * Math.max(1, Math.abs(estimate))) break
    previous = estimate
    h /= 2
  }
  return Number.isFinite(estimate) ? { value: estimate, error } : null
}

/** Adaptive Simpson, as an independent second method on finite intervals. */
function simpson(f: RealFn, a: number, b: number): number | null {
  let evaluations = 0
  const rule = (x0: number, x1: number, f0: number, fm: number, f1: number) => ((x1 - x0) / 6) * (f0 + 4 * fm + f1)
  const step = (x0: number, x1: number, f0: number, fm: number, f1: number, whole: number, tolerance: number, depth: number): number => {
    const m = (x0 + x1) / 2
    const lm = (x0 + m) / 2
    const rm = (m + x1) / 2
    const flm = f(lm)
    const frm = f(rm)
    evaluations += 2
    if (!Number.isFinite(flm) || !Number.isFinite(frm) || evaluations > 400_000) return Number.NaN
    const left = rule(x0, m, f0, flm, fm)
    const right = rule(m, x1, fm, frm, f1)
    if (depth <= 0 || Math.abs(left + right - whole) <= 15 * tolerance) return left + right + (left + right - whole) / 15
    return step(x0, m, f0, flm, fm, left, tolerance / 2, depth - 1) + step(m, x1, fm, frm, f1, right, tolerance / 2, depth - 1)
  }
  const f0 = f(a)
  const f1 = f(b)
  const fm = f((a + b) / 2)
  if (![f0, f1, fm].every(Number.isFinite)) return null
  const value = step(a, b, f0, fm, f1, rule(a, b, f0, fm, f1), 1e-11, 40)
  return Number.isFinite(value) ? value : null
}

function integrate(task: { expression: string; variable?: string; from?: string; to?: string }) {
  const { node, names } = checkedParse(task.expression, "variables")
  const variable = pickVariable(names, task.variable)
  if (names.some((name) => name !== variable)) throw new MathInputError("PARAMETERS", `В подынтегральном выражении есть параметры: ${names.filter((name) => name !== variable).join(", ")}.`)
  const shown = pretty(node)
  const steps: string[] = []
  const checks: MathCheck[] = []
  const notes: string[] = []
  const poly = asPolynomial(node, variable)
  const polynomial = poly && !poly.denominator ? poly.coefficients : null

  if (task.from === undefined || task.to === undefined) {
    if (!polynomial) throw new MathInputError("UNSUPPORTED", "Неопределённый интеграл движок берёт только от многочленов. Для других функций укажите пределы — посчитаю определённый интеграл численно.")
    const terms = polynomial.map((value, power) => ({ power: power + 1, coefficient: Q.fromNumber(value) })).filter((term) => term.coefficient && !Q.isZero(term.coefficient))
    if (terms.some((term) => !term.coefficient)) throw new MathInputError("UNSUPPORTED", "Коэффициенты многочлена не удалось представить точно.")
    const antiderivative = terms.reverse().map((term, index) => {
      const coefficient = Q.div(term.coefficient!, Q.q(term.power))
      const magnitude = Q.sign(coefficient) < 0 ? Q.neg(coefficient) : coefficient
      const body = `${Q.toText(magnitude) === "1" ? "" : Q.toText(magnitude)}${Q.toText(magnitude) === "1" || magnitude.d === BigInt(1) ? "" : "·"}${variable}${term.power > 1 ? `^${term.power}` : ""}`
      return `${Q.sign(coefficient) < 0 ? (index ? "− " : "−") : index ? "+ " : ""}${body}`
    }).join(" ")
    const text = `${antiderivative || "0"} + C`
    const check = realFunction(derivativeNode(parse(antiderivative.replace(/−/g, "-").replace(/·/g, "*") || "0"), variable), variable)
    const original = realFunction(node, variable)
    const ok = SAMPLE_POINTS.slice(0, 3).every((x) => Math.abs(check(x) - original(x)) <= 1e-9 * Math.max(1, Math.abs(original(x))))
    steps.push(`Почленно: ∫${variable}ⁿ d${variable} = ${variable}ⁿ⁺¹/(n+1).`)
    return { title: `Неопределённый интеграл ∫ ${shown} d${variable}`, answer: text, values: [{ label: "Первообразная", value: text }], steps, checks: [{ name: "Дифференцирование ответа", ok, detail: ok ? "производная первообразной равна подынтегральной функции" : "проверка не сошлась" }], notes }
  }

  const a = constantValue(task.from)
  const b = constantValue(task.to)
  if (Number.isNaN(a) || Number.isNaN(b)) throw new MathInputError("BOUNDS", "Пределы интегрирования не определены.")
  const sign = b < a ? -1 : 1
  const [lo, hi] = b < a ? [b, a] : [a, b]
  const f = realFunction(node, variable)
  const infinite = !Number.isFinite(lo) || !Number.isFinite(hi)

  // A singularity inside the interval is not something to average over.
  if (!infinite) {
    for (let index = 1; index < 2000; index += 1) {
      const x = lo + ((hi - lo) * index) / 2000
      if (!Number.isFinite(f(x))) throw new MathInputError("SINGULAR", `Подынтегральная функция не определена внутри отрезка (около ${variable} = ${formatNumber(x)}): интеграл расходится или нужен в смысле главного значения.`)
    }
  }

  let exact: string | undefined
  if (polynomial && !infinite) {
    const qa = Q.fromNumber(lo)
    const qb = Q.fromNumber(hi)
    const coefficients = polynomial.map((value) => Q.fromNumber(value))
    if (qa && qb && coefficients.every(Boolean)) {
      let total = Q.ZERO
      coefficients.forEach((coefficient, power) => {
        const term = Q.div(Q.mul(coefficient!, Q.sub(Q.pow(qb, power + 1), Q.pow(qa, power + 1))), Q.q(power + 1))
        total = Q.add(total, term)
      })
      exact = Q.toText(sign < 0 ? Q.neg(total) : total)
      steps.push("Первообразная многочлена найдена почленно, значение вычислено в точных дробях.")
    }
  }

  let value: number
  let estimate: { value: number; error: number } | null
  if (infinite) {
    // x = lo + t/(1−t) (or the mirror) maps the half-line onto [0, 1).
    const mapped: RealFn = Number.isFinite(lo)
      ? (t) => f(lo + t / (1 - t)) / ((1 - t) ** 2)
      : Number.isFinite(hi)
        ? (t) => f(hi - t / (1 - t)) / ((1 - t) ** 2)
        : (t) => (f(t / (1 - t * t)) * (1 + t * t)) / ((1 - t * t) ** 2)
    estimate = Number.isFinite(lo) || Number.isFinite(hi) ? tanhSinh(mapped, 0, 1) : tanhSinh(mapped, -1, 1)
    if (!estimate || estimate.error > 1e-5 * Math.max(1, Math.abs(estimate.value)) || Math.abs(estimate.value) > 1e12) throw new MathInputError("DIVERGES", "Несобственный интеграл, по-видимому, расходится: численные оценки не сходятся.")
    value = estimate.value * sign
    steps.push("Бесконечный предел: замена переменной на конечный отрезок, затем квадратура tanh-sinh.")
  } else {
    estimate = tanhSinh(f, lo, hi)
    if (!estimate) throw new MathInputError("SINGULAR", "Подынтегральная функция не определена на отрезке.")
    if (estimate.error > 1e-5 * Math.max(1, Math.abs(estimate.value))) throw new MathInputError("DIVERGES", "Интеграл, по-видимому, расходится: численные оценки не сходятся.")
    value = estimate.value * sign
    steps.push("Численно: квадратура tanh-sinh (двойная экспонента).")
    const second = simpson(f, lo, hi)
    if (second !== null) {
      const ok = Math.abs(second * sign - value) <= 1e-7 * Math.max(1, Math.abs(value))
      checks.push({ name: "Второй метод", ok, detail: ok ? "адаптивный метод Симпсона даёт то же значение" : `метод Симпсона даёт ${formatNumber(second * sign)}` })
    } else notes.push("Метод Симпсона неприменим (функция не определена на концах), значение проверено сходимостью tanh-sinh.")
  }
  if (exact) {
    const ok = Math.abs(fractionValue(exact) - value) <= 1e-9 * Math.max(1, Math.abs(value))
    checks.push({ name: "Точное значение", ok, detail: ok ? "совпадает с численной квадратурой" : "не совпало с численной квадратурой" })
  }
  checks.push({ name: "Сходимость", ok: estimate.error <= 1e-8 * Math.max(1, Math.abs(value)), detail: `оценка погрешности ≈ ${formatNumber(estimate.error)}` })
  const recognized = exact ? undefined : recognize(value)
  if (recognized) notes.push(`Точная форма ${recognized} распознана численно (совпадение до 12 знаков).`)
  const bounds = `${task.from} … ${task.to}`
  return {
    title: `Определённый интеграл ∫ ${shown} d${variable} от ${formatNumber(a)} до ${formatNumber(b)}`,
    answer: exact ? `${exact}${exact.includes("/") ? ` ≈ ${formatNumber(value)}` : ""}` : recognized ? `${recognized} ≈ ${formatNumber(value)}` : formatNumber(value),
    values: [{ label: `∫ (${bounds})`, value: formatNumber(value), exact: exact || recognized }],
    steps,
    checks,
    notes,
  }
}

function fractionValue(fraction: string) {
  const [n, d] = fraction.split("/")
  return Number(n) / Number(d || 1)
}

function simplify(task: { expression: string }) {
  const { node, names } = checkedParse(task.expression, "variables")
  const candidates: MathNode[] = []
  try { candidates.push(simplifyNode(node)) } catch { /* keep other forms */ }
  try {
    const rational = rationalizeNode(node) as MathNode
    candidates.push(rational)
  } catch { /* not a rational expression */ }
  if (!candidates.length) throw new MathInputError("SIMPLIFY", "Не удалось упростить выражение.")
  const best = candidates.sort((x, y) => x.toString().length - y.toString().length)[0]
  const scopeAt = (index: number) => Object.fromEntries(names.map((name, column) => [name, SAMPLE_POINTS[(index + column) % SAMPLE_POINTS.length]]))
  let tested = 0
  let ok = true
  const original = node.compile()
  const result = best.compile()
  for (let index = 0; index < SAMPLE_POINTS.length && tested < 4; index += 1) {
    try {
      const x = original.evaluate(scopeAt(index))
      const y = result.evaluate(scopeAt(index))
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue
      tested += 1
      if (Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x))) ok = false
    } catch { /* outside the domain */ }
  }
  return {
    title: `Упрощение ${pretty(node)}`,
    answer: pretty(best),
    values: [{ label: "Результат", value: pretty(best), tex: tex(best) }],
    steps: [`${pretty(node)} = ${pretty(best)}`],
    checks: [{ name: "Равносильность", ok: tested > 0 && ok, detail: tested ? (ok ? `значения совпадают в ${tested} случайных точках` : "значения не совпали") : "проверить численно не удалось" }],
    notes: [] as string[],
  }
}

/* ------------------------------------------------------------------- run */

export function runMath(task: MathTask): MathOutcome {
  const started = Date.now()
  const op = task?.op
  try {
    const result = op === "evaluate" ? evaluate(task)
      : op === "convert" ? convert(task)
      : op === "solve" ? solve(task)
      : op === "system" ? system(task)
      : op === "derivative" ? derivative(task)
      : op === "integrate" ? integrate(task)
      : op === "simplify" ? simplify(task)
      : null
    if (!result) return { ok: false, op, engine: ENGINE_LABEL, code: "UNKNOWN_OP", error: "Неизвестная операция.", ms: Date.now() - started }
    return { ok: true, op, engine: ENGINE_LABEL, ...result, ms: Date.now() - started }
  } catch (error) {
    const code = error instanceof MathInputError ? error.code : "ENGINE_ERROR"
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, op, engine: ENGINE_LABEL, code, error: message.slice(0, 300), ms: Date.now() - started }
  }
}

/** Every check that ran passed. */
export function mathVerified(outcome: MathOutcome) {
  return outcome.ok && outcome.checks.length > 0 && outcome.checks.every((check) => check.ok)
}
