import { Fragment, type ReactNode } from "react"

import "./malik-tex.css"

/**
 * Formulas, the way a textbook prints them.
 *
 * Models write mathematics in LaTeX ($x^2$, $$\frac{a}{b}$$). Shown raw that
 * is backslashes and braces; ChatGPT shows typeset maths. This is a small
 * LaTeX reader for the maths a chat answer actually contains — fractions,
 * roots, powers and indices, sums and integrals with limits, Greek letters,
 * operators and arrows, \text, \mathbb, accents, matrices and cases — that
 * builds React elements directly. No HTML string is ever injected, which is
 * the rule the Markdown renderer lives by, and nothing is downloaded.
 *
 * Anything it does not know is shown as written rather than dropped.
 */

const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ",
  varsigma: "ς", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  times: "×", cdot: "·", cdots: "⋯", ldots: "…", dots: "…", vdots: "⋮", ddots: "⋱", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆", circ: "∘", bullet: "•",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼", simeq: "≃", cong: "≅", propto: "∝", ll: "≪", gg: "≫",
  infty: "∞", partial: "∂", nabla: "∇", forall: "∀", exists: "∃", nexists: "∄", emptyset: "∅", varnothing: "∅",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖",
  land: "∧", wedge: "∧", lor: "∨", vee: "∨", neg: "¬", lnot: "¬", oplus: "⊕", otimes: "⊗", perp: "⊥", parallel: "∥", angle: "∠", triangle: "△",
  to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", implies: "⇒", iff: "⇔",
  mapsto: "↦", uparrow: "↑", downarrow: "↓", longrightarrow: "⟶", longleftarrow: "⟵", Longrightarrow: "⟹",
  prime: "′", degree: "°", hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ", aleph: "ℵ", deg: "deg",
  langle: "⟨", rangle: "⟩", lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋", vert: "|", Vert: "‖", mid: "∣",
  lbrace: "{", rbrace: "}", "{": "{", "}": "}", "%": "%", "$": "$", "&": "&", "#": "#", "_": "_", "|": "‖",
  therefore: "∴", because: "∵", checkmark: "✓",
}

/** Operators written upright, the way textbooks set them. */
const FUNCTIONS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "log", "ln", "lg", "exp", "lim", "max", "min", "sup", "inf", "det", "dim", "ker", "gcd", "arg", "mod", "Pr", "deg", "sgn", "tg", "ctg"])

/** Big operators that take limits above and below. */
const BIG: Record<string, string> = { sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", iiint: "∭", oint: "∮", bigcup: "⋃", bigcap: "⋂", lim: "lim", max: "max", min: "min", sup: "sup", inf: "inf" }

const DOUBLE_STRUCK: Record<string, string> = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", P: "ℙ", H: "ℍ", E: "𝔼" }

const SPACES: Record<string, string> = { ",": " ", ":": " ", ";": " ", "!": "", " ": " ", quad: " ", qquad: "  ", enspace: " " }

type Token = { type: "cmd" | "char" | "open" | "close" | "sup" | "sub" | "amp" | "newline"; value: string }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === "\\") {
      const next = source[index + 1]
      if (next === "\\") {
        tokens.push({ type: "newline", value: "\\\\" })
        index += 2
        continue
      }
      const name = /^[a-zA-Z]+/.exec(source.slice(index + 1))?.[0]
      if (name) {
        tokens.push({ type: "cmd", value: name })
        index += 1 + name.length
        continue
      }
      if (next) {
        tokens.push({ type: "cmd", value: next })
        index += 2
        continue
      }
      index += 1
      continue
    }
    if (char === "{") tokens.push({ type: "open", value: char })
    else if (char === "}") tokens.push({ type: "close", value: char })
    else if (char === "^") tokens.push({ type: "sup", value: char })
    else if (char === "_") tokens.push({ type: "sub", value: char })
    else if (char === "&") tokens.push({ type: "amp", value: char })
    else if (char === "~") tokens.push({ type: "char", value: " " })
    else tokens.push({ type: "char", value: char })
    index += 1
  }
  return tokens
}

/** Relations and binary operators get space around them, as in print. */
const OPERATOR_NAMES = new Set(["times", "cdot", "div", "pm", "mp", "leq", "le", "geq", "ge", "neq", "ne", "approx", "equiv", "sim", "simeq", "cong", "propto", "ll", "gg", "in", "notin", "subset", "supset", "subseteq", "supseteq", "cup", "cap", "setminus", "land", "wedge", "lor", "vee", "oplus", "otimes", "to", "rightarrow", "leftarrow", "leftrightarrow", "Rightarrow", "Leftarrow", "Leftrightarrow", "implies", "iff", "mapsto", "longrightarrow", "Longrightarrow", "perp", "parallel", "mid"])

