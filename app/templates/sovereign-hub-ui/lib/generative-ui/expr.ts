/**
 * Safe expressions for Generative UI: the arithmetic behind sliders,
 * calculators, computed metrics and conditional blocks.
 *
 * A small Pratt parser over a closed grammar — numbers, strings, the
 * interface's own state variables, + − × ÷ % ^, comparisons, && || !, the
 * ternary, and a fixed list of maths functions. There is no member access,
 * no calls to anything outside that list, no assignment and no `eval`, so a
 * model-written expression can compute but cannot reach the page.
 */

export type ExprValue = number | string | boolean
export type ExprScope = Record<string, ExprValue>

type Node =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "var"; name: string }
  | { t: "un"; op: string; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "if"; c: Node; a: Node; b: Node }
  | { t: "call"; fn: string; args: Node[] }

export const MAX_EXPR_LENGTH = 400
const MAX_DEPTH = 40

const FUNCTIONS: Record<string, { min: number; max: number; run: (...args: number[]) => number }> = {
  min: { min: 1, max: 12, run: (...a) => Math.min(...a) },
  max: { min: 1, max: 12, run: (...a) => Math.max(...a) },
  abs: { min: 1, max: 1, run: (x) => Math.abs(x) },
  sqrt: { min: 1, max: 1, run: (x) => Math.sqrt(x) },
  pow: { min: 2, max: 2, run: (x, y) => Math.pow(x, y) },
  floor: { min: 1, max: 1, run: (x) => Math.floor(x) },
  ceil: { min: 1, max: 1, run: (x) => Math.ceil(x) },
  round: { min: 1, max: 2, run: (x, digits = 0) => { const k = 10 ** Math.max(0, Math.min(8, Math.round(digits))); return Math.round(x * k) / k } },
  log: { min: 1, max: 1, run: (x) => Math.log(x) },
  log10: { min: 1, max: 1, run: (x) => Math.log10(x) },
  exp: { min: 1, max: 1, run: (x) => Math.exp(x) },
  clamp: { min: 3, max: 3, run: (x, a, b) => Math.min(Math.max(x, a), b) },
  sin: { min: 1, max: 1, run: (x) => Math.sin(x) },
  cos: { min: 1, max: 1, run: (x) => Math.cos(x) },
  pi: { min: 0, max: 0, run: () => Math.PI },
}

export class ExprError extends Error {}

type Token = { k: "num" | "str" | "id" | "op" | "end"; v: string }

function tokenize(source: string): Token[] {
  const text = String(source ?? "")
  if (text.length > MAX_EXPR_LENGTH) throw new ExprError("expression too long")
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (/\s/u.test(c)) { i += 1; continue }
    const num = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iu.exec(text.slice(i))
    if (num) { tokens.push({ k: "num", v: num[0] }); i += num[0].length; continue }
    const id = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(text.slice(i))
    if (id) { tokens.push({ k: "id", v: id[0] }); i += id[0].length; continue }
    if (c === "\"" || c === "'") {
      const end = text.indexOf(c, i + 1)
      if (end < 0) throw new ExprError("unterminated string")
      tokens.push({ k: "str", v: text.slice(i + 1, end) })
      i = end + 1
      continue
    }
    const op = /^(?:&&|\|\||==|!=|<=|>=|[-+*/%^()<>!?:,×÷])/u.exec(text.slice(i))
    if (op) { tokens.push({ k: "op", v: op[0] === "×" ? "*" : op[0] === "÷" ? "/" : op[0] }); i += op[0].length; continue }
    throw new ExprError(`unexpected character «${c}»`)
  }
  tokens.push({ k: "end", v: "" })
  return tokens
}

const BINARY: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6, "^": 8 }

