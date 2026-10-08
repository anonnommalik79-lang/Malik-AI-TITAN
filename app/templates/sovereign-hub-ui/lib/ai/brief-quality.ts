/**
 * Deterministic, request-scoped large-brief checks. No extra API calls,
 * persistent cache, new dependencies, or process-resident state.
 */
export type BriefItem = { number: number; title: string }

const NUMBERED_LINE = /^\s*(?:#{1,6}\s*)?(?:[-*•]\s*)?(\d{1,2})[.)]\s+(.+)$/u
const NAMED_LINE = /^\s*(?:#{1,6}\s*)?(?:блок|block|task|пункт|section|часть|part|тапсырма)\s*(\d{1,2})\s*[:.)—–-]\s*(.*)$/iu
const INLINE_LABEL = /(?<![\p{L}\p{N}])(?:block|блок|task|пункт|section|часть|part)\s*(\d{1,2})\s*[:.)—–-]\s*/giu
const INLINE_NUMBER = /(?:^|[\s;,])(\d{1,2})\)\s+\S/gu

export function briefItems(prompt: string, max = 64): BriefItem[] {
  const found = new Map<number,string>()
  const unfencedLines: string[] = []
  let fence = false
  for (const line of String(prompt || "").split(/\r?\n/)) {
    if (line.trimStart().startsWith(String.fromCharCode(96,96,96))) { fence = !fence; continue }
    if (fence) continue
    unfencedLines.push(line)
    const match = NUMBERED_LINE.exec(line) || NAMED_LINE.exec(line)
    if (match && Number(match[1]) > 0) {
      const n = Number(match[1])
      if (!found.has(n)) found.set(n, match[2].replace(/\s+/g," ").slice(0,95))
    }
  }
  // Inline headings inside quoted code are examples, not user requirements.
  const value = unfencedLines.join("\n")
  for (const match of [...value.matchAll(INLINE_LABEL),...value.matchAll(INLINE_NUMBER)]) {
    const n = Number(match[1])
    if (n > 0 && !found.has(n)) found.set(n,"")
  }
  return [...found].sort((a,b)=>a[0]-b[0]).slice(0,Math.max(1,Math.min(max,64)))
    .map(([number,title])=>({number,title}))
}
export function briefNeedsDeep(prompt: string): boolean {
  return briefItems(prompt).length >= 3 || String(prompt || "").length >= 6000
}
export function briefOutputFloor(prompt: string): number {
  const size = String(prompt || "").length
  const count = briefItems(prompt).length
  if (count >= 12 || size >= 18000) return 14000
  if (count >= 8 || size >= 6000) return 10000
  if (count >= 3 || size >= 2000) return 7000
  return 0
}
export function briefChecklist(prompt: string): string {
  const list = briefItems(prompt)
  if (list.length < 3) return ""
  return [
    "REQUIREMENTS COVERAGE MAP (for private planning, not the final answer):",
    ...list.map(x=>String(x.number)+") "+(x.title || "Complete this requested item")),
    "Keep all requested parts, ordering, output format, and final marker. Do not claim completion for an unfinished item."
  ].join("\n")
}
export function missingBriefItems(prompt: string, answer: string): number[] {
  const list = briefItems(prompt)
  if (list.length < 3 || !String(answer || "").trim()) return []
  const seen = list.filter(({number}) => {
    const exp = new RegExp("(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:\\*\\*)?(?:(?:block|блок|task|section|пункт|часть|part)\\s*)?"+number+"(?:[.)]|\\s*[:—–-])\\s*","imu")
    return exp.test(answer)
  })
  // An extensive prose answer with no numbered headings might still be
  // complete: don't create expensive false-positive continuation loops.
  if (!seen.length && answer.length >= list.length * 120) return []
  const matched = new Set(seen.map(x=>x.number))
  return list.filter(x=>!matched.has(x.number)).map(x=>x.number)
}
export function briefMissingMarker(prompt: string, answer: string): boolean {
  const marker = String(prompt || "").match(/(?:в\s+(?:самом\s+)?конце\s+(?:выведи|напиши)|(?:finish|end)\s+with)\s*:?\s*\n+\s*([^\n]{2,120})/iu)?.[1]?.trim()
  return Boolean(marker && !String(answer || "").includes(marker))
}
export function preserveBriefEdges(prompt: string, maxChars = 14000): string {
  const value=String(prompt || "")
  const cap=Math.max(2000,Math.floor(maxChars))
  if (value.length<=cap) return value
  const start=Math.floor(cap/2)
  return value.slice(0,start) + "\n[Long middle reference text omitted only in this continuation; it was sent intact in the first call.]\n" + value.slice(-(cap-start))
}