type Node =
  | { kind: "text"; value: string; italic?: boolean; upright?: boolean; op?: boolean }
  | { kind: "group"; children: Node[] }
  | { kind: "frac"; num: Node[]; den: Node[] }
  | { kind: "sqrt"; body: Node[]; index?: Node[] }
  | { kind: "scripts"; base: Node | null; sup?: Node[]; sub?: Node[]; limits?: boolean }
  | { kind: "style"; style: "bold" | "text" | "roman" | "overline" | "underline"; children: Node[] }
  | { kind: "accent"; mark: string; children: Node[] }
  | { kind: "big"; symbol: string }
  | { kind: "matrix"; rows: Node[][][]; open: string; close: string }
  | { kind: "raw"; value: string }

class Parser {
  private position = 0
  private tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek() {
    return this.tokens[this.position]
  }

  private next() {
    return this.tokens[this.position++]
  }

  /** Reads until `}` (consumed), end of input, or one of the stop tokens (not consumed). */
  parseList(stop: (token: Token) => boolean = () => false): Node[] {
    const nodes: Node[] = []
    while (this.position < this.tokens.length) {
      const token = this.peek()
      if (token.type === "close") {
        this.position += 1
        break
      }
      if (stop(token)) break
      if (token.type === "sup" || token.type === "sub") {
        this.position += 1
        const argument = this.argument()
        const last = nodes.pop() || null
        const target: Node = last && last.kind === "scripts" && !(token.type === "sup" ? last.sup : last.sub)
          ? last
          : { kind: "scripts", base: last, limits: last?.kind === "big" }
        if (target.kind === "scripts") {
          if (token.type === "sup") target.sup = argument
          else target.sub = argument
        }
        nodes.push(target)
        continue
      }
      const atom = this.atom()
      if (atom) {
        // A sign at the start, or right after another operator, is unary: "−b", "= −1".
        const previous = nodes[nodes.length - 1]
        if (atom.kind === "text" && atom.op && (atom.value === "−" || atom.value === "+" || atom.value === "±") && (!previous || (previous.kind === "text" && previous.op))) atom.op = false
        nodes.push(atom)
      }
    }
    return nodes
  }

  /** One argument: a braced group, a command, or a single character. */
  argument(): Node[] {
    const token = this.peek()
    if (!token) return []
    if (token.type === "open") {
      this.position += 1
      return this.parseList()
    }
    const atom = this.atom()
    return atom ? [atom] : []
  }

  /** Raw text of a braced argument ({pmatrix}, \text{…}). */
  rawArgument(): string {
    const token = this.peek()
    if (token?.type !== "open") return ""
    this.position += 1
    let depth = 1
    let text = ""
    while (this.position < this.tokens.length) {
      const current = this.next()
      if (current.type === "open") depth += 1
      if (current.type === "close") {
        depth -= 1
        if (!depth) break
      }
      text += current.type === "cmd" ? (current.value.length === 1 ? current.value : `\\${current.value} `) : current.value
    }
    return text
  }

  private optional(): Node[] | undefined {
    const token = this.peek()
    if (token?.type !== "char" || token.value !== "[") return undefined
    this.position += 1
    return this.parseList((item) => item.type === "char" && item.value === "]").concat(this.skipChar("]"))
  }

  private skipChar(value: string): Node[] {
    const token = this.peek()
    if (token?.type === "char" && token.value === value) this.position += 1
    return []
  }

