/**
 * Visual Engine fences, recognised without validating them.
 *
 * The Markdown renderer only needs to know that a ```malik-visual fence claims
 * an interactive type (and, while it streams, which one) - validation with Zod
 * happens in the block's own module. Keeping this file dependency-free keeps
 * the Markdown parser light and its tests independent of the engine.
 */

export const VISUAL_ENGINE_TYPES = ["chart", "dashboard", "calculator", "table", "graph"] as const
export type VisualEngineType = (typeof VISUAL_ENGINE_TYPES)[number]

/** Hard limits: the size of a block, and how much a chart or graph may draw. */
export const VISUAL_LIMITS = {
  bytes: 64 * 1024,
  blocksPerAnswer: 6,
  seriesPerChart: 8,
  pointsPerSeries: 400,
  pointsPerChart: 3000,
  scatterPoints: 500,
  periods: 6,
  metricsPerPeriod: 8,
  tableColumns: 12,
  tableRows: 1000,
  graphNodes: 40,
  graphEdges: 80,
  sources: 6,
} as const

// Built from an ASCII string so no invisible characters live in the source.
// Includes bidi overrides (U+202A-U+202E, U+2066-U+2069), which can make text read backwards.
export const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2069\\ufeff]", "gu")

export function isVisualEngineType(value: unknown): value is VisualEngineType {
  return typeof value === "string" && (VISUAL_ENGINE_TYPES as readonly string[]).includes(value)
}

function cleanTitle(value: unknown) {
  return typeof value === "string" ? value.replace(CONTROL_CHARS, " ").replace(/\s+/gu, " ").trim().slice(0, 100) || undefined : undefined
}

/** A closed fence that claims a Visual Engine type, or null for anything else. */
export function detectVisualFence(raw: string): { type: VisualEngineType; title?: string } | null {
  const source = String(raw || "")
  if (source.length > VISUAL_LIMITS.bytes) return null
  if (!/"type"\s*:\s*"(?:chart|dashboard|calculator|table|graph)"/u.test(source)) return null
  try {
    const data = JSON.parse(source)
    if (!data || typeof data !== "object" || Array.isArray(data) || !isVisualEngineType(data.type)) return null
    return { type: data.type, title: cleanTitle(data.title) }
  } catch {
    // Claimed an engine type but is not JSON: the block shows its fallback.
    const type = /"type"\s*:\s*"([a-z]+)"/u.exec(source)?.[1]
    return isVisualEngineType(type) ? { type } : null
  }
}

/**
 * While an answer streams, the fence is open and its JSON incomplete. The type
 * and title can be read early, so the chat shows a skeleton of the right shape
 * instead of raw JSON - and only for a type that really exists.
 */
export function sniffPendingVisual(partial: string): { type: VisualEngineType; title?: string } | null {
  const type = /"type"\s*:\s*"([a-z-]+)"/u.exec(partial)?.[1]
  if (!isVisualEngineType(type)) return null
  const title = /"title"\s*:\s*"((?:[^"\\]|\\.){1,100})"/u.exec(partial)?.[1]
  let decoded: string | undefined
  if (title) { try { decoded = JSON.parse(`"${title}"`) } catch { decoded = undefined } }
  return { type, title: cleanTitle(decoded) }
}
