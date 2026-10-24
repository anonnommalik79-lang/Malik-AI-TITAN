import { BLOCK_TYPES, UI_LIMITS } from "./protocol"
import { validateUi, type UiCheck, type UiSource } from "./validate"

/**
 * Streaming: while a ```malik-ui fence is still arriving, its JSON is
 * unfinished. The blocks that are already complete can be drawn at once, so
 * the composition grows block by block instead of appearing at the end or
 * flashing raw JSON. The scanner walks the text once, tracking strings and
 * brackets, and remembers where the last complete element of the top-level
 * "blocks" array ended; that prefix is closed and validated like a full
 * document. The title and state come first in the protocol, so controls and
 * computed values are already known when their blocks arrive.
 */

export type PartialUi = UiCheck & { complete: number; pendingType?: string }

export function parsePartialUi(text: string, options: { sources?: UiSource[] } = {}): PartialUi {
  const source = String(text || "").slice(0, UI_LIMITS.bytes)
  const stack: string[] = []
  let inString = false
  let escaped = false
  let stringStart = -1
  let lastKey = ""
  let blocksDepth = -1
  let rootArray = false
  let lastEnd = -1
  let complete = 0

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === "\"") {
        inString = false
        if (stack.length === 1 && stack[0] === "{") lastKey = source.slice(stringStart + 1, i)
      }
      continue
    }
    if (c === "\"") { inString = true; stringStart = i; continue }
    if (c === "{" || c === "[") {
      if (!stack.length && c === "[") { rootArray = true; blocksDepth = 1 }
      stack.push(c)
      if (c === "[" && stack.length === 2 && stack[0] === "{" && lastKey === "blocks") blocksDepth = 2
      continue
    }
    if (c === "}" || c === "]") {
      stack.pop()
      if (blocksDepth > 0 && stack.length === blocksDepth && c === "}") { lastEnd = i + 1; complete += 1 }
      if (blocksDepth > 0 && stack.length < blocksDepth) blocksDepth = -1
      continue
    }
    // A value after a key resets the key so "blocks" must be the key of the array itself.
    if (c === "," && stack.length === 1) lastKey = ""
  }

  const remainder = lastEnd > 0 ? source.slice(lastEnd) : source
  const pendingType = /"type"\s*:\s*"([a-z]+)"/u.exec(remainder)?.[1]
  const pending = pendingType && (BLOCK_TYPES as readonly string[]).includes(pendingType) ? pendingType : undefined
  if (lastEnd < 0) return { doc: null, issues: [], fixes: [], complete: 0, ...(pending ? { pendingType: pending } : {}) }
  const closed = source.slice(0, lastEnd) + (rootArray ? "]" : "]}")
  try {
    const check = validateUi(JSON.parse(closed), options)
    return { ...check, complete, ...(pending ? { pendingType: pending } : {}) }
  } catch {
    return { doc: null, issues: ["partial JSON could not be closed"], fixes: [], complete: 0, ...(pending ? { pendingType: pending } : {}) }
  }
}
