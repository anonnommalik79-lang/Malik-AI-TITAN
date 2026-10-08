import { z } from "zod"
import { CALCULATOR_MODELS, type CalculatorModelId } from "./calculators"
import { CONTROL_CHARS, VISUAL_ENGINE_TYPES, VISUAL_LIMITS, isVisualEngineType, sniffPendingVisual, type VisualEngineType } from "./detect"

export { VISUAL_ENGINE_TYPES, VISUAL_LIMITS, isVisualEngineType, sniffPendingVisual, type VisualEngineType }

/**
 * MALIK VISUAL ENGINE — the data contract.
 *
 * A model answer may contain a closed ```malik-visual fence with ONE JSON
 * object. The chat renders it with Malik's own components; nothing in the
 * block is ever executed - no HTML, no JSX, no scripts, no remote assets
 * except https source links. The simple v1 types (composition, bars, metrics,
 * timeline, checklist, comparison, flow) stay with lib/ai/answer-visuals.ts;
 * this file adds the interactive v2 types below, under the same fence.
 *
 * Invalid input never breaks a message: the parser returns a reason and the
 * renderer shows a short text fallback instead of the block.
 */

export const VISUAL_BLOCK_VERSION = 2
const CONTROL = CONTROL_CHARS

/** Visible text: control characters removed, whitespace folded, length capped. */
const text = (max: number) => z.string()
  .transform((value) => value.replace(CONTROL, " ").replace(/\s+/gu, " ").trim().slice(0, max))
  .refine((value) => value.length > 0, "empty text")
const optText = (max: number) => z.preprocess((value) => (value === null || value === "" ? undefined : value), text(max).optional())

const finite = z.number().finite().refine((value) => Math.abs(value) <= 1e15, "number out of range")

const httpsUrl = z.string().max(500).refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && /\.[a-z]{2,}$/iu.test(url.hostname)
  } catch { return false }
}, "only https links")

const source = z.object({ title: text(120), url: httpsUrl })

/**
 * Where the numbers come from. The badge on every block says it, so demo or
 * estimated figures are never mistaken for the user's real data.
 */
export const DATA_KINDS = ["user", "sourced", "estimate", "example"] as const
export type VisualDataKind = (typeof DATA_KINDS)[number]

const base = {
  version: z.union([z.literal(2), z.literal("2")]).optional(),
  title: text(100),
  subtitle: optText(160),
  dataKind: z.enum(DATA_KINDS).default("estimate"),
  sources: z.array(source).max(VISUAL_LIMITS.sources).optional(),
  asOf: optText(40),
  note: optText(280),
}

/* ------------------------------------------------------------------ chart */

export const CHART_KINDS = ["line", "area", "bar", "hbar", "stacked-bar", "stacked-area", "pie", "donut", "radar", "composed", "scatter", "bubble"] as const
export type ChartKind = (typeof CHART_KINDS)[number]

const series = z.object({
  name: text(60),
  values: z.array(finite.nullable()).min(1).max(VISUAL_LIMITS.pointsPerSeries),
  kind: z.enum(["line", "bar", "area"]).optional(),
})
const dataset = z.object({
  labels: z.array(text(40)).min(1).max(VISUAL_LIMITS.pointsPerSeries),
  series: z.array(series).min(1).max(VISUAL_LIMITS.seriesPerChart),
})
const period = dataset.extend({ label: text(24) })
const scatterSeries = z.object({
  name: text(60),
  points: z.array(z.object({ x: finite, y: finite, size: finite.optional(), label: optText(60) })).min(1).max(VISUAL_LIMITS.scatterPoints),
})

export type ChartDataset = z.infer<typeof dataset>

function checkDataset(data: ChartDataset, chart: ChartKind, ctx: z.RefinementCtx, path: (string | number)[]) {
  const names = new Set<string>()
  for (const [index, item] of data.series.entries()) {
    if (item.values.length !== data.labels.length) ctx.addIssue({ code: "custom", path: [...path, "series", index, "values"], message: "values must align with labels" })
    const key = item.name.toLocaleLowerCase()
    if (names.has(key)) ctx.addIssue({ code: "custom", path: [...path, "series", index, "name"], message: "duplicate series" })
    names.add(key)
  }
  if (data.labels.length * data.series.length > VISUAL_LIMITS.pointsPerChart) ctx.addIssue({ code: "custom", path, message: "too many points" })
  if (chart === "pie" || chart === "donut") {
    if (data.series.length !== 1) ctx.addIssue({ code: "custom", path: [...path, "series"], message: "pie needs one series" })
    const values = data.series[0]?.values || []
    if (values.some((value) => value !== null && value < 0)) ctx.addIssue({ code: "custom", path, message: "pie values must be non-negative" })
    if (!values.some((value) => (value || 0) > 0)) ctx.addIssue({ code: "custom", path, message: "pie needs a positive total" })
  }
  if (chart === "radar" && data.labels.length < 3) ctx.addIssue({ code: "custom", path, message: "radar needs 3+ axes" })
}

