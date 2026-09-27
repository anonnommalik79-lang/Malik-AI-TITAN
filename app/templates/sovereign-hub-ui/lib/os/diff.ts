/**
 * Line diff between two versions of an artifact (Myers' algorithm, the one
 * git uses), and per-file diffs for code projects. Pure and bounded: very
 * large inputs are compared by their first lines and say so.
 */

export type DiffLine = { type: "same" | "add" | "remove"; text: string; oldLine?: number; newLine?: number }
export type DiffResult = { lines: DiffLine[]; added: number; removed: number; truncated: boolean }

const MAX_LINES = 6_000
const MAX_EDIT = 4_000

function splitLines(text: string) {
  return String(text || "").replace(/\r\n/g, "\n").split("\n")
}

export function diffLines(before: string, after: string): DiffResult {
  let a = splitLines(before)
  let b = splitLines(after)
  const truncated = a.length > MAX_LINES || b.length > MAX_LINES
  a = a.slice(0, MAX_LINES)
  b = b.slice(0, MAX_LINES)

  // Common prefix and suffix are cheap and cover most edits.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const middle = myers(midA, midB)

  const lines: DiffLine[] = []
  for (let i = 0; i < start; i += 1) lines.push({ type: "same", text: a[i], oldLine: i + 1, newLine: i + 1 })
  let oldLine = start
  let newLine = start
  for (const op of middle) {
    if (op.type === "same") {
      oldLine += 1
      newLine += 1
      lines.push({ type: "same", text: op.text, oldLine, newLine })
    } else if (op.type === "remove") {
      oldLine += 1
      lines.push({ type: "remove", text: op.text, oldLine })
    } else {
      newLine += 1
      lines.push({ type: "add", text: op.text, newLine })
    }
  }
  for (let i = endA; i < a.length; i += 1) {
    oldLine += 1
    newLine += 1
    lines.push({ type: "same", text: a[i], oldLine, newLine })
  }
  return {
    lines,
    added: lines.filter((line) => line.type === "add").length,
    removed: lines.filter((line) => line.type === "remove").length,
    truncated,
  }
}

type Op = { type: "same" | "add" | "remove"; text: string }

function myers(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  if (!n) return b.map((text) => ({ type: "add", text }))
  if (!m) return a.map((text) => ({ type: "remove", text }))
  const max = Math.min(n + m, MAX_EDIT)
  const offset = max
  let v = new Int32Array(2 * max + 2)
  const trace: Int32Array[] = []
  let found = false
  for (let d = 0; d <= max && !found; d += 1) {
    trace.push(v.slice())
    const next = v.slice()
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x += 1
        y += 1
      }
      next[offset + k] = x
      if (x >= n && y >= m) {
        found = true
        break
      }
    }
    v = next
  }
  if (!found) {
    // Too different to align cheaply: everything old out, everything new in.
    return [...a.map((text) => ({ type: "remove" as const, text })), ...b.map((text) => ({ type: "add" as const, text }))]
  }
  // Walk the trace backwards to recover the edit script.
  const ops: Op[] = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const vd = trace[d]
    const k = x - y
    const prevK = k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]) ? k + 1 : k - 1
    const prevX = vd[offset + prevK]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      ops.push({ type: "same", text: a[x - 1] })
      x -= 1
      y -= 1
    }
    if (d > 0) {
      if (x === prevX) ops.push({ type: "add", text: b[y - 1] })
      else ops.push({ type: "remove", text: a[x - 1] })
    }
    x = prevX
    y = prevY
  }
  return ops.reverse()
}

export type FileSet = Array<{ path: string; content: string }>

export function diffFiles(before: FileSet, after: FileSet) {
  const old = new Map(before.map((file) => [file.path, file.content]))
  const next = new Map(after.map((file) => [file.path, file.content]))
  const paths = [...new Set([...old.keys(), ...next.keys()])].sort()
  return paths
    .map((path) => {
      const a = old.get(path)
      const b = next.get(path)
      const status = a === undefined ? "added" : b === undefined ? "removed" : a === b ? "same" : "changed"
      return { path, status, diff: status === "same" ? null : diffLines(a || "", b || "") }
    })
    .filter((file) => file.status !== "same")
}

/** Keeps the changed lines and a few around them, like a unified diff. */
export function compactDiff(result: DiffResult, context = 3): Array<DiffLine | { type: "gap"; count: number }> {
  const keep = new Set<number>()
  result.lines.forEach((line, index) => {
    if (line.type === "same") return
    for (let i = Math.max(0, index - context); i <= Math.min(result.lines.length - 1, index + context); i += 1) keep.add(i)
  })
  const out: Array<DiffLine | { type: "gap"; count: number }> = []
  let gap = 0
  result.lines.forEach((line, index) => {
    if (keep.has(index)) {
      if (gap) out.push({ type: "gap", count: gap })
      gap = 0
      out.push(line)
    } else {
      gap += 1
    }
  })
  if (gap) out.push({ type: "gap", count: gap })
  return out
}
