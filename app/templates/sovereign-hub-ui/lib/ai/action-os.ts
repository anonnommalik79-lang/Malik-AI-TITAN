export type MalikActionKind =
  | "analyze"
  | "research"
  | "translate"
  | "taxi"
  | "image"
  | "video"
  | "website"
  | "code"
  | "project"
  | "deliver"

export type MalikActionTarget =
  | "home"
  | "translator"
  | "taxi"
  | "photo-generation"
  | "video-generation"
  | "website-generation"
  | "code-generation"
  | "projects"
  | "settings"

export type MalikActionStepStatus = "queued" | "running" | "done" | "ready" | "blocked"
export type MalikActionPlanStatus = "running" | "ready" | "awaiting-confirmation" | "completed" | "failed"

export type MalikActionStep = {
  id: string
  kind: MalikActionKind
  title: string
  detail: string
  status: MalikActionStepStatus
  target?: MalikActionTarget
  requiresConfirmation?: boolean
}

export type MalikActionReceipt = {
  finishedAt: string
  completedSteps: number
  readySteps: number
  externalActionsPerformed: number
  note: string
}

export type MalikActionPlan = {
  id: string
  version: 1
  title: string
  summary: string
  createdAt: string
  status: MalikActionPlanStatus
  steps: MalikActionStep[]
  requiresConfirmation: boolean
  receipt?: MalikActionReceipt
}

export type MalikMemoryIntent =
  | { kind: "save"; text: string }
  | { kind: "list" }
  | { kind: "clear" }

type PlanInput = {
  prompt: string
  mode?: string
  attachmentKinds?: string[]
}

type PlanOutcome = {
  failed?: boolean
  usedWeb?: boolean
  hasCode?: boolean
  hasArtifact?: boolean
}

type ActionDefinition = Omit<MalikActionStep, "id" | "status">

