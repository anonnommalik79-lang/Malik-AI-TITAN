import { safeSpreadsheetFormula } from "./safe-formula"

type Value = number | string | boolean | Value[]
type Node = { type: "number"; value: number } | { type: "ref"; value: string } | { type: "range"; from: string; to: string } | { type: "op"; op: string; args: Node[] } | { type: "call"; name: string; args: Node[] }
const numeric = (v: Value): number => { if (typeof v === "number") return v; if (typeof v === "boolean") return Number(v); if (v === "") return 0; throw new Error("FORMULA_VALUE_ERROR") }
function address(ref: string) { const m = ref.replace(/\$/g, "").match(/^([A-Z]+)(\d+)$/)!; let col = 0; for (const c of m[1]) col = col * 26 + c.charCodeAt(0) - 64; return [Number(m[2]) - 1, col - 1] }
function parse(raw: string): Node {
  const text = safeSpreadsheetFormula(raw)
  const tokens = text.match(/(?:SUM|AVERAGE|MIN|MAX|COUNT|ROUND|ABS|IF)(?=\s*\()|\$?[A-Z]{1,3}\$?[1-9]\d*|\d+(?:\.\d+)?|\.\d+|<>|<=|>=|[()+*/^%,:<>=-]/g) || []
  let i = 0
  const precedence: Record<string, number> = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "+": 2, "-": 2, "*": 3, "/": 3, "^": 4 }
  const primary = (): Node => {
    const t = tokens[i++]
    let node: Node
    if (t === "+" || t === "-") node = { type: "op", op: `u${t}`, args: [primary()] }
    else if (t === "(") { node = expression(0); i++ }
    else if (/^[A-Z]+$/.test(t)) {
      i++; const args = [expression(0)]
      while (tokens[i] === ",") { i++; args.push(expression(0)) }
      i++; node = { type: "call", name: t, args }
    } else if (/^\$?[A-Z]+\$?\d+$/.test(t)) {
      node = tokens[i] === ":" ? (i++, { type: "range", from: t, to: tokens[i++] }) : { type: "ref", value: t }
    } else node = { type: "number", value: Number(t) }
    if (tokens[i] === "%") { i++; node = { type: "op", op: "%", args: [node] } }
    return node
  }
  const expression = (min: number): Node => {
    let node = primary()
    while ((precedence[tokens[i]] || 0) > min) { const op = tokens[i++]; node = { type: "op", op, args: [node, expression(precedence[op] - (op === "^" ? 1 : 0))] } }
    return node
  }
  return expression(0)
}

/** Evaluates ONLY the exporter's closed, local numeric grammar. Not Excel or
 * arbitrary JS. Used for checked caches/charts; Excel still recalculates on open. */
export function sheetFormulaValues(rows: string[][], parseNumber: (raw: string) => number | null) {
  const cache = new Map<string, Value>(), active = new Set<string>()
  const columns = Math.max(1, ...rows.map(row => row.length))
  let operations = 0
  const tick = () => { if (++operations > 2_000_000) throw new Error("FORMULA_COMPLEXITY_LIMIT") }
  const cell = (ref: string): Value => {
    tick(); const key = ref.replace(/\$/g, "")
    if (cache.has(key)) return cache.get(key)!
    if (active.has(key) || active.size >= 128) throw new Error("FORMULA_CYCLE_OR_DEPTH")
    const [r, c] = address(key)
    if (r >= rows.length || c >= columns) throw new Error("FORMULA_REFERENCE_OUT_OF_DATA")
    const raw = String(rows[r]?.[c] ?? "")
    active.add(key)
    try { const value = /^\s*=/.test(raw) ? evaluate(parse(raw)) : parseNumber(raw) ?? raw; cache.set(key, value); return value }
    finally { active.delete(key) }
  }
  const evaluate = (node: Node): Value => {
    tick()
    if (node.type === "number") return node.value
    if (node.type === "ref") return cell(node.value)
    if (node.type === "range") {
      const [r1, c1] = address(node.from), [r2, c2] = address(node.to), result: Value[] = []
      if ((Math.abs(r2 - r1) + 1) * (Math.abs(c2 - c1) + 1) > 50_000) throw new Error("FORMULA_RANGE_TOO_LARGE")
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) { let name = "", n = c + 1; while (n) { name = String.fromCharCode(65 + (n - 1) % 26) + name; n = Math.floor((n - 1) / 26) } result.push(cell(`${name}${r + 1}`)) }
      return result
    }
    if (node.type === "call") {
      if (node.name === "IF") return numeric(evaluate(node.args[0])) ? evaluate(node.args[1]) : node.args[2] ? evaluate(node.args[2]) : false
      const values: number[] = []
      const collect = (value: Value): void => { if (Array.isArray(value)) value.forEach(collect); else if (typeof value === "number") values.push(value) }
      node.args.forEach(arg => collect(evaluate(arg)))
      if (node.name === "COUNT") return values.length
      if (node.name === "SUM") return values.reduce((a, b) => a + b, 0)
      if (!values.length) throw new Error("FORMULA_VALUE_ERROR")
      if (node.name === "AVERAGE") return values.reduce((a, b) => a + b, 0) / values.length
      if (node.name === "MIN") return Math.min(...values)
      if (node.name === "MAX") return Math.max(...values)
      if (node.name === "ABS") return Math.abs(values[0])
      if (node.name === "ROUND") { const scale = 10 ** values[1]; return Math.sign(values[0]) * Math.round(Math.abs(values[0]) * scale + Number.EPSILON) / scale }
    }
    if (node.type !== "op") throw new Error("FORMULA_VALUE_ERROR")
    const a = numeric(evaluate(node.args[0])), b = node.args[1] ? numeric(evaluate(node.args[1])) : 0
    switch (node.op) {
      case "u+": return a; case "u-": return -a; case "%": return a / 100
      case "+": return a + b; case "-": return a - b; case "*": return a * b
      case "/": if (b === 0) throw new Error("FORMULA_DIV_ZERO"); return a / b
      case "^": return a ** b; case "=": return a === b; case "<>": return a !== b
      case "<": return a < b; case ">": return a > b; case "<=": return a <= b; case ">=": return a >= b
    }
    throw new Error("FORMULA_VALUE_ERROR")
  }
  return (ref: string) => { const value = numeric(cell(ref)); if (!Number.isFinite(value)) throw new Error("FORMULA_NON_FINITE"); return value }
}
