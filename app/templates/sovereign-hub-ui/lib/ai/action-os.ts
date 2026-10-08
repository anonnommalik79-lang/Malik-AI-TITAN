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

// Kept free of imports (the test transpiles this file alone); mirrors
// lib/ai/prompt-shape.ts: a long brief or a numbered task list is answered as
// a whole, and only its opening instruction may ask for an agent run.
function planScope(prompt: string) {
  const lines = prompt.split(/\r?\n/)
  const listLines = lines.filter((line) => /^\s*(?:\d{1,2}\s*[.)]|[-*•])\s*\S/u.test(line)).length
  const inline = (prompt.match(/(?:^|[\s;,])\d{1,2}\)\s+\S/gu) || []).length
  const brief = prompt.length >= 600 || Math.max(listLines, inline) >= 3
  if (!brief) return prompt
  const first = lines.map((line) => line.trim()).find(Boolean) || ""
  const end = first.slice(12).search(/[.!?…](?:\s|$)/u)
  return (end >= 0 ? first.slice(0, 12 + end + 1) : first).slice(0, 280)
}

const EXPLICIT_AGENT = /(?<![\p{L}\p{N}])(?:агент(?:а|у|ом|ы|ов)?|организуй(?:те)?|спланируй(?:те)?|под ключ|от начала до конца|сделай всё|выполни задачу|доведи до результата|agent|workflow|end[- ]to[- ]end)(?![\p{L}\p{N}])/iu

// A plan is a truthful list of requested capabilities, never a keyword bingo
// card. A site "for taxi" must not promise to order a taxi; a site "with photos"
// must not promise to generate pictures. Each capability is independently gated.
const CREATION_VERB = /(?:созд(?:ай|ать|айте)|сдел(?:ай|ать|айте)|сгенерир(?:уй|овать|уйте)|генерир(?:уй|овать|уйте)|нарис(?:уй|овать|уйте)|разработ(?:ай|ать|айте)|собер(?:и|ите)|постро(?:й|ить)|generate|create|make|draw|build)(?![\p{L}\p{N}_])/giu
const INTERVENING_OBJECT = /(?:код|скрипт|промпт|prompt|сайт|website|лендинг|приложени[\p{L}]*|app|api|инструкци[\p{L}]*|гайд|guide|способ|how\s+to)(?![\p{L}\p{N}_])/iu

function explicitCreationOf(scope: string, object: RegExp) {
  CREATION_VERB.lastIndex = 0
  for (const verb of scope.matchAll(CREATION_VERB)) {
    const rest = scope.slice((verb.index || 0) + verb[0].length, (verb.index || 0) + verb[0].length + 95)
    const noun = object.exec(rest)
    if (noun && !INTERVENING_OBJECT.test(rest.slice(0, noun.index))) return true
  }
  return false
}

function explicitlyPlansTransport(scope: string) {
  const object = /(?:такси|taxi|uber|трансфер|transfer)(?![\p{L}\p{N}_])/giu
  const verb = /(?:закаж[\p{L}]*|вызов[\p{L}]*|вызови|подготов[\p{L}]*|организ[\p{L}]*|спланир[\p{L}]*|заброниру[\p{L}]*|book|arrange)(?![\p{L}\p{N}_])/giu
  for (const command of scope.matchAll(verb)) {
    const rest = scope.slice((command.index || 0) + command[0].length, (command.index || 0) + command[0].length + 95)
    const match = object.exec(rest)
    object.lastIndex = 0
    if (match && !INTERVENING_OBJECT.test(rest.slice(0, match.index))
      && !/(?:сервис|service|платформ[\p{L}]*)(?![\p{L}\p{N}_])/iu.test(rest.slice(0, match.index))) return true
  }
  return false
}

function requestedAction(action: ActionDefinition & { match: RegExp }, scope: string) {
  if (!action.match.test(scope)) return false
  switch (action.kind) {
    case "image":
      return explicitCreationOf(scope, /(?:изображени[\p{L}]*|фото[\p{L}]*|фотк[\p{L}]*|картинк[\p{L}]*|постер[\p{L}]*|баннер[\p{L}]*|image|photo|picture|poster|banner)(?![\p{L}\p{N}_])/iu)
    case "video":
      return explicitCreationOf(scope, /(?:видео[\p{L}]*|ролик[\p{L}]*|клип[\p{L}]*|анимаци[\p{L}]*|video|movie|clip)(?![\p{L}\p{N}_])/iu)
    case "taxi":
      return explicitlyPlansTransport(scope)
    case "website":
      return explicitCreationOf(scope, /(?:сайт[\p{L}]*|лендинг[\p{L}]*|интерфейс[\p{L}]*|дашборд[\p{L}]*|страниц[\p{L}]*|website|landing|dashboard|ui)(?![\p{L}\p{N}_])/iu)
    case "translate":
      return /(?:перевед[\p{L}]*|перевест[\p{L}]*|перевод[\p{L}]*|аудар[\p{L}]*|translate|translation)(?![\p{L}\p{N}_])/iu.test(scope)
    case "project":
      return /(?:(?:сохран[\p{L}]*|запиш[\p{L}]*|save|добавь)\s+.{0,65}?(?:\bв\s+)?(?:проект[\p{L}]*|project)|(?:созд[\p{L}]*|create)\s+(?:\S+\s+){0,3}(?:проект[\p{L}]*|project))(?![\p{L}\p{N}_])/iu.test(scope)
    default:
      return true
  }
}

/**
 * Build a visible execution contract only when the person asks for an agent
 * run — Agent mode, or «организуй / спланируй / под ключ / доведи до
 * результата». A long prompt, a list of questions or two keywords that happen
 * to match (a "перевод" and a "код" in the same message) is NOT a request to
 * plan: it used to attach steps like «Подготовить маршрут Taxi» or «Создать
 * изображение» to unrelated questions, and every plan made the server run
 * extra sub-agents over the whole prompt before answering.
 */
export function createMalikActionPlan(input: PlanInput): MalikActionPlan | null {
  const prompt = String(input.prompt || "").trim()
  if (!prompt || /^\s*\/(?:image|img|photo|foto|фото|video|veo|видео|memory|forget)(?![\p{L}\p{N}_])/iu.test(prompt)) return null

  const scope = planScope(prompt)
  const shouldPlan = input.mode === "agent" || EXPLICIT_AGENT.test(scope)
  if (!shouldPlan) return null

  const matched = uniqueActions(ACTION_DEFINITIONS.filter((definition) => requestedAction(definition, scope)))
  const selected = matched.length
    ? matched
    : [ACTION_DEFINITIONS.find((action) => action.kind === "research")!]
  // Revival accepts at most 8 steps: analyze + 6 requested actions + deliver.
  const bounded = selected.slice(0, 6)
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
