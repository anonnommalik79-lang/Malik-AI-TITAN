import { all, create } from "mathjs"
import type { MathNode } from "mathjs"

/**
 * The math engine's sandbox: mathjs with everything that could change global
 * state switched off, and every expression checked against an allowlist
 * before it runs. Expressions come from people and from models, so nothing
 * here trusts them: no assignments, no property access, no user functions,
 * no ranges or matrix builders that could fill memory, bounded size.
 */

export const math = create(all, { number: "number" })
const big = create(all, { number: "BigNumber", precision: 64 })

// Taken before the namespace is locked, so the engine keeps its tools.
export const parse = math.parse
export const simplifyNode = math.simplify
export const derivativeNode = math.derivative
export const rationalizeNode = math.rationalize
export const polynomialRoot = math.polynomialRoot
const bigEvaluate = big.evaluate
const bigFormat = big.format

const blocked = (name: string) => () => {
  throw new Error(`Function ${name} is disabled`)
}
for (const instance of [math, big]) {
  instance.import({ import: blocked("import"), createUnit: blocked("createUnit") }, { override: true })
}

export const ENGINE_NAME = "mathjs"
export const ENGINE_VERSION = String(math.version)
export const ENGINE_LABEL = `${ENGINE_NAME} ${ENGINE_VERSION}`

export class MathInputError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export const MAX_EXPRESSION_CHARS = 600
const MAX_NODES = 500
const MAX_ARRAY_ITEMS = 400

/** Functions an expression may call. Everything else is refused. */
export const FUNCTIONS = new Set([
  "abs", "sqrt", "cbrt", "nthRoot", "exp", "expm1", "log", "log10", "log2", "log1p", "pow",
  "sin", "cos", "tan", "sec", "csc", "cot", "asin", "acos", "atan", "atan2", "acot", "asec", "acsc",
  "sinh", "cosh", "tanh", "asinh", "acosh", "atanh", "coth", "sech", "csch",
  "floor", "ceil", "round", "fix", "sign", "mod", "gcd", "lcm", "factorial", "gamma", "erf",
  "combinations", "permutations", "min", "max", "sum", "prod", "mean", "median", "mode", "std", "variance", "mad", "quantileSeq",
  "det", "inv", "transpose", "trace", "dot", "cross", "norm", "hypot", "lusolve", "kron", "size",
  "re", "im", "conj", "arg", "isPrime", "unit", "number", "cumsum",
])

/** Operators an expression may use. */
const OPERATORS = new Set([
  "add", "subtract", "multiply", "divide", "pow", "unaryMinus", "unaryPlus", "factorial", "mod", "to",
  "dotMultiply", "dotDivide", "dotPow", "ctranspose",
])

export const CONSTANTS = new Set(["pi", "e", "i", "tau", "phi", "Infinity"])

const NODE_TYPES = new Set(["ConstantNode", "SymbolNode", "OperatorNode", "ParenthesisNode", "FunctionNode", "ArrayNode"])

type SymbolRole = "variables" | "units" | "constants"

/**
 * Parses and checks one expression. `symbols` says what a free name may be:
 * "variables" (x, y, t …), "units" (km, h, N …) or nothing but constants.
 * Returns the node and its free names.
 */
