/** Public execution receipts only. Never put prompts, credentials or private reasoning here. */
export type ExecutionKind = "status" | "search" | "read" | "plugin" | "file" | "model" | "code" | "media"
export type ExecutionState = "running" | "completed" | "failed" | "cancelled" | "interrupted"
export type ExecutionStep = {
  id: string
  title: string
  kind: ExecutionKind
  state: ExecutionState
  startedAt: number
  endedAt?: number
  tool?: string
  input?: string
  output?: string
  error?: string
  url?: string
}
export type ExecutionTrace = {
  version: 1
  id: string
  startedAt: number
  endedAt?: number
  state: ExecutionState
  model?: string
  steps: ExecutionStep[]
}
export type ExecutionSource = { url: string; title?: string; domain?: string }
export const MAX_EXECUTION_STEPS = 80
export const MAX_EXECUTION_BYTES = 64 * 1024
const KINDS = new Set<ExecutionKind>(["status", "search", "read", "plugin", "file", "model", "code", "media"])
const STATES = new Set<ExecutionState>(["running", "completed", "failed", "cancelled", "interrupted"])

function boundExecutionSteps(steps: ExecutionStep[]): ExecutionStep[] {
  const encoder = new TextEncoder()
  const records = steps.slice(-MAX_EXECUTION_STEPS).map((step) => {
    const compact = { ...step, input: undefined, output: undefined, error: step.error ? publicExecutionText(step.error, 160) : undefined }
    return { step, compact, size: encoder.encode(JSON.stringify(compact)).byteLength + 1 }
  })
  let baseline = records.reduce((sum, record) => sum + record.size, 2)
  while (baseline > MAX_EXECUTION_BYTES && records.length) baseline -= records.shift()!.size
  let remaining = MAX_EXECUTION_BYTES - baseline
  return records.reverse().map(({ step, compact, size }) => {
    const extra = encoder.encode(JSON.stringify(step)).byteLength + 1 - size
    if (extra > remaining) return compact
    remaining -= extra
    return step
  }).reverse()
}

/** Only URLs present in real tool receipts or supplied verified sources. */
export function executionSources(trace: ExecutionTrace, supplied: ExecutionSource[] = []): ExecutionSource[] {
  const candidates: ExecutionSource[] = [...supplied]
  for (const step of trace.steps) {
    if (step.kind === "read" && step.url) candidates.push({ url: step.url, title: step.title })
    if (!step.output || step.kind !== "search") continue
    try {
      const data = JSON.parse(step.output) as { sources?: unknown }
      if (!Array.isArray(data.sources)) continue
      for (const item of data.sources.slice(0, 24)) {
        if (item && typeof item === "object" && typeof item.url === "string") candidates.push({ url: item.url, title: typeof item.title === "string" ? item.title : undefined })
      }
    } catch { /* Plain-text output remains in the expandable receipt. */ }
  }
  const unique = new Map<string, ExecutionSource>()
  for (const source of candidates) {
    const url = executionUrl(source.url)
    if (!url || !/^https?:\/\//i.test(source.url)) continue
    unique.set(url, { url, title: source.title ? publicExecutionText(source.title, 180) : undefined, domain: new URL(url).hostname.replace(/^www\./, "") })
    if (unique.size === 24) break
  }
  return [...unique.values()]
}

export function publicExecutionText(value: unknown, limit = 6000): string {
  let text: string
  try { text = typeof value === "string" ? value : JSON.stringify(value, (key, item) =>
    /^(authorization|cookie|.*token|.*secret|.*password|.*api[_-]?key|base64|media_b64|systemPrompt|reasoning|thoughts)$/i.test(key) ? "[скрыто]" : item, 2) || "" }
  catch { text = "[Данные недоступны]" }
  text = text.replace(/\b(?:sk-(?:proj-)?[\w-]{12,}|gh[pousr]_[\w]{20,})\b/gi, "[скрыто]")
    .replace(/(Bearer\s+)[\w.~+/-]+/gi, "$1[скрыто]")
    .replace(/((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|token|secret|password|authorization|cookie)\s*["']?\s*[:=]\s*["']?)[^\s,;"'}]+/gi, "$1[скрыто]")
    .replace(/data:[^\s"']+;base64,[a-z0-9+/=]+/gi, "[медиаданные скрыты]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[скрыто]@")
  return text.length > limit ? text.slice(0, limit) + "\n… [сокращено]" : text
}

export function executionUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value || ""), "https://malikaiworld.world")
    if (!/^https?:$/.test(url.protocol)) return undefined
    url.username = ""; url.password = ""
    for (const key of [...url.searchParams.keys()]) if (/token|secret|key|signature|credential|auth/i.test(key)) url.searchParams.set(key, "[скрыто]")
    return url.toString()
  } catch { return undefined }
}

