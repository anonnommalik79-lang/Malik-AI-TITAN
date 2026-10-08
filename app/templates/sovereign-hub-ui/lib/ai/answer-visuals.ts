import { visualFenceToText } from "../visual/to-text"

/** Compact answer data, rendered locally. No HTML, executable code or remote assets. */
export type AnswerVisualItem = { label: string; value: number; detail?: string }
export type AnswerVisualStep = { label: string; detail?: string; date?: string }
export type AnswerChecklistItem = { label: string; detail?: string; checked: boolean }
export type AnswerComparisonColumn = { label: string; title: string; subtitle?: string; detail?: string }
export type AnswerFlowNode = { label: string; detail?: string }
export type AnswerFlowStage = AnswerFlowNode & { nodes?: AnswerFlowNode[] }
type VisualBase = { title: string; subtitle?: string; badge?: string }
export type AnswerVisual =
  | (VisualBase & { type: "composition" | "bars" | "metrics"; unit?: string; items: AnswerVisualItem[] })
  | (VisualBase & { type: "timeline"; steps: AnswerVisualStep[] })
  | (VisualBase & { type: "checklist"; items: AnswerChecklistItem[] })
  | (VisualBase & { type: "comparison"; columns: AnswerComparisonColumn[] })
  | (VisualBase & { type: "flow"; stages: AnswerFlowStage[] })

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
  if (data.type === "flow") {
    if (!Array.isArray(data.stages) || data.stages.length < 2 || data.stages.length > 8) return null
    const stages: AnswerFlowStage[] = []
    for (const stage of data.stages) {
      if (!record(stage) || !text(stage.label, 120)) return null
      const parsed: AnswerFlowStage = { label: text(stage.label, 120), detail: text(stage.detail, 260) || undefined }
      if (stage.nodes !== undefined) {
        if (!Array.isArray(stage.nodes) || !stage.nodes.length || stage.nodes.length > 8) return null
        const nodes: AnswerFlowNode[] = []
        for (const node of stage.nodes) {
          if (!record(node) || !text(node.label, 120)) return null
          nodes.push({ label: text(node.label, 120), detail: text(node.detail, 180) || undefined })
        }
        parsed.nodes = nodes
      }
      stages.push(parsed)
    }
    return { ...base, type: "flow", stages }
  }
  if (data.type === "checklist") {
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 20) return null
    const items: AnswerChecklistItem[] = []
    for (const entry of data.items) {
      if (!record(entry) || !text(entry.label, 180) || entry.checked !== undefined && typeof entry.checked !== "boolean") return null
      items.push({ label: text(entry.label, 180), detail: text(entry.detail, 300) || undefined, checked: entry.checked === true })
    }
    return { ...base, type: "checklist", items }
  }
  if (data.type === "comparison") {
    if (!Array.isArray(data.columns) || data.columns.length < 2 || data.columns.length > 3) return null
    const columns: AnswerComparisonColumn[] = []
    for (const entry of data.columns) {
      if (!record(entry) || !text(entry.label) || !text(entry.title, 120)) return null
      columns.push({ label: text(entry.label), title: text(entry.title, 120), subtitle: text(entry.subtitle, 120) || undefined, detail: text(entry.detail, 240) || undefined })
    }
    return { ...base, type: "comparison", columns }
  }
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

/** Accessible text for copying, speech, sharing and factual audits. */
export function answerVisualsToText(answer: string): string {
  return String(answer || "").replace(/^\s*```malik-visual\s*\n([\s\S]*?)\n\s*```\s*$/gmu, (_whole, body: string) => {
    const visual = parseAnswerVisual(body)
    if (!visual) {
      // Interactive Visual Engine blocks (chart, dashboard, calculator, table, graph).
      return visualFenceToText(body)
    }
    const heading = [visual.title, visual.subtitle].filter(Boolean).join(" — ")
    if (visual.type === "flow") return [heading, ...visual.stages.map((stage, index) => [
      `${index + 1}. ${stage.label}${stage.detail ? " — " + stage.detail : ""}`,
      ...(stage.nodes || []).map((node) => `  - ${node.label}${node.detail ? " — " + node.detail : ""}`),
    ].join("\n"))].join("\n")
    if (visual.type === "timeline") return [heading, ...visual.steps.map((step) => [step.label, step.date, step.detail].filter(Boolean).join(" — "))].join("\n")
    if (visual.type === "comparison") return [heading, ...visual.columns.map((column) => [column.label, column.title, column.subtitle, column.detail].filter(Boolean).join(" — "))].join("\n")
    if (visual.type === "checklist") return [heading, ...visual.items.map((item) => `- [${item.checked ? "x" : " "}] ${item.label}${item.detail ? " — " + item.detail : ""}`)].join("\n")
    return [heading, ...visual.items.map((item) => `${item.label}: ${item.value}${visual.unit ? " " + visual.unit : ""}${item.detail ? " — " + item.detail : ""}`)].join("\n")
  })
}