export function checkedParse(text: string, symbols: SymbolRole): { node: MathNode; names: string[] } {
  const source = String(text || "").trim()
  if (!source) throw new MathInputError("EMPTY", "Пустое выражение.")
  if (source.length > MAX_EXPRESSION_CHARS) throw new MathInputError("TOO_LONG", `Выражение длиннее ${MAX_EXPRESSION_CHARS} символов.`)
  let node: MathNode
  try {
    node = parse(source)
  } catch (error) {
    throw new MathInputError("PARSE", `Не удалось разобрать выражение: ${error instanceof Error ? error.message : String(error)}`)
  }
  const names = new Set<string>()
  let count = 0
  let arrayItems = 0
  node.traverse((current: MathNode, path: string, parent: MathNode | null) => {
    count += 1
    if (count > MAX_NODES) throw new MathInputError("TOO_BIG", "Выражение слишком большое.")
    if (!NODE_TYPES.has(current.type)) throw new MathInputError("NOT_ALLOWED", `Конструкция «${current.type.replace(/Node$/, "")}» не разрешена.`)
    const item = current as MathNode & { value?: unknown; name?: string; fn?: string | { name?: string; type?: string }; op?: string; items?: unknown[] }
    if (current.type === "ConstantNode" && typeof item.value !== "number") throw new MathInputError("NOT_ALLOWED", "Строки и логические значения не поддерживаются.")
    if (current.type === "ArrayNode") {
      arrayItems += item.items?.length || 0
      if (arrayItems > MAX_ARRAY_ITEMS) throw new MathInputError("TOO_BIG", "Слишком большая матрица.")
    }
    if (current.type === "OperatorNode" && !OPERATORS.has(String(item.fn))) throw new MathInputError("NOT_ALLOWED", `Оператор «${item.op}» не поддерживается.`)
    if (current.type === "FunctionNode") {
      const fn = item.fn as { name?: string; type?: string }
      if (fn?.type !== "SymbolNode" || !fn.name || !FUNCTIONS.has(fn.name)) throw new MathInputError("NOT_ALLOWED", `Функция «${fn?.name || "?"}» не поддерживается.`)
    }
    if (current.type === "SymbolNode") {
      if (parent?.type === "FunctionNode" && path === "fn") return
      const name = String(item.name)
      if (CONSTANTS.has(name)) return
      if (FUNCTIONS.has(name)) throw new MathInputError("NOT_ALLOWED", `«${name}» — функция, ей нужны скобки: ${name}(…).`)
      if (symbols === "units") {
        if (!math.Unit.isValuelessUnit(name)) throw new MathInputError("UNKNOWN_SYMBOL", `Неизвестная величина или единица «${name}».`)
        return
      }
      if (symbols === "constants") throw new MathInputError("FREE_SYMBOL", `В выражении есть переменная «${name}».`)
      if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(name)) throw new MathInputError("NOT_ALLOWED", `Имя «${name}» не поддерживается.`)
      names.add(name)
    }
  })
  return { node, names: [...names].sort() }
}

/** Whether a parsed expression uses nothing but integers and + − × ^ ! (exact in BigNumber). */
export function isIntegerArithmetic(node: MathNode) {
  let ok = true
  node.traverse((current: MathNode) => {
    const item = current as MathNode & { value?: unknown; fn?: unknown }
    if (current.type === "ConstantNode") { if (!Number.isInteger(item.value) || Math.abs(item.value as number) > 1e15) ok = false }
    else if (current.type === "OperatorNode") { if (!["add", "subtract", "multiply", "pow", "unaryMinus", "unaryPlus", "factorial"].includes(String(item.fn))) ok = false }
    else if (current.type !== "ParenthesisNode") ok = false
  })
  return ok
}

/**
 * Exact digits of an integer expression in 64-digit decimal arithmetic, or
 * null when it does not stay an integer (or would be too large to print).
 */
export function exactInteger(source: string): string | null {
  try {
    const value = bigEvaluate(source) as { isInteger?: () => boolean; abs?: () => { lt: (x: number | string) => boolean } }
    if (!value?.isInteger?.()) return null
    if (!value.abs?.().lt("1e64")) return null
    return bigFormat(value, { notation: "fixed" })
  } catch {
    return null
  }
}

/** The same expression in 64-digit decimal arithmetic, for a second opinion. */
export function highPrecision(source: string): number | null {
  try {
    const value = bigEvaluate(source) as { toNumber?: () => number }
    const number = value?.toNumber?.()
    return typeof number === "number" && Number.isFinite(number) ? number : null
  } catch {
    return null
  }
}