const chartBlock = z.object({
  ...base,
  type: z.literal("chart"),
  chart: z.enum(CHART_KINDS),
  unit: optText(16),
  xLabel: optText(40),
  yLabel: optText(40),
  labels: dataset.shape.labels.optional(),
  series: dataset.shape.series.optional(),
  periods: z.array(period).min(2).max(VISUAL_LIMITS.periods).optional(),
  scatter: z.array(scatterSeries).min(1).max(3).optional(),
}).superRefine((block, ctx) => {
  if (block.chart === "scatter" || block.chart === "bubble") {
    if (!block.scatter) ctx.addIssue({ code: "custom", path: ["scatter"], message: "scatter data required" })
    return
  }
  if (block.periods) {
    block.periods.forEach((item, index) => checkDataset(item, block.chart, ctx, ["periods", index]))
    return
  }
  if (!block.labels || !block.series) {
    ctx.addIssue({ code: "custom", path: ["series"], message: "labels and series required" })
    return
  }
  checkDataset({ labels: block.labels, series: block.series }, block.chart, ctx, [])
})

/* -------------------------------------------------------------- dashboard */

export const METRIC_FORMATS = ["number", "percent", "currency", "duration", "compact"] as const
export const CURRENCIES = ["USD", "KZT", "EUR", "RUB"] as const

const metric = z.object({
  label: text(48),
  value: finite,
  format: z.enum(METRIC_FORMATS).optional(),
  currency: z.enum(CURRENCIES).optional(),
  unit: optText(12),
  /** Percent change against the previous period. */
  delta: finite.optional(),
  /** Whether a rise is good news (users) or bad news (churn, errors). */
  better: z.enum(["up", "down"]).optional(),
  note: optText(60),
})
const dashboardChart = z.object({
  title: optText(80),
  subtitle: optText(120),
  chart: z.enum(["line", "area", "bar"]).default("line"),
  unit: optText(16),
  labels: dataset.shape.labels,
  series: dataset.shape.series,
})
const dashboardBlock = z.object({
  ...base,
  type: z.literal("dashboard"),
  periods: z.array(z.object({
    label: text(24),
    metrics: z.array(metric).min(1).max(VISUAL_LIMITS.metricsPerPeriod),
    chart: dashboardChart.optional(),
  })).min(1).max(VISUAL_LIMITS.periods),
}).superRefine((block, ctx) => {
  block.periods.forEach((item, index) => {
    if (item.chart) checkDataset(item.chart, item.chart.chart, ctx, ["periods", index, "chart"])
  })
})

/* ------------------------------------------------------------- calculator */

const inputKey = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,31}$/u)
const calculatorBlock = z.object({
  ...base,
  type: z.literal("calculator"),
  model: z.enum(Object.keys(CALCULATOR_MODELS) as [CalculatorModelId, ...CalculatorModelId[]]),
  currency: z.enum(CURRENCIES).default("USD"),
  inputs: z.record(inputKey, z.object({
    value: finite,
    min: finite.optional(),
    max: finite.optional(),
    step: finite.optional(),
    label: optText(48),
  })).optional(),
  scenarios: z.array(z.object({ label: text(24), values: z.record(inputKey, finite) })).max(4).optional(),
}).superRefine((block, ctx) => {
  const allowed = new Set(CALCULATOR_MODELS[block.model].inputs.map((input) => input.key))
  for (const key of Object.keys(block.inputs || {})) {
    if (!allowed.has(key)) ctx.addIssue({ code: "custom", path: ["inputs", key], message: `unknown input for ${block.model}` })
    const range = block.inputs?.[key]
    if (range?.min !== undefined && range.max !== undefined && range.min >= range.max) ctx.addIssue({ code: "custom", path: ["inputs", key], message: "min must be below max" })
  }
  block.scenarios?.forEach((scenario, index) => {
    for (const key of Object.keys(scenario.values)) {
      if (!allowed.has(key)) ctx.addIssue({ code: "custom", path: ["scenarios", index, key], message: "unknown scenario input" })
    }
  })
})

/* ------------------------------------------------------------------ table */

