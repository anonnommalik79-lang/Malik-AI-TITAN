/**
 * Code views inside answers, all derived from what the model already writes:
 *
 * - a unified diff (```diff or a patch) shows added and removed lines;
 * - two versions of the same code («Было» / «Стало») get a computed diff;
 * - a project tree drawn with ├── └── becomes a folder tree;
 * - a numeric matrix titled as a heatmap gets grey-scale intensity cells.
 *
 * Pure functions: no DOM, no HTML from the model.
 */

/* ---------------------------------------------------------------- diffs */

export type DiffLineKind = "meta" | "hunk" | "add" | "del" | "same"

export function diffLineKind(line: string): DiffLineKind {
  if (/^(?:diff --git |index [0-9a-f]|--- |\+\+\+ |similarity index|rename (?:from|to) |new file mode|deleted file mode)/u.test(line)) return "meta"
  if (/^@@ .* @@/u.test(line)) return "hunk"
  if (line.startsWith("+")) return "add"
  if (line.startsWith("-")) return "del"
  return "same"
}

/** A diff fence, or code that is clearly a unified diff whatever its label. */
export function isUnifiedDiff(language: string, code: string) {
  if (/^(?:diff|patch|udiff)$/iu.test(language)) return true
  const lines = String(code || "").split("\n")
  const hunks = lines.filter((line) => /^@@ .* @@/u.test(line)).length
  const changes = lines.filter((line) => /^[+-](?![+-]{2} )/u.test(line)).length
  return hunks >= 1 && changes >= 2
}

export function diffStats(code: string) {
  let added = 0
  let removed = 0
  for (const line of String(code || "").split("\n")) {
    const kind = diffLineKind(line)
    if (kind === "add") added += 1
    if (kind === "del") removed += 1
  }
  return { added, removed }
}

const BEFORE = /(?:^|[\s(«"*_])(?:было|до(?:\s+(?:исправлени|изменени|рефакторинг)\S*)?|старый|старая|старое|исходн\S*|оригинал\S*|текущ\S*|before|old|original|current|бұрын(?:ғы)?)(?=$|[\s:)»"*_.,—-])/iu
const AFTER = /(?:^|[\s(«"*_])(?:стало|после(?:\s+\S+)?|новый|новая|новое|исправленн\S*|обновлённ\S*|обновленн\S*|улучшенн\S*|отрефакторенн\S*|after|new|fixed|updated|refactored|кейін(?:гі)?|түзетілген)(?=$|[\s:)»"*_.,—-])/iu

/** «Было» / «Стало» (and RU/KK/EN variants) in a short label before a code block. */
export function beforeAfterLabel(text: string): "before" | "after" | null {
  const clean = String(text || "").replace(/[`#>]/gu, " ").trim()
  if (!clean || clean.length > 80) return null
  const before = BEFORE.test(clean)
  const after = AFTER.test(clean)
  if (before === after) return null
  return before ? "before" : "after"
}

/* ----------------------------------------------------------- file trees */

export type TreeNode = { name: string; comment?: string; directory: boolean; children: TreeNode[] }

const TREE_GLYPH = /[├└]──/u

/**
 * A project tree drawn the usual way (├── └── │). Returns the root nodes, or
 * null when the text is not such a drawing (ordinary code is left alone).
 */
export function parseTextTree(code: string): TreeNode[] | null {
  // Spacer lines made only of «│» connectors carry no entry.
  const lines = String(code || "").split("\n").filter((line) => line.trim() && !/^[│|\s]+$/u.test(line))
  if (lines.length < 3 || lines.length > 400) return null
  const glyphLines = lines.filter((line) => TREE_GLYPH.test(line)).length
  if (glyphLines < 2 || glyphLines < (lines.length - 1) * 0.6) return null
  const entries: Array<{ depth: number; name: string; comment?: string }> = []
  for (const line of lines) {
    const glyph = line.search(/[├└]──/u)
    // A root line has no branch glyph; everything else is named after its «├── ».
    if (glyph < 0 && /[│├└]/u.test(line)) return null
    const depth = glyph >= 0 ? Math.round(glyph / 4) + 1 : 0
    let name = (glyph >= 0 ? line.slice(glyph + 3) : line).replace(/^[─\s]+/u, "").trim()
    let comment: string | undefined
    const split = /^(.*?)\s{2,}(?:#|\/\/|←|<-)\s*(.*)$/u.exec(name) || /^(.*?)\s+(?:#|\/\/)\s+(.*)$/u.exec(name)
    if (split) { name = split[1].trim(); comment = split[2].trim() || undefined }
    if (!name || name.length > 160) return null
    entries.push({ depth, name, ...(comment ? { comment } : {}) })
  }
  const roots: TreeNode[] = []
  const stack: Array<{ depth: number; node: TreeNode }> = []
  entries.forEach((entry, index) => {
    const next = entries[index + 1]
    const node: TreeNode = {
      name: entry.name.replace(/\/$/u, ""),
      ...(entry.comment ? { comment: entry.comment } : {}),
      directory: entry.name.endsWith("/") || Boolean(next && next.depth > entry.depth),
      children: [],
    }
    while (stack.length && stack[stack.length - 1].depth >= entry.depth) stack.pop()
    if (stack.length) stack[stack.length - 1].node.children.push(node)
    else roots.push(node)
    stack.push({ depth: entry.depth, node })
  })
  return roots
}

/* -------------------------------------------------------------- heatmaps */

const HEATMAP_TITLE = /(?:теплов\S*\s+карт|heat\s*-?\s*map|интенсивност|корреляц|correlation|confusion|матриц\S*\s+(?:ошибок|корреляц|путаниц|интенсивн)|жылу\s+картасы)/iu

function numeric(cell: string) {
  const text = String(cell || "").replace(/[*_\s %]/gu, "").replace(",", ".")
  return /^-?\d+(?:\.\d+)?$/u.test(text) ? Number(text) : null
}

export type Heatmap = { min: number; max: number; values: Array<Array<number | null>> }

/** A table the answer calls a heatmap/correlation/confusion matrix, with numbers to shade. */
export function heatmapTable(headers: string[], rows: string[][], title = ""): Heatmap | null {
  if (!HEATMAP_TITLE.test(`${title} ${headers.join(" ")}`)) return null
  if (rows.length < 2 || headers.length < 3) return null
  const values = rows.map((row) => row.map((cell, column) => column === 0 ? null : numeric(cell)))
  const cells = values.flat().filter((value): value is number => value !== null)
  const body = rows.length * (headers.length - 1)
  if (cells.length < 4 || cells.length < body * 0.8) return null
  const min = Math.min(...cells)
  const max = Math.max(...cells)
  if (!(max > min)) return null
  return { min, max, values }
}

/** 0 (lowest) … 1 (highest) → a grey from near-black to near-white, with readable text. */
export function heatShade(value: number, heatmap: Heatmap) {
  const t = (value - heatmap.min) / (heatmap.max - heatmap.min)
  const level = Math.round(28 + t * 196)
  return { background: `rgb(${level}, ${level}, ${level})`, color: level > 140 ? "#000" : "#fff" }
}