  atom(): Node | null {
    const token = this.next()
    if (!token) return null
    if (token.type === "open") return { kind: "group", children: this.parseList() }
    if (token.type === "amp" || token.type === "newline") return { kind: "text", value: " " }
    if (token.type === "char") {
      if (token.value === " " || token.value === "\n" || token.value === "\t") return null
      if (/[a-zA-Z]/.test(token.value)) return { kind: "text", value: token.value, italic: true }
      if (token.value === "'") return { kind: "text", value: "′" }
      if (token.value === "-") return { kind: "text", value: "−", op: true }
      if ("+=<>".includes(token.value)) return { kind: "text", value: token.value, op: true }
      if (token.value === "*") return { kind: "text", value: "∗" }
      return { kind: "text", value: token.value }
    }
    if (token.type !== "cmd") return null
    const name = token.value

    if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "cfrac") return { kind: "frac", num: this.argument(), den: this.argument() }
    if (name === "binom" || name === "dbinom") {
      const top = this.argument()
      const bottom = this.argument()
      return { kind: "matrix", rows: [[top], [bottom]], open: "(", close: ")" }
    }
    if (name === "sqrt") {
      const index = this.optional()
      return { kind: "sqrt", body: this.argument(), index }
    }
    if (name === "text" || name === "textrm" || name === "mbox" || name === "textit" || name === "textbf") {
      return { kind: "style", style: name === "textbf" ? "bold" : "text", children: [{ kind: "text", value: this.rawArgument(), upright: true }] }
    }
    if (name === "mathrm" || name === "operatorname" || name === "mathit" || name === "mathsf" || name === "mathtt") return { kind: "style", style: "roman", children: this.argument() }
    if (name === "mathbf" || name === "boldsymbol" || name === "bm") return { kind: "style", style: "bold", children: this.argument() }
    if (name === "mathbb") {
      const letter = this.rawArgument()
      return { kind: "text", value: letter.split("").map((char) => DOUBLE_STRUCK[char] || char).join("") }
    }
    if (name === "mathcal" || name === "mathscr") return { kind: "style", style: "roman", children: this.argument() }
    if (name === "overline" || name === "bar") return { kind: "style", style: "overline", children: this.argument() }
    if (name === "underline") return { kind: "style", style: "underline", children: this.argument() }
    if (name === "vec") return { kind: "accent", mark: "⃗", children: this.argument() }
    if (name === "hat" || name === "widehat") return { kind: "accent", mark: "̂", children: this.argument() }
    if (name === "tilde" || name === "widetilde") return { kind: "accent", mark: "̃", children: this.argument() }
    if (name === "dot") return { kind: "accent", mark: "̇", children: this.argument() }
    if (name === "ddot") return { kind: "accent", mark: "̈", children: this.argument() }
    if (name === "left" || name === "right" || name === "big" || name === "Big" || name === "bigg" || name === "Bigg" || name === "bigl" || name === "bigr" || name === "Bigl" || name === "Bigr") {
      const delimiter = this.next()
      if (!delimiter) return null
      if (delimiter.type === "cmd") return { kind: "text", value: SYMBOLS[delimiter.value] ?? (delimiter.value === "." ? "" : delimiter.value) }
      return { kind: "text", value: delimiter.value === "." ? "" : delimiter.value }
    }
    if (name === "begin") {
      const environment = this.rawArgument().replace(/\*$/, "")
      return this.environment(environment)
    }
    if (name === "end") {
      this.rawArgument()
      return null
    }
    if (name in SPACES) return { kind: "text", value: SPACES[name] }
    if (name in BIG) return { kind: "big", symbol: BIG[name] }
    if (FUNCTIONS.has(name)) return { kind: "text", value: name, upright: true }
    if (name in SYMBOLS) return { kind: "text", value: SYMBOLS[name], op: OPERATOR_NAMES.has(name) }
    if (name === "displaystyle" || name === "textstyle" || name === "limits" || name === "nolimits" || name === "rm" || name === "it") return null
    return { kind: "raw", value: `\\${name}` }
  }

  private environment(name: string): Node {
    const rows: Node[][][] = [[]]
    let cell: Node[] = []
    while (this.position < this.tokens.length) {
      const token = this.peek()
      if (token.type === "cmd" && token.value === "end") {
        this.position += 1
        this.rawArgument()
        break
      }
      if (token.type === "amp") {
        this.position += 1
        rows[rows.length - 1].push(cell)
        cell = []
        continue
      }
      if (token.type === "newline") {
        this.position += 1
        rows[rows.length - 1].push(cell)
        cell = []
        rows.push([])
        continue
      }
      const part = this.parseList((item) => item.type === "amp" || item.type === "newline" || (item.type === "cmd" && item.value === "end"))
      cell.push(...part)
    }
    rows[rows.length - 1].push(cell)
    const clean = rows.filter((row) => row.some((column) => column.length))
    const delimiters: Record<string, [string, string]> = {
      pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], cases: ["{", ""],
    }
    const [open, close] = delimiters[name] || ["", ""]
    return { kind: "matrix", rows: clean, open, close }
  }
}

function render(nodes: Node[], key: string): ReactNode[] {
  return nodes.map((node, index) => renderNode(node, `${key}.${index}`))
}

