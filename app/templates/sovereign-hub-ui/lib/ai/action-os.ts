export type MalikActionIntent =
  | "chat"
  | "research"
  | "code"
  | "build"
  | "media"
  | "travel"
  | "taxi"
  | "business"
  | "workflow"
  | "document"

export type MalikActionRisk = "none" | "review" | "confirmation"
export type MalikActionStepKind = "understand" | "research" | "create" | "tool" | "verify" | "save" | "confirm"

export type MalikActionStep = {
  id: string
  title: string
  kind: MalikActionStepKind
  external?: boolean
  requiresConfirmation?: boolean
}

export type MalikActionPlan = {
  id: string
  version: "malik-action-os-v1"
  intent: MalikActionIntent
  objective: string
  risk: MalikActionRisk
  shouldRender: boolean
  requiresConfirmation: boolean
  steps: MalikActionStep[]
  capabilities: string[]
}

const RESEARCH_RE = /\b(найди|ищи|поиск|проверь|исследуй|сравни|research|search|compare|latest|current|актуальн|сегодня|новост|источник)\b/iu
const CODE_RE = /\b(код|github|репозитор|commit|коммит|typescript|javascript|python|react|next\.?js|api|bug|ошибк|исправь|рефактор|debug|deploy|деплой)\b/iu
const BUILD_RE = /\b(создай|сделай|построй|собери|разработай|website|сайт|приложен|проект|интерфейс|дизайн|build|create|make)\b/iu
const MEDIA_RE = /\b(фото|изображен|картин|видео|ролик|image|photo|video|render|рендер|генерир)\b/iu
const TRAVEL_RE = /\b(поездк|путешеств|отель|гостиниц|билет|рейс|самол[её]т|travel|hotel|flight|маршрут)\b/iu
const TAXI_RE = /\b(такси|uber|яндекс\s*go|indriver|поехать|подать машину|ride)\b/iu
const BUSINESS_RE = /\b(бизнес|стартап|инвест|оценк|выручк|arr|mrr|рынок|клиент|продаж|unit economics|valuation|revenue)\b/iu
const WORKFLOW_RE = /\b(автоматиз|каждый день|каждую неделю|следи|монитор|напомни|агент|workflow|automation|schedule|background)\b/iu
const DOCUMENT_RE = /\b(документ|отч[её]т|презентац|таблиц|pdf|docx|pptx|xlsx|memo|report|deck)\b/iu
const EXTERNAL_RE = /\b(закажи|купи|оплати|отправь|публикуй|опубликуй|удали|забронируй|подтверди поездку|send|buy|purchase|pay|publish|delete|book|deploy)\b/iu
const DESTRUCTIVE_RE = /\b(удали|стереть|снести|drop\s+table|force\s+push|reset\s+--hard|delete|destroy|terminate)\b/iu
const ACTION_RE = /\b(сделай|создай|найди|проверь|исправь|добавь|собери|запусти|настрой|проанализируй|сравни|организуй|автоматизируй|закажи|купи|отправь|опубликуй|build|create|find|check|fix|add|run|configure|analyze|compare|organize|automate|book|send|publish)\b/iu

function clean(value: unknown, max = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max)
}

