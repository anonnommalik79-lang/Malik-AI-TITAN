/**
 * MALIK Generative UI — the protocol between the model and the chat.
 *
 * The model answers with ordinary text and, when a visual form helps, one or
 * more ```malik-ui fences holding JSON. The JSON is a tree of *primitives*
 * (text, card, grid, chart, table, flow, timeline, control …) that nest in
 * any combination, share a small typed state, and compute values with safe
 * expressions. The chat renders it through a fixed registry of components:
 * no HTML, script or React from the model ever runs. A composition that
 * fails validation is repaired where possible and otherwise falls back to
 * its text.
 *
 * Primitives, not templates: a hero, a scoreboard, a calculator, a strategy
 * report or an architecture diagram are compositions the model builds from
 * the same parts, so a new kind of answer needs no new code.
 */

export const UI_FENCE = "malik-ui"
export const UI_VERSION = 1

/** A number or text that may be computed from the state: { "expr": "price * qty" }. */
export type Value = number | string | { expr: string }

/** A photograph is asked for by subject; the verified photo pipeline finds a licensed one. URLs from the model are not accepted. */
export type ImageRef = { query: string; alt?: string; caption?: string }

export type Format = "number" | "percent" | "currency" | "compact" | "text"

export type DataOrigin = "user" | "sources" | "computed" | "illustrative"

type Base = { id?: string; when?: string }

export type HeadingBlock = Base & { type: "heading"; text: Value; level?: 1 | 2 | 3; eyebrow?: string }
export type TextBlock = Base & { type: "text"; text: Value; tone?: "body" | "lead" | "muted" | "small" }
export type ListBlock = Base & { type: "list"; items: Array<string | { title: string; text?: string }>; style?: "bullet" | "number" | "check" }
export type QuoteBlock = Base & { type: "quote"; text: string; author?: string; label?: string }
export type CalloutBlock = Base & { type: "callout"; tone?: "note" | "info" | "success" | "warning"; title?: string; text: Value }
export type DividerBlock = Base & { type: "divider" }
export type BadgeBlock = Base & { type: "badge"; text: Value }
export type ImageBlock = Base & { type: "image"; image: ImageRef; aspect?: "wide" | "square" | "portrait" | "banner" }
export type GalleryBlock = Base & { type: "gallery"; images: ImageRef[] }
export type MetricBlock = Base & { type: "metric"; label: string; value: Value; unit?: string; format?: Format; digits?: number; delta?: Value; hint?: string }
export type ProgressBlock = Base & { type: "progress"; label: string; value: Value; max?: number; status?: "pending" | "running" | "done" | "failed" }
export type CodeBlock = Base & { type: "code"; code: string; language?: string; filename?: string }
export type FileBlock = Base & { type: "file"; name: string; note?: string; size?: string; href?: string }
export type CitationBlock = Base & { type: "citation"; ref?: number; url?: string; label?: string; /** Set by validation, never by the model: the link is not one of the answer's sources. */ unverified?: boolean }
export type TableColumn = { key: string; label: string; align?: "left" | "right" | "center"; format?: Format; digits?: number; unit?: string }
export type TableBlock = Base & { type: "table"; columns: TableColumn[]; rows: Array<Record<string, Value | null>>; caption?: string; sortable?: boolean; filterable?: boolean; highlight?: number; origin?: DataOrigin }
export type ChartSeries = { name: string; values: Value[] }
export type ChartBlock = Base & {
  type: "chart"; kind: "bar" | "hbar" | "line" | "area" | "pie" | "donut" | "scatter"
  title?: string; labels: string[]; series: ChartSeries[]; unit?: string; format?: Format; digits?: number
  xLabel?: string; yLabel?: string; origin: DataOrigin; note?: string
}
export type TimelineItem = { date: string; title: string; text?: string; status?: "done" | "active" | "next" }
export type TimelineBlock = Base & { type: "timeline"; items: TimelineItem[] }
export type FlowNode = { id: string; label: string; detail?: string }
export type FlowEdge = { from: string; to: string; label?: string }
export type FlowBlock = Base & { type: "flow"; nodes: FlowNode[]; edges: FlowEdge[]; direction?: "down" | "right" }
export type TreeNode = { label: string; detail?: string; children?: TreeNode[] }
export type TreeBlock = Base & { type: "tree"; root: TreeNode }
export type ControlBlock = Base & {
  type: "control"; kind: "slider" | "number" | "select" | "toggle" | "segmented"; bind: string; label: string
  min?: number; max?: number; step?: number; unit?: string; options?: Array<{ label: string; value: string | number }>
}

export type Block =
  | HeadingBlock | TextBlock | ListBlock | QuoteBlock | CalloutBlock | DividerBlock | BadgeBlock
  | ImageBlock | GalleryBlock | MetricBlock | ProgressBlock | CodeBlock | FileBlock | CitationBlock
  | TableBlock | ChartBlock | TimelineBlock | FlowBlock | TreeBlock | ControlBlock
  | (Base & { type: "card"; title?: Value; eyebrow?: string; body?: Value; image?: ImageRef; badge?: string; footer?: string; variant?: "plain" | "outline" | "hero" | "emphasis" | "numbered"; number?: string; href?: string; items?: Block[] })
  | (Base & { type: "grid"; columns?: 1 | 2 | 3 | 4; items: Block[] })
  | (Base & { type: "stack"; items: Block[]; gap?: "tight" | "normal" | "loose" })
  | (Base & { type: "section"; title?: string; eyebrow?: string; number?: string; items: Block[] })
  | (Base & { type: "tabs"; tabs: Array<{ label: string; items: Block[] }> })
  | (Base & { type: "accordion"; items: Array<{ title: string; items: Block[]; open?: boolean }> })

export type BlockType = Block["type"]
export type ContainerBlock = Extract<Block, { type: "card" | "grid" | "stack" | "section" | "tabs" | "accordion" }>

export type UiDocument = {
  v: typeof UI_VERSION
  title?: string
  /** Variables the controls change and the expressions read. */
  state?: Record<string, number | string | boolean>
  blocks: Block[]
}

export const BLOCK_TYPES: readonly BlockType[] = [
  "heading", "text", "list", "quote", "callout", "divider", "badge", "image", "gallery", "metric", "progress", "code", "file", "citation",
  "table", "chart", "timeline", "flow", "tree", "control", "card", "grid", "stack", "section", "tabs", "accordion",
]

/** Limits that keep one answer light enough to render on a phone. */
export const UI_LIMITS = {
  bytes: 48 * 1024,
  depth: 6,
  blocks: 160,
  images: 12,
  tableRows: 60,
  tableColumns: 8,
  chartPoints: 48,
  chartSeries: 6,
  flowNodes: 24,
  treeNodes: 60,
  timelineItems: 24,
  text: 1200,
  stateKeys: 24,
} as const
