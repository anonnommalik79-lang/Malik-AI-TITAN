/**
 * The drawing pad's data: strokes, an undo history and the geometry that
 * turns pointer samples into smooth lines. Pure, so it can be tested and so
 * the canvas can always be redrawn exactly from it.
 */

export type DrawTool = "pen" | "marker" | "eraser"
export type DrawPoint = { x: number; y: number; p: number }
export type DrawStroke = { tool: DrawTool; color: string; size: number; points: DrawPoint[] }
export type DrawAction = { kind: "stroke"; stroke: DrawStroke } | { kind: "clear" }
export type DrawHistory = { done: DrawAction[]; undone: DrawAction[] }
export type DrawBackground = "white" | "grid" | "dark"

/** The picture is drawn at a fixed size whatever the screen; it is the PNG's size. */
export type DrawSheet = { width: number; height: number }
export const CANVAS: DrawSheet = { width: 1600, height: 1000 }
export const PORTRAIT_CANVAS: DrawSheet = { width: 1000, height: 1500 }

/** A tall phone screen gets a tall sheet, so the drawing fills it. */
export function sheetForStage(width: number, height: number): DrawSheet {
  return width > 0 && height > width * 1.15 ? PORTRAIT_CANVAS : CANVAS
}

/** Drawing on a photo: the sheet takes the photo's proportions (long side 1600). */
export function sheetForPhoto(width: number, height: number): DrawSheet {
  if (!(width > 0 && height > 0)) return CANVAS
  const scale = 1600 / Math.max(width, height)
  return { width: Math.max(200, Math.round(width * scale)), height: Math.max(200, Math.round(height * scale)) }
}
export const HISTORY_LIMIT = 400

/** Malik AI is black and white: the inks are shades of grey. */
export const DRAW_COLORS: Array<{ id: string; label: string; value: string }> = [
  { id: "ink", label: "Чёрный", value: "#111111" },
  { id: "white", label: "Белый", value: "#f8f8f8" },
  { id: "graphite", label: "Графит", value: "#3f3f46" },
  { id: "grey", label: "Серый", value: "#71717a" },
  { id: "silver", label: "Серебристый", value: "#a1a1aa" },
  { id: "light", label: "Светло-серый", value: "#d4d4d8" },
]

export const DRAW_SIZES: Array<{ id: "s" | "m" | "l"; label: string; value: number }> = [
  { id: "s", label: "Тонкая", value: 4 },
  { id: "m", label: "Средняя", value: 9 },
  { id: "l", label: "Толстая", value: 18 },
]

export const emptyHistory = (): DrawHistory => ({ done: [], undone: [] })

export function pushAction(history: DrawHistory, action: DrawAction): DrawHistory {
  const done = [...history.done, action]
  return { done: done.length > HISTORY_LIMIT ? done.slice(done.length - HISTORY_LIMIT) : done, undone: [] }
}

export function undoAction(history: DrawHistory): DrawHistory {
  if (!history.done.length) return history
  return { done: history.done.slice(0, -1), undone: [...history.undone, history.done[history.done.length - 1]] }
}

export function redoAction(history: DrawHistory): DrawHistory {
  if (!history.undone.length) return history
  return { done: [...history.done, history.undone[history.undone.length - 1]], undone: history.undone.slice(0, -1) }
}

/** The strokes on the canvas now: everything after the last «Очистить». */
export function visibleStrokes(done: DrawAction[]): DrawStroke[] {
  const last = done.map((action) => action.kind).lastIndexOf("clear")
  return done.slice(last + 1).flatMap((action) => action.kind === "stroke" ? [action.stroke] : [])
}

/** Is there anything on the canvas that an eraser has not wiped? (eraser-only strokes do not count) */
export function hasInk(history: DrawHistory) {
  return visibleStrokes(history.done).some((stroke) => stroke.tool !== "eraser")
}

/** Line width for a tool; a pen gets thinner or thicker with stylus pressure. */
export function strokeWidth(tool: DrawTool, size: number, pressure = 0.5) {
  if (tool === "marker") return size * 2.6
  if (tool === "eraser") return size * 3
  const p = Number.isFinite(pressure) && pressure > 0 ? Math.min(1, pressure) : 0.5
  return size * (0.55 + p * 0.9)
}

/**
 * Quadratic segments through the midpoints of consecutive samples: the
 * line passes near every sample without the corners of a polyline.
 */
export function smoothSegments(points: DrawPoint[]) {
  if (points.length < 2) return []
  const mid = (a: DrawPoint, b: DrawPoint): DrawPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: (a.p + b.p) / 2 })
  const segments: Array<{ from: DrawPoint; control: DrawPoint; to: DrawPoint }> = []
  let from = points[0]
  for (let index = 1; index < points.length - 1; index++) {
    const to = mid(points[index], points[index + 1])
    segments.push({ from, control: points[index], to })
    from = to
  }
  const last = points[points.length - 1]
  segments.push({ from, control: last, to: last })
  return segments
}

/** Samples closer than this (canvas px) add nothing but work. */
export function addPoint(points: DrawPoint[], point: DrawPoint, minDistance = 1.5) {
  const last = points[points.length - 1]
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < minDistance) return points
  points.push(point)
  return points
}

/** A photo placed under the drawing: whole, centred, never stretched. */
export function fitContain(width: number, height: number, boxWidth: number, boxHeight: number) {
  if (!(width > 0 && height > 0)) return { x: 0, y: 0, width: boxWidth, height: boxHeight }
  const scale = Math.min(boxWidth / width, boxHeight / height)
  const w = width * scale
  const h = height * scale
  return { x: (boxWidth - w) / 2, y: (boxHeight - h) / 2, width: w, height: h }
}

export function drawingFileName(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `malik-drawing-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`
}