function stableId(prompt: string) {
  let hash = 2166136261
  for (let index = 0; index < prompt.length; index++) {
    hash ^= prompt.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `act_${(hash >>> 0).toString(36)}`
}

function inferIntent(prompt: string): MalikActionIntent {
  if (TAXI_RE.test(prompt)) return "taxi"
  if (TRAVEL_RE.test(prompt)) return "travel"
  if (MEDIA_RE.test(prompt)) return "media"
  if (CODE_RE.test(prompt) && BUILD_RE.test(prompt)) return "build"
  if (CODE_RE.test(prompt)) return "code"
  if (DOCUMENT_RE.test(prompt)) return "document"
  if (WORKFLOW_RE.test(prompt)) return "workflow"
  if (BUSINESS_RE.test(prompt)) return "business"
  if (RESEARCH_RE.test(prompt)) return "research"
  if (BUILD_RE.test(prompt)) return "build"
  return "chat"
}

function objectiveFor(prompt: string, intent: MalikActionIntent) {
  const compact = clean(prompt, 180)
  if (compact) return compact
  const labels: Record<MalikActionIntent, string> = {
    chat: "Ответить на запрос пользователя",
    research: "Провести проверяемое исследование",
    code: "Решить задачу в коде",
    build: "Собрать готовый результат",
    media: "Создать медиа-результат",
    travel: "Подготовить поездку",
    taxi: "Подготовить поездку на такси",
    business: "Подготовить бизнес-решение",
    workflow: "Автоматизировать повторяемую работу",
    document: "Подготовить рабочий документ",
  }
  return labels[intent]
}

function dedupeSteps(steps: MalikActionStep[]) {
  const seen = new Set<string>()
  return steps.filter((step) => {
    const key = step.title.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 6)
}

export function buildMalikActionPlan(promptValue: unknown, body: any = {}): MalikActionPlan {
  const prompt = clean(promptValue, 4000)
  const intent = inferIntent(prompt)
  const explicitAction = ACTION_RE.test(prompt)
  const compound = (prompt.match(/[;\n]|\bи\b|\band\b/giu) || []).length >= 2
  const shouldRender = explicitAction && (intent !== "chat" || compound || prompt.length > 180)
  const external = EXTERNAL_RE.test(prompt)
  const destructive = DESTRUCTIVE_RE.test(prompt)
  const requiresConfirmation = external || destructive
  const risk: MalikActionRisk = requiresConfirmation ? "confirmation" : intent === "code" || intent === "build" ? "review" : "none"
  const steps: MalikActionStep[] = []
  const capabilities = new Set<string>()

  steps.push({ id: "understand", title: "Зафиксировать цель и ограничения", kind: "understand" })

  if (intent === "research" || intent === "travel" || intent === "taxi" || /\b(актуальн|сегодня|latest|current|цена|price)\b/iu.test(prompt)) {
    steps.push({ id: "research", title: "Проверить свежие данные и источники", kind: "research" })
    capabilities.add("web")
  }

  if (intent === "code" || intent === "build") {
    steps.push({ id: "build", title: intent === "code" ? "Подготовить минимальный рабочий патч" : "Собрать рабочий результат", kind: "create" })
    steps.push({ id: "verify", title: "Проверить типы, ошибки и критические сценарии", kind: "verify" })
    capabilities.add("code")
    capabilities.add("projects")
  }

  if (intent === "media") {
    steps.push({ id: "media", title: "Понять визуальный замысел и создать медиа", kind: "tool" })
    steps.push({ id: "verify", title: "Проверить соответствие результата запросу", kind: "verify" })
    capabilities.add("media")
  }

  if (intent === "travel") {
    steps.push({ id: "options", title: "Собрать и сравнить варианты по цене, времени и удобству", kind: "research" })
    steps.push({ id: "itinerary", title: "Собрать единый маршрут и план поездки", kind: "create" })
    capabilities.add("travel")
  }

  if (intent === "taxi") {
    steps.push({ id: "route", title: "Подготовить маршрут и подходящий сервис", kind: "tool", external: true })
    capabilities.add("taxi")
  }

  if (intent === "business") {
    steps.push({ id: "business", title: "Разобрать метрики, рынок и главный рычаг роста", kind: "research" })
    steps.push({ id: "decision", title: "Выдать решение с приоритетами и измеримым следующим шагом", kind: "create" })
    capabilities.add("analytics")
  }

  if (intent === "workflow") {
    steps.push({ id: "workflow", title: "Разложить процесс на повторяемые действия и триггеры", kind: "create" })
    steps.push({ id: "automation", title: "Подготовить безопасную автоматизацию с проверкой результата", kind: "tool", external: true })
    capabilities.add("agents")
  }

  if (intent === "document") {
    steps.push({ id: "document", title: "Собрать редактируемый рабочий артефакт", kind: "create" })
    steps.push({ id: "verify", title: "Проверить структуру, факты и готовность к использованию", kind: "verify" })
    capabilities.add("artifacts")
  }

  if (body?.attachments?.length) capabilities.add("files")
  if (body?.history?.length) capabilities.add("context")

  if (requiresConfirmation) {
    steps.push({
      id: "confirm",
      title: destructive ? "Получить подтверждение перед необратимым действием" : "Получить подтверждение перед внешним действием",
      kind: "confirm",
      external: true,
      requiresConfirmation: true,
    })
  } else if (shouldRender && !steps.some((step) => step.kind === "verify")) {
    steps.push({ id: "verify", title: "Проверить итог против исходной цели", kind: "verify" })
  }

  return {
    id: stableId(prompt || intent),
    version: "malik-action-os-v1",
    intent,
    objective: objectiveFor(prompt, intent),
    risk,
    shouldRender,
    requiresConfirmation,
    steps: dedupeSteps(steps),
    capabilities: [...capabilities],
  }
}

export function malikActionPlanModelContext(plan: MalikActionPlan) {
  if (!plan.shouldRender) return ""
  const steps = plan.steps.map((step, index) => `${index + 1}. ${step.title}${step.requiresConfirmation ? " [CONFIRM FIRST]" : ""}`).join("\n")
  return [
    "[MALIK_ACTION_OS_V1]",
    `Objective: ${plan.objective}`,
    `Intent: ${plan.intent}`,
    `Risk: ${plan.risk}`,
    "Execution contract:",
    steps,
    "Complete everything that is possible with the tools and evidence actually available in this request.",
    "Never claim that an external action, deployment, purchase, booking, message, deletion or publication happened unless a real tool result proves it.",
    "If confirmation is required, prepare the action and stop before the irreversible/external step.",
    "Return a usable result, not a description of what you could do.",
  ].join("\n")
}

export function malikActionPlanMarkdown(plan: MalikActionPlan) {
  if (!plan.shouldRender) return ""
  const lines = plan.steps.map((step, index) => `> ${index + 1}. ${step.title}`)
  return [
    "> **Malik Action OS · План**",
    `> Цель: ${plan.objective}`,
    ...lines,
    ...(plan.requiresConfirmation ? ["> Внешнее или необратимое действие будет остановлено перед подтверждением."] : []),
  ].join("\n")
}

export function malikActionReceiptMarkdown(plan: MalikActionPlan) {
  if (!plan.shouldRender || !plan.requiresConfirmation) return ""
  return [
    "**Action Receipt**",
    "- Подготовка и анализ выполнены в рамках ответа.",
    "- Внешнее/необратимое действие не считается выполненным без подтверждённого результата инструмента.",
  ].join("\n")
}
