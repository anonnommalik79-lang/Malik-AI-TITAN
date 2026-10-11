/** Formula parsing limits protect both browser and Render SSR from hostile output. */
export function canParseLatex(source: string): boolean {
  if (source.length > 4096) return false
  let depth = 0, commands = 0
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\") { commands++; i++; if (commands > 128) return false; continue }
    if (source[i] === "{" && ++depth > 24) return false
    if (source[i] === "}") depth = Math.max(0, depth - 1)
  }
  return true
}