function renderNode(node: Node, key: string): ReactNode {
  switch (node.kind) {
    case "text":
      if (node.op) return <span key={key} className="mtx-op">{node.value}</span>
      if (node.italic) return <i key={key} className="mtx-var">{node.value}</i>
      if (node.upright) return <span key={key} className="mtx-fn">{node.value}</span>
      return <Fragment key={key}>{node.value}</Fragment>
    case "raw":
      return <span key={key} className="mtx-raw">{node.value}</span>
    case "group":
      return <span key={key}>{render(node.children, key)}</span>
    case "frac":
      return (
        <span key={key} className="mtx-frac" role="math">
          <span className="mtx-num">{render(node.num, `${key}n`)}</span>
          <span className="mtx-den">{render(node.den, `${key}d`)}</span>
        </span>
      )
    case "sqrt":
      return (
        <span key={key} className="mtx-sqrt">
          {node.index?.length ? <sup className="mtx-root">{render(node.index, `${key}i`)}</sup> : null}
          <svg className="mtx-radical" viewBox="0 0 12 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0.5 14.5 L3.2 12.8 L6.4 23 L11.6 0.6" fill="none" stroke="currentColor" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>
          <span className="mtx-radicand">{render(node.body, `${key}b`)}</span>
        </span>
      )
    case "scripts":
      if (node.limits && node.base?.kind === "big") {
        return (
          <span key={key} className="mtx-limits">
            <span className="mtx-over">{node.sup ? render(node.sup, `${key}u`) : null}</span>
            <span className="mtx-big">{node.base.symbol}</span>
            <span className="mtx-under">{node.sub ? render(node.sub, `${key}l`) : null}</span>
          </span>
        )
      }
      return (
        <span key={key} className="mtx-scripts">
          {node.base ? renderNode(node.base, `${key}b`) : null}
          {node.sup && node.sub ? (
            <span className="mtx-supsub"><sup>{render(node.sup, `${key}u`)}</sup><sub>{render(node.sub, `${key}l`)}</sub></span>
          ) : node.sup ? <sup>{render(node.sup, `${key}u`)}</sup> : node.sub ? <sub>{render(node.sub, `${key}l`)}</sub> : null}
        </span>
      )
    case "style": {
      const className = node.style === "bold" ? "mtx-bold" : node.style === "overline" ? "mtx-overline" : node.style === "underline" ? "mtx-underline" : "mtx-roman"
      return <span key={key} className={className}>{render(node.children, key)}</span>
    }
    case "accent":
      return <span key={key} className="mtx-accent">{render(node.children, key)}{node.mark}</span>
    case "big":
      return <span key={key} className="mtx-big-inline">{node.symbol}</span>
    case "matrix":
      return (
        <span key={key} className="mtx-matrix">
          {node.open ? <span className="mtx-delim">{node.open}</span> : null}
          <span className="mtx-grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, ...node.rows.map((row) => row.length))}, auto)` }}>
            {node.rows.flatMap((row, rowIndex) => row.map((cell, cellIndex) => <span key={`${key}-${rowIndex}-${cellIndex}`} className="mtx-cell">{render(cell, `${key}-${rowIndex}-${cellIndex}`)}</span>))}
          </span>
          {node.close ? <span className="mtx-delim">{node.close}</span> : null}
        </span>
      )
  }
}

/** A formula as React elements. `display` sets it on its own centred line. */
export function TexMath({ tex, display = false }: { tex: string; display?: boolean }) {
  const source = String(tex || "").trim()
  let content: ReactNode
  try {
    content = render(new Parser(tokenize(source)).parseList(), "m")
  } catch {
    content = source
  }
  // A span in both cases: display maths can sit inside a paragraph ("… : $$x$$").
  return <span className={display ? "mtx mtx-display" : "mtx"} role="math" aria-label={source}>{content}</span>
}

/**
 * Maths inside a line of text: $$…$$ (set on its own line), $…$ (not a price
 * like "$5 и $10") and \(…\). Groups: 1 display, 2 inline, 3 \(…\).
 */
export const INLINE_MATH = /\$\$([^$]{1,2000}?)\$\$|(?<![\\$\w])\$(?!\s)([^$\n]{1,400}?)(?<![\s\\])\$(?![\d$])|\\\((.{1,400}?)\\\)/g

export function looksLikeMath(value: string) {
  // A price or plain words are not maths: there has to be a LaTeX command, a
  // power or index, an operator, or a single-letter variable.
  return /\\[a-zA-Z]+|[\^_=<>+\-*/]|^[a-zA-Z]$|\d[a-zA-Z]|[a-zA-Z]\d/.test(value)
}
