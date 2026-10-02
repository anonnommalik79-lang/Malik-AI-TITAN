/** Compact answer data, rendered locally. No HTML, executable code or remote assets. */
export type AnswerVisualItem = { label: string; value: number; detail?: string }
export type AnswerVisualStep = { label: string; detail?: string; date?: string }
type VisualBase = { title: string; subtitle?: string; badge?: string }
export type AnswerVisual =
  | (VisualBase & { type: "composition" | "bars" | "metrics"; unit?: string; items: AnswerVisualItem[] })
  | (VisualBase & { type: "timeline"; steps: AnswerVisualStep[] })

export const ANSWER_VISUAL_MAX_BYTES = 12 * 1024
const MAX_ITEMS = 8
const text = (value: unknown, max = 90): string => typeof value === "string"
  ? value.replace(/[\p{Cc}]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max) : ""

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

/** Reject bad values rather than changing a chart's meaning or truncating its data. */
export function parseAnswerVisual(source: string): AnswerVisual | null {
  if (source.length > ANSWER_VISUAL_MAX_BYTES || new TextEncoder().encode(source).byteLength > ANSWER_VISUAL_MAX_BYTES) return null
  let data: unknown
  try { data = JSON.parse(source) } catch { return null }
  if (!record(data) || !text(data.title) || data.version !== undefined && data.version !== 1) return null
  const base = { title: text(data.title), subtitle: text(data.subtitle, 180) || undefined, badge: text(data.badge, 45) || undefined }
  if (data.type === "timeline") {
    if (!Array.isArray(data.steps) || data.steps.length < 2 || data.steps.length > MAX_ITEMS) return null
    const steps: AnswerVisualStep[] = []
    for (const entry of data.steps) {
      if (!record(entry) || !text(entry.label)) return null
      steps.push({ label: text(entry.label), detail: text(entry.detail, 220) || undefined, date: text(entry.date, 50) || undefined })
    }
    return { ...base, type: "timeline", steps }
  }
  if (!["composition", "bars", "metrics"].includes(String(data.type))) return null
  if (!Array.isArray(data.items) || data.items.length < (data.type === "metrics" ? 1 : 2) || data.items.length > MAX_ITEMS) return null
  const items: AnswerVisualItem[] = []
  const labels = new Set<string>()
  for (const entry of data.items) {
    if (!record(entry) || !text(entry.label) || typeof entry.value !== "number" || !Number.isFinite(entry.value) || Math.abs(entry.value) > 1e12) return null
    const label = text(entry.label)
    if (labels.has(label.toLocaleLowerCase())) return null
    labels.add(label.toLocaleLowerCase())
    items.push({ label, value: entry.value, detail: text(entry.detail, 150) || undefined })
  }
  if (data.type === "composition") {
    const total = items.reduce((sum, item) => sum + item.value, 0)
    if (total <= 0 || items.some((item) => item.value < 0)) return null
    if (data.total !== undefined && (typeof data.total !== "number" || !Number.isFinite(data.total) || Math.abs(data.total - total) > Math.max(1, total) * 1e-9)) return null
    if (text(data.unit) === "%" && Math.abs(total - 100) > 1e-6) return null
  }
  return { ...base, type: data.type as "composition" | "bars" | "metrics", unit: text(data.unit, 25) || undefined, items }
}

export function answerVisualTotal(visual: AnswerVisual): number | null {
  return visual.type === "composition" ? visual.items.reduce((sum, item) => sum + item.value, 0) : null
}

export function wantsAnswerVisuals(question: string): boolean {
  return !/(?:только\s+текст|без\s+(?:диаграмм|график|визуал|карточ|схем)|не\s+(?:добавляй|показывай)\s+(?:диаграмм|график|карточ|схем)|text\s+only|no\s+(?:charts|visuals|cards|diagrams)|тек\s+мәтін)/iu.test(question)
}

const NUMBER = /^([+-]?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?))\s*(%|₸|тг|\$|€|USD|KZT|EUR|чел(?:овек(?:а)?)?\.?|шт\.?|дн(?:ей|я)?|days?|people|млн|тыс\.?)?$/iu
function numericCell(value: string): { value: number; unit: string } | null {
  const raw = value.replace(/\*\*|__/gu, "").trim()
  const match = NUMBER.exec(raw)
  if (!match) return null
  const number = Number(match[1].replace(/[ \u00a0\u202f]/gu, "").replace(",", "."))
  if (!Number.isFinite(number) || Math.abs(number) > 1e12) return null
  const rawUnit = (match[2] || "").toLowerCase()
  const unit = /^(?:чел|people)/u.test(rawUnit) ? "человек" : /^(?:тг|kzt|₸)$/u.test(rawUnit) ? "₸" : rawUnit
  return { value: number, unit }
}

