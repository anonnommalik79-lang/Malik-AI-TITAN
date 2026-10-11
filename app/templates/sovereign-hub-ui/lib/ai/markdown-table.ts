/** Shared row tokenizer: escaped pipes, code and math are content, not columns. */
export function markdownTableCells(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "")
  const cells: string[] = []
  let cell = "", code = 0, math = ""
  for (let i = 0; i < body.length; i++) {
    const char = body[i]
    if (char === "\\" && i + 1 < body.length) {
      const next = body[++i]
      if (next === "(" && !code) math = "paren"
      else if (next === ")" && math === "paren") math = ""
      cell += `\\${next}`
      continue
    }
    if (char === "`") {
      let run = 1
      while (body[i + run] === "`") run++
      if (!code) code = run
      else if (code === run) code = 0
      cell += "`".repeat(run); i += run - 1; continue
    }
    if (char === "$" && !code) {
      const run = body[i + 1] === "$" ? "$$" : "$"
      // Unpaired currency dollars must not swallow the remaining columns.
      if (!math && body.indexOf(run, i + run.length) >= 0) math = run
      else if (math === run) math = ""
      cell += run; i += run.length - 1; continue
    }
    if (char === "|" && !code && !math) { cells.push(cell.trim()); cell = "" }
    else cell += char
  }
  cells.push(cell.trim())
  return cells
}
