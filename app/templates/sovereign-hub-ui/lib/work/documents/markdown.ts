/**
 * Markdown → a small block model that every document writer shares (DOCX,
 * PDF, XLSX, HTML, TXT). Covers what answers and artifacts actually use:
 * headings, paragraphs, bold/italic/code/links, bullet and numbered lists
 * (nested), tables, code blocks, quotes, rules. LaTeX is turned into
 * readable Unicode («$x^2 \cdot \pi$» → «x² · π») because none of the
 * writers typeset TeX.
 */

export type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: string }

export type Block =
  | { type: "heading"; level: number; inlines: Inline[] }
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: Array<{ level: number; inlines: Inline[] }> }
  | { type: "code"; language: string; text: string }
  | { type: "quote"; inlines: Inline[] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "rule" }

export type DocumentModel = { title: string; blocks: Block[] }

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
}
const SYMBOLS: Record<string, string> = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", equiv: "≡", sim: "∼",
  infty: "∞", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftrightarrow: "⇔", implies: "⇒", iff: "⇔", in: "∈", notin: "∉",
  subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩", forall: "∀", exists: "∃", partial: "∂", nabla: "∇", sum: "∑", prod: "∏", int: "∫",
  degree: "°", circ: "°", ldots: "…", dots: "…", cdots: "⋯", quad: " ", qquad: "  ", ",": " ", ";": " ", "!": "", left: "", right: "",
  sqrt: "√", angle: "∠", perp: "⊥", parallel: "∥", neg: "¬", land: "∧", lor: "∨", emptyset: "∅", mathbb: "", mathrm: "", text: "", operatorname: "",
}
const SUPER: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" }
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎" }

function script(text: string, table: Record<string, string>, marker: string) {
  const chars = [...text]
  return chars.every((char) => table[char]) ? chars.map((char) => table[char]).join("") : `${marker}${chars.length > 1 ? `(${text})` : text}`
}

/** LaTeX in an answer → plain Unicode a document can print. */
export function texToText(tex: string): string {
  let value = String(tex || "")
  for (let pass = 0; pass < 4; pass += 1) {
    value = value
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a: string, b: string) => `${/^[\w.]+$/.test(a) ? a : `(${a})`}/${/^[\w.]+$/.test(b) ? b : `(${b})`}`)
      .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, (_, n: string, a: string) => `${n === "3" ? "∛" : `${n}√`}(${a})`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a: string) => (/^[\w.]+$/.test(a) ? `√${a}` : `√(${a})`))
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|textbf|boldsymbol)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\^\{([^{}]*)\}/g, (_, a: string) => script(a, SUPER, "^"))
      .replace(/_\{([^{}]*)\}/g, (_, a: string) => script(a, SUB, "_"))
  }
  value = value
    .replace(/\^([0-9a-z+-])/gi, (_, a: string) => script(a, SUPER, "^"))
    .replace(/_([0-9])/g, (_, a: string) => script(a, SUB, "_"))
    .replace(/\\([A-Za-z]+|[,;!])/g, (whole, name: string) => GREEK[name] ?? SYMBOLS[name] ?? name)
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
  return value.trim()
}

function mathInText(text: string) {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => texToText(tex))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => texToText(tex))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => texToText(tex))
    .replace(/(^|[^\\$\w])\$([^$\n]{1,300}?)\$(?![\w$])/g, (_, lead: string, tex: string) => `${lead}${texToText(tex)}`)
}