const id = (prefix: string) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}_${crypto.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

const ACTION_DEFINITIONS: Array<ActionDefinition & { match: RegExp }> = [
  {
    kind: "research",
    title: "Проверить факты и варианты",
    detail: "Найти актуальные данные, сравнить варианты и отделить факты от предположений.",
    match: /найд|поищ|сравн|проверь|актуальн|сегодня|новост|цена|стоим|маршрут|поездк|путешеств|research|search|compare|latest/iu,
  },
  {
    kind: "translate",
    title: "Подготовить перевод",
    detail: "Сохранить смысл, тон и терминологию на выбранном языке.",
    target: "translator",
    match: /перев|язык|русск|казах|қазақ|аудар|translate|translation/iu,
  },
  {
    kind: "taxi",
    title: "Подготовить маршрут Taxi",
    detail: "Передать адрес и маршрут в Taxi; заказ выполняется только после подтверждения.",
    target: "taxi",
    requiresConfirmation: true,
    match: /такси|taxi|uber|поездк|маршрут|аэропорт|вокзал|адрес/iu,
  },
  {
    kind: "image",
    title: "Создать изображение",
    detail: "Подготовить точный визуальный запрос и открыть генератор после подтверждения.",
    target: "photo-generation",
    requiresConfirmation: true,
    match: /изображ|фото|картин|нарис|визуал|image|photo|picture/iu,
  },
  {
    kind: "video",
    title: "Создать видео",
    detail: "Собрать сцену, движение, звук и формат перед запуском рендера.",
    target: "video-generation",
    requiresConfirmation: true,
    match: /видео|ролик|анимац|video|movie|clip/iu,
  },
  {
    kind: "website",
    title: "Собрать рабочий сайт",
    detail: "Превратить требования в проверяемый Canvas-артефакт, а не в описание интерфейса.",
    target: "website-generation",
    match: /сайт|лендинг|интерфейс|дашборд|страниц|website|landing|dashboard|\bui\b/iu,
  },
  {
    kind: "code",
    title: "Подготовить и проверить код",
    detail: "Сделать минимальный рабочий патч и указать проверку результата.",
    target: "code-generation",
    match: /код|ошибк|исправ|typescript|javascript|python|react|next\.?js|api|debug|refactor/iu,
  },
  {
    kind: "project",
    title: "Сохранить результат в проект",
    detail: "Оставить результат доступным для продолжения без повторного объяснения контекста.",
    target: "projects",
    match: /проект|сохрани|организ|спланир|под ключ|project|save|organize|plan/iu,
  },
]

function uniqueActions(actions: ActionDefinition[]) {
  return actions.filter((action, index, list) => list.findIndex((item) => item.kind === action.kind) === index)
}

/**
 * Build a visible execution contract only for genuinely multi-step work. A
 * normal question remains a normal chat answer instead of acquiring dashboard
 * chrome just because the product has an agent feature.
 */
export function createMalikActionPlan(input: PlanInput): MalikActionPlan | null {
  const prompt = String(input.prompt || "").trim()
  if (!prompt || /^\s*\/(?:image|img|photo|foto|фото|video|veo|видео|memory|forget)(?![\p{L}\p{N}_])/iu.test(prompt)) return null

  const explicitAgent = /агент|организуй|спланируй|под ключ|от начала до конца|сделай всё|выполни задачу|доведи до результата|agent|workflow|end[- ]to[- ]end/iu.test(prompt)
  const connectorCount = (prompt.match(/(?:\sи\s|\sзатем\s|\sпотом\s|,|;|\n)/giu) || []).length
  const matched = uniqueActions(ACTION_DEFINITIONS.filter((definition) => definition.match.test(prompt)))
  const hasAttachments = Boolean(input.attachmentKinds?.length)
  const shouldPlan = input.mode === "agent"
    || explicitAgent
    || matched.length >= 2
    || (prompt.length >= 220 && connectorCount >= 2)
    || (hasAttachments && matched.length >= 1 && connectorCount >= 1)

  if (!shouldPlan) return null

  const selected = matched.length
    ? matched
    : [ACTION_DEFINITIONS.find((action) => action.kind === "research")!]
  const bounded = selected.slice(0, 4)
  const steps: MalikActionStep[] = [
    {
      id: id("step"),
      kind: "analyze",
      title: "Понять цель и ограничения",
      detail: "Зафиксировать результат, бюджет, формат и то, что нельзя делать без разрешения.",
      status: "running",
    },
    ...bounded.map((action) => ({ ...action, id: id("step"), status: "queued" as const })),
    {
      id: id("step"),
      kind: "deliver",
      title: "Выдать проверяемый результат",
      detail: "Показать итог, источники, ограничения и одно следующее действие.",
      status: "queued",
    },
  ]
  const requiresConfirmation = steps.some((step) => step.requiresConfirmation)

  return {
    id: id("action"),
    version: 1,
    title: "Malik Action OS",
    summary: `${steps.length} шагов · внешние действия ${requiresConfirmation ? "только после подтверждения" : "не требуются"}`,
    createdAt: new Date().toISOString(),
    status: "running",
    steps,
    requiresConfirmation,
  }
}

export function settleMalikActionPlan(plan: MalikActionPlan | null | undefined, outcome: PlanOutcome = {}): MalikActionPlan | undefined {
  if (!plan) return undefined
  if (outcome.failed) {
    return {
      ...plan,
      status: "failed",
      steps: plan.steps.map((step) => step.status === "running" ? { ...step, status: "blocked" } : step),
      receipt: {
        finishedAt: new Date().toISOString(),
        completedSteps: 0,
        readySteps: 0,
        externalActionsPerformed: 0,
        note: "Выполнение остановлено: внешний результат не подтверждён.",
      },
    }
  }

  const steps = plan.steps.map((step): MalikActionStep => {
    if (step.kind === "analyze" || step.kind === "deliver") return { ...step, status: "done" }
    if (step.kind === "research" && outcome.usedWeb) return { ...step, status: "done" }
    if (step.kind === "code" && outcome.hasCode) return { ...step, status: "done" }
    if (step.kind === "website" && outcome.hasArtifact) return { ...step, status: "done" }
    return { ...step, status: "ready" }
  })
  const completedSteps = steps.filter((step) => step.status === "done").length
  const readySteps = steps.filter((step) => step.status === "ready").length
  const awaitingConfirmation = steps.some((step) => step.status === "ready" && step.requiresConfirmation)

  return {
    ...plan,
    status: awaitingConfirmation ? "awaiting-confirmation" : readySteps ? "ready" : "completed",
    steps,
    receipt: {
      finishedAt: new Date().toISOString(),
      completedSteps,
      readySteps,
      externalActionsPerformed: 0,
      note: awaitingConfirmation
        ? "Malik подготовил результат. Ни одно платное или внешнее действие не выполнено без подтверждения."
        : readySteps
          ? "Основной ответ готов; дополнительные инструменты можно открыть вручную."
          : "План завершён и проверяемый результат выдан в чате.",
    },
  }
}

export function buildMalikActionInstruction(plan: MalikActionPlan | null | undefined) {
  if (!plan) return ""
  return [
    "[MALIK_ACTION_OS_EXECUTION_CONTRACT]",
    "Complete all read-only reasoning that can be completed in this answer.",
    "Never claim that a purchase, booking, message, upload, publication or other external action happened unless a tool result explicitly confirms it.",
    "Ask for confirmation before any paid, destructive, privacy-sensitive or externally visible action.",
    "The interface renders the plan separately, so do not repeat the whole checklist in the prose answer.",
    ...plan.steps.map((step, index) => `${index + 1}. ${step.title}: ${step.detail}`),
  ].join("\n")
}

export function detectMalikMemoryIntent(promptValue: string): MalikMemoryIntent | null {
  const prompt = String(promptValue || "").trim()
  if (!prompt) return null
  if (/^(?:\/memory|что ты (?:обо мне )?помнишь|покажи память|show memory)\s*$/iu.test(prompt)) return { kind: "list" }
  if (/^(?:\/forget(?:\s+all)?|забудь всё|очисти память|clear memory)\s*$/iu.test(prompt)) return { kind: "clear" }
  const save = prompt.match(/^(?:\/remember|запомни|помни|есте сақта|remember)\s*:?[\s]+(.+)$/iu)
  const text = save?.[1]?.replace(/\s+/g, " ").trim().slice(0, 600) || ""
  return text ? { kind: "save", text } : null
}

export function reviveMalikActionPlan(value: unknown): MalikActionPlan | undefined {
  if (!value || typeof value !== "object") return undefined
  const plan = value as Partial<MalikActionPlan>
  const allowedPlanStatuses: MalikActionPlanStatus[] = ["running", "ready", "awaiting-confirmation", "completed", "failed"]
  const allowedStepStatuses: MalikActionStepStatus[] = ["queued", "running", "done", "ready", "blocked"]
  const allowedKinds: MalikActionKind[] = ["analyze", "research", "translate", "taxi", "image", "video", "website", "code", "project", "deliver"]
  const steps = Array.isArray(plan.steps)
    ? plan.steps.slice(0, 8).flatMap((raw): MalikActionStep[] => {
        if (!raw || typeof raw !== "object") return []
        const step = raw as Partial<MalikActionStep>
        if (!allowedKinds.includes(step.kind as MalikActionKind)) return []
        return [{
          id: String(step.id || id("step")),
          kind: step.kind as MalikActionKind,
          title: String(step.title || "Шаг").slice(0, 120),
          detail: String(step.detail || "").slice(0, 360),
          status: allowedStepStatuses.includes(step.status as MalikActionStepStatus) ? step.status as MalikActionStepStatus : "queued",
          target: typeof step.target === "string" ? step.target as MalikActionTarget : undefined,
          requiresConfirmation: Boolean(step.requiresConfirmation),
        }]
      })
    : []
  if (!steps.length) return undefined

  return {
    id: String(plan.id || id("action")),
    version: 1,
    title: String(plan.title || "Malik Action OS").slice(0, 80),
    summary: String(plan.summary || `${steps.length} шагов`).slice(0, 180),
    createdAt: String(plan.createdAt || new Date().toISOString()),
    status: allowedPlanStatuses.includes(plan.status as MalikActionPlanStatus) ? plan.status as MalikActionPlanStatus : "ready",
    steps,
    requiresConfirmation: Boolean(plan.requiresConfirmation),
    receipt: plan.receipt && typeof plan.receipt === "object" ? {
      finishedAt: String(plan.receipt.finishedAt || new Date().toISOString()),
      completedSteps: Math.max(0, Number(plan.receipt.completedSteps) || 0),
      readySteps: Math.max(0, Number(plan.receipt.readySteps) || 0),
      externalActionsPerformed: Math.max(0, Number(plan.receipt.externalActionsPerformed) || 0),
      note: String(plan.receipt.note || "").slice(0, 420),
    } : undefined,
  }
}