export const COLUMN_KINDS = ["text", "number", "percent", "currency", "date"] as const
const cell = z.union([z.string().max(300).transform((value) => value.replace(CONTROL, " ").trim()), finite, z.null()])
const tableBlock = z.object({
  ...base,
  type: z.literal("table"),
  columns: z.array(z.object({
    label: text(40),
    kind: z.enum(COLUMN_KINDS).default("text"),
    unit: optText(12),
    currency: z.enum(CURRENCIES).optional(),
  })).min(1).max(VISUAL_LIMITS.tableColumns),
  rows: z.array(z.array(cell).max(VISUAL_LIMITS.tableColumns)).min(1).max(VISUAL_LIMITS.tableRows),
  highlight: z.object({ column: z.number().int().min(0), best: z.enum(["max", "min"]) }).optional(),
  pageSize: z.number().int().min(5).max(50).optional(),
}).superRefine((block, ctx) => {
  block.rows.forEach((row, index) => {
    if (row.length !== block.columns.length) ctx.addIssue({ code: "custom", path: ["rows", index], message: "row must match columns" })
    row.forEach((value, column) => {
      const kind = block.columns[column]?.kind
      if (kind && kind !== "text" && kind !== "date" && typeof value === "string") ctx.addIssue({ code: "custom", path: ["rows", index, column], message: "numeric column needs numbers" })
    })
  })
  if (block.highlight) {
    const kind = block.columns[block.highlight.column]?.kind
    if (!kind || kind === "text" || kind === "date") ctx.addIssue({ code: "custom", path: ["highlight"], message: "highlight needs a numeric column" })
  }
})

/* ------------------------------------------------------------------ graph */

export const NODE_KINDS = ["input", "router", "module", "process", "check", "output", "data", "note"] as const
const nodeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/u)
const graphBlock = z.object({
  ...base,
  type: z.literal("graph"),
  direction: z.enum(["down", "right"]).default("down"),
  nodes: z.array(z.object({
    id: nodeId,
    label: text(60),
    detail: optText(220),
    kind: z.enum(NODE_KINDS).default("process"),
  })).min(2).max(VISUAL_LIMITS.graphNodes),
  edges: z.array(z.object({
    from: nodeId,
    to: nodeId,
    label: optText(24),
    dashed: z.boolean().optional(),
  })).min(1).max(VISUAL_LIMITS.graphEdges),
}).superRefine((block, ctx) => {
  const ids = new Set<string>()
  block.nodes.forEach((node, index) => {
    if (ids.has(node.id)) ctx.addIssue({ code: "custom", path: ["nodes", index, "id"], message: "duplicate node id" })
    ids.add(node.id)
  })
  const seen = new Set<string>()
  block.edges.forEach((edge, index) => {
    if (!ids.has(edge.from) || !ids.has(edge.to)) ctx.addIssue({ code: "custom", path: ["edges", index], message: "edge to unknown node" })
    if (edge.from === edge.to) ctx.addIssue({ code: "custom", path: ["edges", index], message: "self loop" })
    const key = `${edge.from}->${edge.to}`
    if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["edges", index], message: "duplicate edge" })
    seen.add(key)
  })
})

export const visualBlockSchema = z.discriminatedUnion("type", [
  // discriminatedUnion needs plain objects; effects are applied after the type is known.
  chartBlock.innerType(),
  dashboardBlock.innerType(),
  calculatorBlock.innerType(),
  tableBlock.innerType(),
  graphBlock.innerType(),
])

const refined = { chart: chartBlock, dashboard: dashboardBlock, calculator: calculatorBlock, table: tableBlock, graph: graphBlock } as const

export type ChartBlock = z.infer<typeof chartBlock>
export type DashboardBlock = z.infer<typeof dashboardBlock>
export type CalculatorBlock = z.infer<typeof calculatorBlock>
export type TableBlock = z.infer<typeof tableBlock>
export type GraphBlock = z.infer<typeof graphBlock>
export type VisualBlock = ChartBlock | DashboardBlock | CalculatorBlock | TableBlock | GraphBlock

export type VisualParseResult =
  | { ok: true; block: VisualBlock }
  | { ok: false; reason: string; type?: string; title?: string }

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"])

/** Reject prototype-pollution keys anywhere in the payload before validation. */
function hasForbiddenKey(value: unknown, depth = 0): boolean {
  if (depth > 12) return true
  if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, depth + 1))
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key) || hasForbiddenKey((value as Record<string, unknown>)[key], depth + 1)) return true
    }
  }
  return false
}

/** Parse one ```malik-visual body. Never throws. */
export function parseVisualBlock(source: string): VisualParseResult {
  const raw = String(source || "")
  if (raw.length > VISUAL_LIMITS.bytes || new TextEncoder().encode(raw).byteLength > VISUAL_LIMITS.bytes) return { ok: false, reason: "too-large" }
  let data: unknown
  try { data = JSON.parse(raw) } catch { return { ok: false, reason: "invalid-json" } }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "not-an-object" }
  const record = data as Record<string, unknown>
  const title = typeof record.title === "string" ? record.title.replace(CONTROL, " ").trim().slice(0, 100) : undefined
  const type = typeof record.type === "string" ? record.type : undefined
  if (!isVisualEngineType(type)) return { ok: false, reason: "unknown-type", type, title }
  if (hasForbiddenKey(data)) return { ok: false, reason: "forbidden-key", type, title }
  const parsed = refined[type].safeParse(data)
  if (!parsed.success) return { ok: false, reason: parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".") || type}: ${issue.message}`).join("; "), type, title }
  return { ok: true, block: parsed.data as VisualBlock }
}