/** Inline markdown → styled runs. */
export function parseInline(source: string): Inline[] {
  const text = mathInText(String(source || ""))
  const runs: Inline[] = []
  const push = (run: Inline) => {
    if (!run.text) return
    const last = runs[runs.length - 1]
    if (last && last.bold === run.bold && last.italic === run.italic && last.code === run.code && last.link === run.link) last.text += run.text
    else runs.push(run)
  }
  const walk = (input: string, style: Omit<Inline, "text">) => {
    let index = 0
    let plain = ""
    const flush = () => { if (plain) push({ text: plain, ...style }); plain = "" }
    while (index < input.length) {
      const rest = input.slice(index)
      const code = rest.match(/^(`+)([\s\S]+?)\1/)
      if (code) { flush(); push({ text: code[2], ...style, code: true }); index += code[0].length; continue }
      const image = rest.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/)
      if (image) { flush(); push({ text: image[1] || "изображение", ...style, link: image[2] }); index += image[0].length; continue }
      const link = rest.match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/)
      if (link && /^(?:https?:|mailto:)/i.test(link[2])) { flush(); walk(link[1], { ...style, link: link[2] }); index += link[0].length; continue }
      const auto = rest.match(/^<(https?:\/\/[^>\s]+)>/)
      if (auto) { flush(); push({ text: auto[1], ...style, link: auto[1] }); index += auto[0].length; continue }
      const strong = rest.match(/^(\*\*|__)(?=\S)([\s\S]*?\S)\1/)
      if (strong) { flush(); walk(strong[2], { ...style, bold: true }); index += strong[0].length; continue }
      const emphasis = rest.match(/^(\*|_)(?=\S)([\s\S]*?\S)\1(?![*_\w])/)
      if (emphasis && !(emphasis[1] === "_" && /\w$/.test(plain))) { flush(); walk(emphasis[2], { ...style, italic: true }); index += emphasis[0].length; continue }
      const strike = rest.match(/^~~([\s\S]+?)~~/)
      if (strike) { flush(); walk(strike[1], style); index += strike[0].length; continue }
      const url = rest.match(/^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"»)]/)
      if (url && !/[\w/]$/.test(plain)) { flush(); push({ text: url[0], ...style, link: style.link || url[0] }); index += url[0].length; continue }
      if (rest.startsWith("\\") && /[\\`*_{}[\]()#+\-.!|]/.test(rest[1] || "")) { plain += rest[1]; index += 2; continue }
      plain += input[index]
      index += 1
    }
    flush()
  }
  walk(text, {})
  return runs
}

export function inlineText(runs: Inline[]): string {
  return runs.map((run) => run.text).join("")
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  const cells: string[] = []
  let current = ""
  let code = false
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (char === "`") code = !code
    if (char === "\\" && trimmed[index + 1] === "|") { current += "|"; index += 1; continue }
    if (char === "|" && !code) { cells.push(current.trim()); current = ""; continue }
    current += char
  }
  cells.push(current.trim())
  return cells
}

const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/

/** Markdown → blocks. ```malik-cards fences should be turned into text before (answerCardsToText). */
export function parseMarkdown(markdown: string): Block[] {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  let paragraph: string[] = []
  const flushParagraph = () => {
    const text = paragraph.join(" ").replace(/\s+/g, " ").trim()
    if (text) blocks.push({ type: "paragraph", inlines: parseInline(text) })
    paragraph = []
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)\s*$/)
    if (fence) {
      flushParagraph()
      const body: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) { body.push(lines[index]); index += 1 }
      if (fence[2] === "math" || fence[2] === "latex") blocks.push({ type: "paragraph", inlines: [{ text: texToText(body.join(" ")) }] })
      else blocks.push({ type: "code", language: fence[2] || "", text: body.join("\n").replace(/\s+$/, "") })
      continue
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      flushParagraph()
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^\s*\$\$\s*$/.test(lines[index])) { body.push(lines[index]); index += 1 }
      blocks.push({ type: "paragraph", inlines: [{ text: texToText(body.join(" ")) }] })
      continue
    }
    if (!line.trim()) { flushParagraph(); continue }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) { flushParagraph(); blocks.push({ type: "heading", level: heading[1].length, inlines: parseInline(heading[2]) }); continue }
    if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(line)) { flushParagraph(); blocks.push({ type: "rule" }); continue }
    if (line.includes("|") && TABLE_RULE.test(lines[index + 1] || "")) {
      flushParagraph()
      const header = splitRow(line).map(parseInline)
      index += 2
      const rows: Inline[][][] = []
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = splitRow(lines[index]).map(parseInline)
        while (cells.length < header.length) cells.push([])
        rows.push(cells.slice(0, Math.max(header.length, 1)))
        index += 1
      }
      index -= 1
      blocks.push({ type: "table", header, rows })
      continue
    }
    if (/^\s{0,3}>/.test(line)) {
      flushParagraph()
      const body: string[] = []
      while (index < lines.length && /^\s{0,3}>/.test(lines[index])) { body.push(lines[index].replace(/^\s{0,3}>\s?/, "")); index += 1 }
      index -= 1
      blocks.push({ type: "quote", inlines: parseInline(body.join(" ")) })
      continue
    }
    const item = line.match(/^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/)
    if (item) {
      flushParagraph()
      const ordered = /\d/.test(item[2])
      const start = ordered ? Number.parseInt(item[2], 10) || 1 : 1
      const items: Array<{ level: number; inlines: Inline[] }> = []
      const base = item[1].replace(/\t/g, "  ").length
      while (index < lines.length) {
        const current = lines[index].match(/^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/)
        if (current) {
          const indent = current[1].replace(/\t/g, "  ").length
          const level = Math.max(0, Math.min(3, Math.round((indent - base) / 2)))
          const task = current[3].replace(/^\[( |x|X)\]\s+/, (_, mark: string) => (mark === " " ? "☐ " : "☑ "))
          items.push({ level, inlines: parseInline(task) })
          index += 1
          continue
        }
        // A wrapped continuation line belongs to the previous item.
        if (lines[index].trim() && /^\s{2,}\S/.test(lines[index]) && items.length) {
          const last = items[items.length - 1]
          last.inlines = [...last.inlines, { text: " " }, ...parseInline(lines[index].trim())]
          index += 1
          continue
        }
        break
      }
      index -= 1
      blocks.push({ type: "list", ordered, start, items })
      continue
    }
    paragraph.push(line.trim())
  }
  flushParagraph()
  return blocks
}

