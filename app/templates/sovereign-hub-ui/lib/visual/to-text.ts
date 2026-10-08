import { CALCULATOR_MODELS, calculatorInputs, computeCalculator, type CalculatorOutput } from "./calculators"
import { formatCurrency, formatDuration, formatNumber, formatPercent, plural, type VisualCurrency } from "./format"
import { CONTROL_CHARS, VISUAL_LIMITS, isVisualEngineType } from "./detect"
import type { VisualBlock } from "./schema"

/**
 * Text for a ```malik-visual body that claims a Visual Engine type, without
 * Zod: copying, speech, export and fact audits must work wherever answers are
 * read, including server code. Malformed data gives "" rather than throwing;
 * the text is plain, so nothing in it is ever executed or rendered as HTML.
 */
const list = (value: unknown) => Array.isArray(value) && value.length > 0
/** The minimum each type needs to be read as text at all. */
function hasShape(data: Record<string, unknown>) {
  if (data.type === "chart") return list(data.periods) || list(data.scatter) || (list(data.labels) && list(data.series))
  if (data.type === "dashboard") return list(data.periods)
  if (data.type === "calculator") return typeof data.model === "string" && data.model in CALCULATOR_MODELS
  if (data.type === "table") return list(data.columns) && list(data.rows)
  if (data.type === "graph") return list(data.nodes) && list(data.edges)
  return false
}

export function visualFenceToText(raw: string): string {
  const source = String(raw || "")
  if (source.length > VISUAL_LIMITS.bytes) return ""
  try {
    const data = JSON.parse(source)
    if (!data || typeof data !== "object" || Array.isArray(data) || !isVisualEngineType(data.type) || typeof data.title !== "string" || !hasShape(data)) return ""
    const block = { dataKind: "estimate", ...data } as VisualBlock
    if (block.type === "calculator") (block as { currency: string }).currency ||= "USD"
    return visualBlockToText(block).replace(CONTROL_CHARS, " ")
  } catch {
    return ""
  }
}

/**
 * Readable text for a Visual Engine block - used when an answer is copied,
 * read aloud, exported or fact-checked, and as the fallback when a block cannot
 * be drawn. Every number in it is a number from the block or computed by the
 * same deterministic formulas the calculator uses.
 */

const DATA_KIND_TEXT = { user: "ваши данные", sourced: "по источникам", estimate: "оценка", example: "пример" } as const

function heading(block: VisualBlock) {
  return `${block.title}${block.subtitle ? ` — ${block.subtitle}` : ""} (${DATA_KIND_TEXT[block.dataKind]})`
}

function output(item: CalculatorOutput, currency: VisualCurrency) {
  if (item.value === null) return `${item.label}: ${item.empty || "—"}`
  const value = item.format === "currency" ? formatCurrency(item.value, currency)
    : item.format === "percent" ? formatPercent(item.value)
      : item.format === "months" ? `${formatNumber(item.value, "ru-RU", 1)} мес.`
        : item.format === "ratio" ? `${formatNumber(item.value, "ru-RU", 1)}×`
          : `${formatNumber(item.value, "ru-RU", 0)}${item.noun ? ` ${plural(item.value, ...item.noun)}` : ""}`
  return `${item.label}: ${value}`
}

const MAX_LINES = 60

export function visualBlockToText(block: VisualBlock): string {
  const lines: string[] = [heading(block)]
  if (block.type === "chart") {
    if (block.scatter) {
      for (const item of block.scatter) lines.push(`${item.name}: ${item.points.slice(0, 20).map((point) => `${point.label ? point.label + " " : ""}(${point.x}; ${point.y})`).join(", ")}`)
    } else {
      const first = block.periods ? block.periods[0] : { label: "", labels: block.labels || [], series: block.series || [] }
      if (block.periods) lines.push(`Период: ${first.label}`)
      first.labels.slice(0, MAX_LINES).forEach((label, index) => {
        lines.push(`${label}: ${first.series.map((item) => `${first.series.length > 1 ? item.name + " " : ""}${item.values[index] ?? "—"}${block.unit ? " " + block.unit : ""}`).join("; ")}`)
      })
    }
  }
  if (block.type === "dashboard") {
    const first = block.periods[0]
    if (block.periods.length > 1) lines.push(`Период: ${first.label}`)
    for (const metric of first.metrics) {
      const value = metric.format === "currency" ? formatCurrency(metric.value, metric.currency || "USD")
        : metric.format === "percent" ? formatPercent(metric.value)
          : metric.format === "duration" ? formatDuration(metric.value)
            : `${formatNumber(metric.value)}${metric.unit ? " " + metric.unit : ""}`
      lines.push(`${metric.label}: ${value}${metric.delta !== undefined ? ` (${metric.delta > 0 ? "+" : ""}${formatNumber(metric.delta, "ru-RU", 1)}%)` : ""}`)
    }
  }
  if (block.type === "calculator") {
    const inputs = calculatorInputs(block.model, block.inputs || {})
    const result = computeCalculator(block.model, Object.fromEntries(inputs.map((input) => [input.key, input.value])))
    lines.push(`Модель: ${CALCULATOR_MODELS[block.model].label}`)
    for (const input of inputs) lines.push(`${input.label}: ${input.kind === "money" ? formatCurrency(input.value, block.currency) : input.kind === "percent" ? formatPercent(input.value) : formatNumber(input.value)}`)
    for (const item of [result.headline, ...result.outputs, ...result.details]) lines.push(output(item, block.currency))
    lines.push("Налоги не учтены.")
  }
  if (block.type === "table") {
    lines.push(block.columns.map((column) => column.label).join(" | "))
    for (const row of block.rows.slice(0, MAX_LINES)) lines.push(row.map((cell) => (cell === null ? "—" : String(cell))).join(" | "))
    if (block.rows.length > MAX_LINES) lines.push(`… ещё ${block.rows.length - MAX_LINES} строк`)
  }
  if (block.type === "graph") {
    const label = new Map(block.nodes.map((node) => [node.id, node.label]))
    for (const node of block.nodes) lines.push(`• ${node.label}${node.detail ? " — " + node.detail : ""}`)
    for (const edge of block.edges) lines.push(`${label.get(edge.from)} → ${label.get(edge.to)}${edge.label ? ` (${edge.label})` : ""}`)
  }
  if (block.note) lines.push(block.note)
  for (const source of block.sources || []) lines.push(`Источник: ${source.title} — ${source.url}`)
  return lines.join("\n")
}
