import { executionSources, publicExecutionText, type ExecutionSource, type ExecutionStep, type ExecutionTrace } from "./chat-execution"

/** Presentation of observed receipts, never an LLM's private reasoning. */
export type ActivityFilter = "all" | "sources" | "tools" | "problems"
export const ACTIVITY_FILTERS = [
  { id: "all", label: "Все действия" }, { id: "sources", label: "Поиск и источники" },
  { id: "tools", label: "Инструменты" }, { id: "problems", label: "Ошибки и остановки" },
] as const

function payload(step: ExecutionStep): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(step.output || "null")
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch { return {} }
}

/** Keep search metadata valid JSON even when a provider returns very long URLs.
 * The counts describe the observed pool; omitted details are labelled explicitly. */
export function compactSearchReceipt(sources: ExecutionSource[], details: Record<string, unknown>): string {
  let safe: Record<string, unknown>
  try { safe = JSON.parse(publicExecutionText(details, 3500)) as Record<string, unknown> } catch { safe = { detailsLimited: true } }
  const found = executionSources({ version: 1, id: "search", startedAt: 0, state: "completed", steps: [] }, sources)
  const receipt = { ...safe, found: found.length, sites: new Set(found.map(source => source.domain)).size,
    sources: found.map(source => ({ url: source.url, title: source.title?.slice(0, 120) })), detailsLimited: Boolean(safe.detailsLimited) }
  while (JSON.stringify(receipt).length > 4800 && receipt.sources.length) { receipt.sources.pop(); receipt.detailsLimited = true }
  return publicExecutionText(JSON.stringify(receipt), 5800)
}

export function filterActivitySteps(steps: ExecutionStep[], filter: ActivityFilter, query = ""): ExecutionStep[] {
  const words = query.trim().toLocaleLowerCase().slice(0, 160).split(/\s+/u).filter(Boolean)
  return steps.filter(step => {
    const matchesKind = filter === "all" || filter === "sources" && (step.kind === "search" || step.kind === "read")
      || filter === "tools" && !["search", "read", "status", "model"].includes(step.kind)
      || filter === "problems" && ["failed", "cancelled", "interrupted"].includes(step.state)
    const text = publicExecutionText([step.title, step.tool, step.url, step.output, step.error].filter(Boolean).join(" ")).toLocaleLowerCase()
    return matchesKind && words.every(word => text.includes(word))
  })
}

export function activityStepNote(step: ExecutionStep): string {
  if (step.state === "cancelled" || step.state === "interrupted") return "Действие остановлено. Успешное завершение не подтверждено."
  const data = payload(step)
  if (step.state === "failed") return publicExecutionText(data.limitation || step.error || "Не удалось получить результат. Это действие не считается выполненным.", 320)
  if (step.kind === "search") {
    if (step.state === "running") return "Проверяю открытые источники. Найденные ссылки и прочитанные страницы учитываются отдельно."
    const sources = executionSources({ version: 1, id: "receipt", startedAt: 0, state: "completed", steps: [step] })
    const found = typeof data.found === "number" && Number.isInteger(data.found) && data.found >= sources.length && data.found <= 24 ? data.found : sources.length
    const cached = typeof data.cacheHits === "number" && data.cacheHits > 0
    return found
      ? `Найдено ссылок: ${found}.${cached ? " Часть результатов получена из кэша." : ""}${data.detailsLimited ? " Подробный список сокращён." : ""} Далее проверяю доступные страницы.`
      : "Поисковое обращение завершено. Подробности и ограничения — в квитанции."
  }
  if (step.kind === "read") {
    if (step.state === "running") return "Открываю страницу и извлекаю доступный текст."
    if (typeof data.excerpt === "string" && data.excerpt.trim()) return `Фрагмент источника: ${publicExecutionText(data.excerpt, 280)}`
    return "Чтение завершено. Это не отдельная гарантия достоверности всех утверждений источника."
  }
  if (step.kind === "model" && (step.tool === "malik.review" || step.tool === "malik.synthesis")) return step.state === "running"
    ? "Сопоставляю независимые варианты решения. Согласие моделей не заменяет проверку фактов по источникам."
    : "Этап сопоставления завершён. Это не внешняя верификация фактов; внутренние тексты проверок не публикуются."
  if (step.kind === "model") return step.state === "running"
    ? "Модель формирует ответ с учётом запроса и доступного контекста."
    : "Модель завершила этот этап подготовки ответа."
  if (step.kind === "code") return step.state === "running"
    ? "Выполняется операция с кодом или расчётом. Результат появится после завершения."
    : "Результат операции получен. Запуск тестов подтверждается только отдельной квитанцией."
  if (step.kind === "file") return step.state === "running" ? "Обрабатываю доступные материалы." : "Операция с материалами завершена."
  if (step.kind === "plugin") return step.state === "running" ? "Обращаюсь к подключённому сервису." : "Ответ подключённого сервиса получен."
  if (step.kind === "media") return step.state === "running" ? "Обрабатываю медиа по запросу." : "Результат операции с медиа получен."
  return ""
}

export function activitySummary(trace?: ExecutionTrace, supplied: ExecutionSource[] = []) {
  const steps = trace?.steps || []
  const searches = steps.filter(step => step.kind === "search")
  // Supplied answer links are useful, but do not prove a fresh search happened.
  const found = trace ? executionSources({ ...trace, steps: searches.filter(step => step.state === "completed") }) : []
  const searchData = searches.filter(step => step.state === "completed").map(payload)
  const declared = (key: string) => searchData.map(item => item[key]).filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 24)
  const detailsLimited = searchData.some(item => item.detailsLimited === true)
  const read = trace ? executionSources({ ...trace, steps: steps.filter(step => step.kind === "read" && step.state === "completed") }) : []
  const unavailable = trace ? executionSources({ ...trace, steps: steps.filter(step => step.kind === "read" && step.state === "failed") }) : []
  const sources = trace ? executionSources(trace, supplied) : []
  const active = steps.filter(step => step.state === "running" && step.kind !== "status")
  // A real tool operation is more informative than the parent model/status span.
  const current = [...active].reverse().find(step => step.kind !== "model") || active.at(-1)
  const problems = steps.filter(step => ["failed", "cancelled", "interrupted"].includes(step.state))
  const working = trace?.state === "running"
  const title = working && current ? current.kind === "search" ? "Ищу открытые источники…"
    : current.kind === "read" ? "Читаю источники…" : publicExecutionText(current.title, 120)
    : searches.length ? "Работа с источниками" : "Ход работы"
  // Keep the waiting feed small; full receipts remain behind the disclosure.
  const journal = steps.filter(step => step.kind !== "status").slice(-3)
  return {
    title, current, journal, sources, found: Math.max(found.length, ...declared("found")),
    sites: Math.max(new Set(found.map(source => source.domain)).size, ...declared("sites")), read: read.length, unavailable: unavailable.length,
    readUrls: read.map(source => source.url),
    detailsLimited, countsAreLowerBounds: detailsLimited && searches.length > 1,
    searches: searches.filter(step => step.state === "completed").length, problems: problems.length,
    completed: steps.filter(step => !["model", "status"].includes(step.kind) && step.state === "completed").length,
    hasResearch: searches.length > 0 || steps.some(step => step.kind === "read"),
  }
}