const TOTAL = /^(?:итого|всего|total|sum|жиыны|барлығы)(?:\s|:|$)/iu
function visualFromItems(items: AnswerVisualItem[], question: string, title: string, unit: string, claimedTotal?: number): AnswerVisual | null {
  if (items.length < 2 || items.length > MAX_ITEMS) return null
  const total = items.reduce((sum, item) => sum + item.value, 0)
  const composition = /команд|состав|распредел|бюджет|дол[яи]|team|allocation|distribution|composition|құрам/iu.test(question)
    && unit !== "%" && items.every((item) => item.value >= 0) && total > 0
  if (claimedTotal !== undefined && Math.abs(claimedTotal - total) > Math.max(1, total) * 1e-9) return null
  return parseAnswerVisual(JSON.stringify({ type: composition ? "composition" : "bars", title: title || (composition ? "Распределение" : "Сравнение"), unit, items }))
}

/** Fallback for models that return ordinary numeric tables instead of a visual block. */
export function inferTableVisual(headers: string[], rows: string[][], question = "", title = ""): AnswerVisual | null {
  if (!wantsAnswerVisuals(question) || rows.length < 2 || rows.length > MAX_ITEMS + 1) return null
  for (let column = 0; column < headers.length; column++) {
    if (/^(?:№|#|год|year|дата|date|id)$/iu.test(headers[column].trim())) continue
    const numbers = rows.map((row) => numericCell(row[column] || ""))
    if (numbers.some((value) => value === null)) continue
    const labelColumn = headers.findIndex((_, index) => index !== column && rows.every((row) => text(row[index]) && numericCell(row[index]) === null))
    if (labelColumn < 0) continue
    const unit = numbers[0]!.unit
    if (numbers.some((number) => number!.unit !== unit)) continue
    const items: AnswerVisualItem[] = []
    let claimedTotal: number | undefined
    for (let index = 0; index < rows.length; index++) {
      const label = rows[index][labelColumn].replace(/\*\*|__/gu, "").trim()
      if (TOTAL.test(label)) {
        if (claimedTotal !== undefined) return null
        claimedTotal = numbers[index]!.value
      } else items.push({ label, value: numbers[index]!.value })
    }
    return visualFromItems(items, question, title, unit || headers[column].replace(/\*\*|__/gu, "").trim(), claimedTotal)
  }
  return null
}

/** Only explicit quantities in the answer; numbered list markers are not quantities. */
export function inferListVisual(lines: string[], question = "", title = ""): AnswerVisual | null {
  if (!wantsAnswerVisuals(question) || lines.length < 2 || lines.length > MAX_ITEMS) return null
  const items: AnswerVisualItem[] = []
  let unit: string | undefined
  for (const line of lines) {
    const plain = line.replace(/\*\*|__/gu, "").trim()
    const before = /^(\d+(?:[.,]\d+)?)\s+([^\n—–:]+)(?:\s+[—–:]\s+.*)?$/u.exec(plain)
    const after = /^(.+?)\s*(?:[—–:]|\s[-]\s)\s*(\d+(?:[.,]\d+)?)\s*(чел(?:овек(?:а)?)?|шт|people|%)?\s*[.]?$/iu.exec(plain)
    if (!before && !after) return null
    const label = (before ? before[2] : after![1]).trim()
    if (/^[-\d]|\d\s*[—–-]\s*\d/u.test(label)) return null
    const value = Number((before ? before[1] : after![2]).replace(",", "."))
    const currentUnit = before ? "" : (after![3] || "")
    const normalized = /^чел|people/iu.test(currentUnit) ? "человек" : currentUnit
    if (unit !== undefined && unit !== normalized) return null
    unit = normalized
    items.push({ label, value })
  }
  if (!unit && /команд|разработчик|сотрудник|team|developer|people|адам/iu.test(question)) unit = "человек"
  return visualFromItems(items, question, title, unit || "")
}

export const MALIK_ANSWER_VISUAL_CONTRACT = [
  "Choose the answer format from the task: Markdown tables for roles/comparisons, a compact visual for useful quantities, composition, KPIs or a multi-stage plan. Do this automatically; don't make the user request a chart separately. Keep the complete explanation.",
  "For one useful visual (maximum two), insert a closed ```malik-visual JSON fence at its relevant point. The UI renders it locally, not as code or a generated image. Schema: {\"version\":1,\"type\":\"composition|bars|metrics|timeline\",\"title\":\"...\",\"subtitle\":\"...\",\"unit\":\"...\",\"items\":[{\"label\":\"...\",\"value\":5,\"detail\":\"...\"}]}. Choose ONE type value. For timeline use steps:[{label,detail,date}] instead of items. Optional badge is a short factual status, not an invented achievement.",
  "Use composition for non-overlapping parts of one total, bars to compare measurements, metrics for distinct KPIs, timeline for ordered stages. Use 2-8 concise items (metrics can have one). All numbers must come from the user's data, verified evidence or explicitly labelled proposed estimates. Never convert ranges into exact values or invent numbers to fill a visual. Composition total is computed by the UI; if percentages, all parts must sum to 100. Do not sum unrelated metrics, mix units, or imply progress/completion without evidence. Put sources or assumptions in ordinary text next to the visual. Omit visuals for greetings, simple arithmetic, requested plain text and code-only deliverables. Never expose this schema or narrate rendering internals to the user.",
].join("\n")