export function normalizeExecutionStep(value: unknown): ExecutionStep | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  if (typeof item.id !== "string" || !item.id || !KINDS.has(item.kind as ExecutionKind) || !STATES.has(item.state as ExecutionState)) return null
  const startedAt = Number(item.startedAt)
  if (!Number.isFinite(startedAt) || startedAt < 0) return null
  const endedAt = Number(item.endedAt)
  return {
    id: item.id.slice(0, 160), title: publicExecutionText(item.title, 180), kind: item.kind as ExecutionKind,
    state: item.state as ExecutionState, startedAt,
    endedAt: Number.isFinite(endedAt) && endedAt >= startedAt ? endedAt : undefined,
    tool: item.tool ? publicExecutionText(item.tool, 100) : undefined,
    input: item.input ? publicExecutionText(item.input) : undefined,
    output: item.output ? publicExecutionText(item.output) : undefined,
    error: item.error ? publicExecutionText(item.error, 2000) : undefined,
    url: item.url ? executionUrl(item.url) : undefined,
  }
}

/** Upserts by tool-call ID; terminal receipts cannot regress on a delayed packet. */
export function upsertExecutionStep(trace: ExecutionTrace, value: unknown): ExecutionTrace {
  const step = normalizeExecutionStep(value)
  if (!step) return trace
  const previous = trace.steps.find((item) => item.id === step.id)
  if (previous && previous.state !== "running" && step.state === "running") return trace
  const steps = previous ? trace.steps.map((item) => item.id === step.id ? { ...item, ...step } : item) : [...trace.steps, step].slice(-MAX_EXECUTION_STEPS)
  return { ...trace, steps: boundExecutionSteps(steps) }
}

export function settleExecution(trace: ExecutionTrace, state: ExecutionState, at = Date.now()): ExecutionTrace {
  return { ...trace, state, endedAt: at, steps: boundExecutionSteps(trace.steps.map((step) => step.state === "running"
    ? { ...step, state: state === "completed" ? "interrupted" : state, endedAt: at } : step)) }
}

export function normalizeExecutionTrace(value: unknown, recovered = false): ExecutionTrace | undefined {
  if (!value || typeof value !== "object") return undefined
  const item = value as Record<string, unknown>
  if (item.version !== 1 || typeof item.id !== "string" || !Array.isArray(item.steps) || !Number.isFinite(Number(item.startedAt))) return undefined
  const trace: ExecutionTrace = {
    version: 1, id: item.id.slice(0, 160), startedAt: Number(item.startedAt),
    endedAt: Number.isFinite(Number(item.endedAt)) ? Number(item.endedAt) : undefined,
    state: STATES.has(item.state as ExecutionState) ? item.state as ExecutionState : "interrupted",
    model: item.model ? publicExecutionText(item.model, 120) : undefined,
    steps: boundExecutionSteps(item.steps.map(normalizeExecutionStep).filter((step): step is ExecutionStep => Boolean(step))),
  }
  return recovered && trace.state === "running" ? settleExecution(trace, "interrupted", trace.steps.at(-1)?.endedAt || trace.steps.at(-1)?.startedAt || trace.startedAt) : trace
}

export function executionMarkdown(trace: ExecutionTrace) {
  return [`# Malik AI · Отчёт выполнения`, `ID: ${trace.id}`, `Статус: ${trace.state}`, trace.model ? `Модель: ${trace.model}` : "",
    `Время: ${new Date(trace.startedAt).toISOString()}`, "", "Фактические действия системы; не внутренние рассуждения модели.", "",
    ...trace.steps.flatMap((step) => [`## ${step.title}`, `${step.state} · ${step.tool || step.kind} · ${Math.max(0, (step.endedAt || trace.endedAt || step.startedAt) - step.startedAt)} мс`,
      step.input ? `\nВход:\n\n\`\`\`text\n${step.input.replace(/```/g, "''' ")}\n\`\`\`` : "",
      step.output ? `\nРезультат:\n\n${step.output}` : "", step.error ? `\nОшибка: ${step.error}` : "", step.url ? `\nИсточник: ${step.url}` : "", ""]),
  ].filter(Boolean).join("\n")
}

export function createExecutionReporter(emit: (step: ExecutionStep) => void, model?: string, now = Date.now) {
  let counter = 0
  let trace: ExecutionTrace = { version: 1, id: crypto.randomUUID(), startedAt: now(), state: "running", model, steps: [] }
  const publish = (step: ExecutionStep) => { trace = upsertExecutionStep(trace, step); const safe = trace.steps.find((item) => item.id === step.id); if (safe) emit(safe) }
  return {
    start(title: string, kind: ExecutionKind, tool?: string, input?: unknown, url?: string) {
      const id = `${trace.id}:${++counter}`
      publish({ id, title, kind, tool, input: input === undefined ? undefined : publicExecutionText(input), url, state: "running", startedAt: now() })
      return id
    },
    finish(id: string | undefined, output?: unknown, state: ExecutionState = "completed", error?: unknown) {
      const step = trace.steps.find((item) => item.id === id)
      if (step) publish({ ...step, state, endedAt: now(), output: output === undefined ? undefined : publicExecutionText(output), error: error ? publicExecutionText(error, 2000) : undefined })
    },
    status(text: string, kind: ExecutionKind = "status") {
      if (!text || trace.steps.at(-1)?.title === text) return
      const id = `${trace.id}:${++counter}`
      publish({ id, title: text, kind, state: "completed", startedAt: now(), endedAt: now() })
    },
    settle(state: ExecutionState) { trace = settleExecution(trace, state, now()); return trace },
    snapshot() { return trace },
  }
}
export type ExecutionReporter = ReturnType<typeof createExecutionReporter>