export function parseExpr(source: string): Node {
  const tokens = tokenize(source)
  let at = 0
  const peek = () => tokens[at]
  const take = () => tokens[at++]
  const expect = (v: string) => { const token = take(); if (token.v !== v || token.k === "str") throw new ExprError(`expected «${v}»`) }
  const parse = (minPower: number, depth: number): Node => {
    if (depth > MAX_DEPTH) throw new ExprError("expression too deep")
    const token = take()
    let left: Node
    if (token.k === "num") left = { t: "num", v: Number(token.v) }
    else if (token.k === "str") left = { t: "str", v: token.v }
    else if (token.k === "id") {
      if (token.v === "true" || token.v === "false") left = { t: "bool", v: token.v === "true" }
      else if (peek().v === "(" && peek().k === "op") {
        take()
        const fn = token.v.toLowerCase()
        if (!FUNCTIONS[fn]) throw new ExprError(`unknown function «${token.v}»`)
        const args: Node[] = []
        if (peek().v !== ")") { do { args.push(parse(0, depth + 1)) } while (peek().v === "," && take()) }
        expect(")")
        if (args.length < FUNCTIONS[fn].min || args.length > FUNCTIONS[fn].max) throw new ExprError(`wrong number of arguments for ${fn}`)
        left = { t: "call", fn, args }
      } else left = { t: "var", name: token.v }
    } else if (token.k === "op" && token.v === "(") { left = parse(0, depth + 1); expect(")") }
    else if (token.k === "op" && (token.v === "-" || token.v === "+" || token.v === "!")) left = { t: "un", op: token.v, a: parse(7, depth + 1) }
    else throw new ExprError(token.k === "end" ? "unexpected end" : `unexpected «${token.v}»`)
    for (;;) {
      const next = peek()
      if (next.k !== "op") break
      if (next.v === "?" && minPower === 0) {
        take()
        const yes = parse(0, depth + 1)
        expect(":")
        const no = parse(0, depth + 1)
        left = { t: "if", c: left, a: yes, b: no }
        continue
      }
      const power = BINARY[next.v]
      if (!power || power < minPower) break
      take()
      // ^ is right-associative (its right side binds at the same power);
      // everything else is left-associative (the right side binds tighter).
      const right = parse(next.v === "^" ? power : power + 1, depth + 1)
      left = { t: "bin", op: next.v, a: left, b: right }
    }
    return left
  }
  const node = parse(0, 0)
  if (peek().k !== "end") throw new ExprError(`unexpected «${peek().v}»`)
  return node
}

const num = (value: ExprValue) => (typeof value === "number" ? value : typeof value === "boolean" ? (value ? 1 : 0) : Number(value))

function run(node: Node, scope: ExprScope): ExprValue {
  switch (node.t) {
    case "num": case "str": case "bool": return node.v
    case "var": {
      if (!Object.prototype.hasOwnProperty.call(scope, node.name)) throw new ExprError(`unknown variable «${node.name}»`)
      return scope[node.name]
    }
    case "un": {
      const a = run(node.a, scope)
      return node.op === "!" ? !a : node.op === "-" ? -num(a) : num(a)
    }
    case "if": return run(node.c, scope) ? run(node.a, scope) : run(node.b, scope)
    case "call": return FUNCTIONS[node.fn].run(...node.args.map((arg) => num(run(arg, scope))))
    case "bin": {
      if (node.op === "&&") return Boolean(run(node.a, scope)) && Boolean(run(node.b, scope))
      if (node.op === "||") return Boolean(run(node.a, scope)) || Boolean(run(node.b, scope))
      const a = run(node.a, scope), b = run(node.b, scope)
      switch (node.op) {
        case "==": return a === b || (typeof a !== "string" && typeof b !== "string" && num(a) === num(b))
        case "!=": return !(a === b || (typeof a !== "string" && typeof b !== "string" && num(a) === num(b)))
        case "<": return num(a) < num(b)
        case "<=": return num(a) <= num(b)
        case ">": return num(a) > num(b)
        case ">=": return num(a) >= num(b)
        case "+": return typeof a === "string" || typeof b === "string" ? `${a}${b}`.slice(0, 500) : num(a) + num(b)
        case "-": return num(a) - num(b)
        case "*": return num(a) * num(b)
        case "/": return num(a) / num(b)
        case "%": return num(a) % num(b)
        case "^": return Math.pow(num(a), num(b))
      }
    }
  }
  throw new ExprError("bad expression")
}

/** Variables an expression reads (for checking that every one exists in the state). */
export function exprVariables(node: Node, out = new Set<string>()): Set<string> {
  if (node.t === "var") out.add(node.name)
  else if (node.t === "un") exprVariables(node.a, out)
  else if (node.t === "bin") { exprVariables(node.a, out); exprVariables(node.b, out) }
  else if (node.t === "if") { exprVariables(node.c, out); exprVariables(node.a, out); exprVariables(node.b, out) }
  else if (node.t === "call") node.args.forEach((arg) => exprVariables(arg, out))
  return out
}

/** Evaluates, never throws: a broken expression yields null so the block can show «—». */
export function evaluate(source: string, scope: ExprScope): ExprValue | null {
  try {
    const value = run(parseExpr(source), scope)
    if (typeof value === "number" && !Number.isFinite(value)) return null
    return value
  } catch {
    return null
  }
}