export function wantsAnswerVisuals(question: string): boolean {
  return !/(?:только\s+текст|без\s+(?:диаграмм|график|визуал|карточ|схем)|не\s+(?:добавляй|показывай)\s+(?:диаграмм|график|карточ|схем)|text\s+only|no\s+(?:charts|visuals|cards|diagrams)|тек\s+мәтін)/iu.test(question)
}

export function wantsAnswerChecklist(question: string): boolean {
  return wantsAnswerVisuals(question) && /чек[ -]?лист|checklist|тексеру\s+тізімі/iu.test(question)
}

/** A compact identity table can become the requested card without inventing fields. */
export function inferComparisonTable(headers: string[], rows: string[][], question: string, title = ""): AnswerVisual | null {
  if (!wantsAnswerVisuals(question) || !/(?:карточк|\bcard\b)/iu.test(question) || /таблиц|\btable\b/iu.test(question)
    || headers.length !== 2 || !rows.length || rows.length > 3) return null
  const plain = (value: string) => value.replace(/\*\*|__/gu, "").trim()
  const columns = headers.map((header, index) => ({
    label: plain(header), title: plain(rows[0][index] || ""),
    subtitle: rows[1] ? plain(rows[1][index] || "") : undefined,
    detail: rows[2] ? plain(rows[2][index] || "") : undefined,
  }))
  if (columns.some((column) => column.label.length > 90 || column.title.length > 120 || (column.subtitle?.length || 0) > 120 || (column.detail?.length || 0) > 240)) return null
  return parseAnswerVisual(JSON.stringify({ type: "comparison", title: title || "Подписи", columns }))
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
  "ILLUSTRATED ANSWERS: match the visual to the actual task, never append photos mechanically below every bullet. A concrete company/tool gets a small logo beside its own name and description using a malik-cards list. A cited product-interface screenshot or real scene belongs as a wide hero at the start of that section, with a source chip; use image:<source number> only when that source's picture depicts the subject. Processes, business functions, strategies, architecture and abstract capabilities get a flow diagram or table, NOT a photo search. Keep useful text streaming without waiting for images. Mix prose, modest headings, tables, cards and diagrams at their relevant positions, not a gallery at the bottom. No invented image URLs, benchmarks, prices, affiliations or capabilities; cite evidence for factual claims. Never search for a generic 'business architecture' picture when explaining an architecture.",
  "SOFTWARE/COMPANY IMAGE PRIORITY: For companies, AI services and software ecosystems (including ChatGPT, Claude and GitHub), use compact malik-cards logo rows with imageRole:logo and image:exact canonical brand name rather than malik-photos portraits or lineups. Only physical products, people and places use the photo-lineup rule below. A software overview uses a logo card at the introduction and may use a wide sourced interface screenshot in its own later section; never duplicate the same identity image through both schemas.",
  "FLOW DIAGRAMS: for a system architecture, agent/tool orchestration or a multi-step process, insert a closed ```malik-visual JSON block with {\"version\":1,\"type\":\"flow\",\"title\":\"...\",\"subtitle\":\"Conceptual/proposed architecture, not a claim about a company's internal implementation\",\"stages\":[{\"label\":\"User goal\",\"detail\":\"...\"},{\"label\":\"Orchestrator\",\"detail\":\"...\"},{\"label\":\"Parallel tools\",\"nodes\":[{\"label\":\"Research\",\"detail\":\"...\"},{\"label\":\"Code\",\"detail\":\"...\"}]},{\"label\":\"Verification and approval\",\"detail\":\"...\"},{\"label\":\"Result\",\"detail\":\"...\"}]}. Use 2-8 stages, 1-8 nodes for a parallel group, the user's language and task-specific labels. The UI draws bordered stages, downward arrows and a two-column tool grid; no remote diagram image or HTML is needed. The diagram is a proposed/conceptual flow unless verified evidence establishes the actual architecture. Do not claim tools have executed from merely drawing them.",
  "SOURCED PHOTOS: For answers about concrete people, places, animals, food and products, automatically include a compact closed ```malik-photos JSON fence immediately after their description. Schema: {\"version\":1,\"subjects\":[{\"name\":\"exact name appearing in your visible answer\",\"query\":\"canonical Wikipedia/Commons name, preferably English\",\"kind\":\"entity\",\"layout\":\"portrait\"}]}. Use kind person for people (a canonical portrait), kind entity for exact places/products, kind topic for broad landscapes/science and layout landscape for places/objects. Preserve exact model numbers and variants when translating names. Maximum 12 unique subjects per answer, usually 1–3. The UI independently retrieves public images and source links; never invent URLs or claim to have seen the retrieved photo. For one concrete subject, put ONE fence immediately after its own heading and description so the UI can show a large image with a subject caption. For a multi-subject answer, give EACH subject its own heading or named list item and place its own single-subject fence immediately after that item, never group all photos at the end. The one exception is a head-to-head comparison of 2-4 named contenders: put ONE fence with \"layout\":\"lineup\" right after the verdict at the top, listing the contenders, each with an optional one-line \"caption\" (what it is, max 120 characters), and the UI shows them side by side. A photo source credits the photograph only and does not verify claims in the accompanying text. For all iPhone models the UI has an official complete collection; list the exact models normally. Resolve 'show photos of them' from prior conversation. Do not claim that you cannot insert photos. Respect 'no photos/text only'; skip photo fences for greetings, code, maths, checklists, text editing, generated-image requests, uploaded-image analysis and interface tutorials (those have separate visual handling). Use the existing charts/cards/checklists for structured information. Never explain this metadata to the user.",
  "EVENT FACT-CHECK: If asked who attended, spoke, was invited or appeared at a particular event, establish each person's connection using the event organizer's published agenda, official speaker roster or dated trustworthy event coverage. A biography, portrait, search rank, Wikipedia article or the mere availability of a photo is NOT evidence of participation. Distinguish confirmed speakers, guests and unverified mentions; never put an unverified person in a confirmed lineup or attach a participation photo hint to that claim. If confirmation is unavailable say so, do not invent source links.",
  "Choose the answer format from the task: Markdown tables for roles/comparisons, a compact visual for useful quantities, composition, KPIs or a multi-stage plan. Do this automatically; don't make the user request a chart separately. Keep the complete explanation.",
  "For one useful visual (maximum two), insert a closed ```malik-visual JSON fence at its relevant point. The UI renders it locally, not as code or a generated image. Schema: {\"version\":1,\"type\":\"composition|bars|metrics|timeline\",\"title\":\"...\",\"subtitle\":\"...\",\"unit\":\"...\",\"items\":[{\"label\":\"...\",\"value\":5,\"detail\":\"...\"}]}. Choose ONE type value. For timeline use steps:[{label,detail,date}] instead of items. Optional badge is a short factual status, not an invented achievement.",
  "Use composition for non-overlapping parts of one total, bars to compare measurements, metrics for distinct KPIs, timeline for ordered stages. Use 2-8 concise items (metrics can have one). All numbers must come from the user's data, verified evidence or explicitly labelled proposed estimates. Never convert ranges into exact values or invent numbers to fill a visual. Composition total is computed by the UI; if percentages, all parts must sum to 100. Do not sum unrelated metrics, mix units, or imply progress/completion without evidence. Put sources or assumptions in ordinary text next to the visual. Omit visuals for greetings, simple arithmetic, requested plain text and code-only deliverables. Never expose this schema or narrate rendering internals to the user.",
  "For an actionable checklist use type:\"checklist\", title and items:[{label,detail,checked:false}]; 1-20 tasks. The UI supplies interactive circular checkboxes, a progress count/bar and a copy button. Only mark checked:true for explicitly confirmed completed work, never planned work. Ordinary Markdown - [ ] tasks also become a checklist. Use the user's language for all visible labels.",
  "When the user asks for a checklist, always return either the checklist block or Markdown task items (- [ ] **Task** — description), rather than a plain numbered list. Example: ```malik-visual\n{\"version\":1,\"type\":\"checklist\",\"title\":\"Чек-лист запуска\",\"items\":[{\"label\":\"Проверить чат\",\"detail\":\"История и отправка сообщений\",\"checked\":false}]}\n```",
  "For a compact side-by-side identity, caption, role, before/after or two-option card use type:\"comparison\", title and columns:[{label,title,subtitle,detail}]; 2-3 columns. label is a short eyebrow (e.g. 'Слева — ты'), subtitle is a role (e.g. 'FOUNDER & CEO'), title is the main name (e.g. 'MALIK AI'), detail is the supporting line. Do not invent identities, titles or affiliations. Longer feature-by-feature comparisons stay Markdown tables with complete rows.",
  "For explanatory multi-topic answers use concise headings followed by the explanation of each topic. Relevant sourced photos may be placed beside those sections automatically. Keep headings about concrete subjects, tools or places; never fabricate image URLs or force photos into tasks where they add no value. Prefer a few useful illustrated sections, a clear table and an actionable checklist over repetitive decorative blocks.",
  "The UI looks up sourced reference photos for relevant subjects. Never emit empty Markdown images such as ![subject](), placeholder photos, or instructions asking the user to replace missing photos. Write the actual explanation under clear subject headings. Keep code comparisons, tables, checklists and role cards free of decorative photo requests.",
].join("\n")