/** Title for a document: the first H1, or the given one. */
export function documentModel(markdown: string, title?: string): DocumentModel {
  const blocks = parseMarkdown(markdown)
  const first = blocks[0]
  const heading = first?.type === "heading" && first.level === 1 ? inlineText(first.inlines) : ""
  return { title: String(title || heading || "Документ").slice(0, 200), blocks }
}

/** Plain text, for .txt and for search. */
export function blocksToText(blocks: Block[]): string {
  const out: string[] = []
  for (const block of blocks) {
    if (block.type === "heading") out.push(inlineText(block.inlines).toUpperCase(), "")
    else if (block.type === "paragraph") out.push(inlineText(block.inlines), "")
    else if (block.type === "quote") out.push(`  «${inlineText(block.inlines)}»`, "")
    else if (block.type === "code") out.push(block.text, "")
    else if (block.type === "rule") out.push("—".repeat(20), "")
    else if (block.type === "list") {
      block.items.forEach((item, index) => out.push(`${"  ".repeat(item.level)}${block.ordered ? `${block.start + index}.` : "•"} ${inlineText(item.inlines)}`))
      out.push("")
    } else if (block.type === "table") {
      out.push([block.header, ...block.rows].map((row) => row.map(inlineText).join("\t")).join("\n"), "")
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n"
}

export function tablesOf(blocks: Block[]): Array<{ title: string; header: string[]; rows: string[][] }> {
  const result: Array<{ title: string; header: string[]; rows: string[][] }> = []
  let lastHeading = ""
  for (const block of blocks) {
    if (block.type === "heading") lastHeading = inlineText(block.inlines)
    if (block.type === "table") result.push({ title: lastHeading || `Таблица ${result.length + 1}`, header: block.header.map(inlineText), rows: block.rows.map((row) => row.map(inlineText)) })
  }
  return result
}
