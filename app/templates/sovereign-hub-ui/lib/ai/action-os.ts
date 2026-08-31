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

// JavaScript's classic \b boundary is ASCII-centric. Cyrillic/Kazakh stems are
// intentionally matched without \b; English keywords keep normal word guards.
const RESEARCH_RE = /(найди|ізде|ищи|поиск|іздеу|проверь|тексер|исследуй|зертте|сравни|салыстыр|актуальн|бүгін|сегодня|новост|жаңалық|источник|дереккөз|\bresearch\b|\bsearch\b|\bcompare\b|\blatest\b|\bcurrent\b)/iu
const CODE_RE = /(код|репозитор|коммит|ошибк|қате|исправь|түзет|рефактор|деплой|\bgithub\b|\bcommit\b|\btypescript\b|\bjavascript\b|\bpython\b|\breact\b|\bnext\.?js\b|\bapi\b|\bbug\b|\bdebug\b|\bdeploy\b)/iu
const BUILD_RE = /(создай|жаса|сделай|построй|собери|құрастыр|разработай|сайт|приложен|қосымша|проект|жоба|интерфейс|дизайн|\bwebsite\b|\bbuild\b|\bcreate\b|\bmake\b)/iu
const MEDIA_RE = /(фото|сурет|изображен|картин|видео|бейне|ролик|рендер|генерир|\bimage\b|\bphoto\b|\bvideo\b|\brender\b)/iu
const TRAVEL_RE = /(поездк|сапар|путешеств|отель|қонақүй|гостиниц|билет|билет|рейс|ұшақ|самол[её]т|маршрут|бағыт|\btravel\b|\bhotel\b|\bflight\b)/iu
const TAXI_RE = /(такси|яндекс\s*go|поехать|подать машину|көлік шақыр|\buber\b|\bindriver\b|\bride\b)/iu
const BUSINESS_RE = /(бизнес|стартап|инвест|оценк|бағалау|выручк|табыс|рынок|нарық|клиент|продаж|сату|\barr\b|\bmrr\b|\bunit economics\b|\bvaluation\b|\brevenue\b)/iu
const WORKFLOW_RE = /(автоматиз|автоматтандыр|каждый день|күн сайын|каждую неделю|апта сайын|следи|бақыла|монитор|напомни|еске сал|агент|\bworkflow\b|\bautomation\b|\bschedule\b|\bbackground\b)/iu
const DOCUMENT_RE = /(документ|құжат|отч[её]т|есеп|презентац|таныстырылым|таблиц|кесте|\bpdf\b|\bdocx\b|\bpptx\b|\bxlsx\b|\bmemo\b|\breport\b|\bdeck\b)/iu
const EXTERNAL_RE = /(закажи|тапсырыс бер|купи|сатып ал|оплати|төле|отправь|жібер|публикуй|опубликуй|жарияла|удали|жой|забронируй|бронда|подтверди поездку|\bsend\b|\bbuy\b|\bpurchase\b|\bpay\b|\bpublish\b|\bdelete\b|\bbook\b|\bdeploy\b)/iu
const DESTRUCTIVE_RE = /(удали|стереть|снести|жой|өшір|\bdrop\s+table\b|\bforce\s+push\b|\breset\s+--hard\b|\bdelete\b|\bdestroy\b|\bterminate\b)/iu
const ACTION_RE = /(сделай|жаса|создай|құр|найди|ізде|проверь|тексер|исправь|түзет|добавь|қос|собери|құрастыр|запусти|іске қос|настрой|бапта|проанализируй|талда|сравни|салыстыр|организуй|ұйымдастыр|автоматизируй|автоматтандыр|закажи|тапсырыс бер|купи|сатып ал|отправь|жібер|опубликуй|жарияла|\bbuild\b|\bcreate\b|\bfind\b|\bcheck\b|\bfix\b|\badd\b|\brun\b|\bconfigure\b|\banalyze\b|\bcompare\b|\borganize\b|\bautomate\b|\bbook\b|\bsend\b|\bpublish\b)/iu
const FRESH_RE = /(актуальн|бүгін|сегодня|цена|баға|\blatest\b|\bcurrent\b|\bprice\b)/iu
const COMPOUND_RE = /[;\n]|(?:^|\s)и(?:\s|$)|(?:^|\s)және(?:\s|$)|\band\b/giu

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
  const compound = (prompt.match(COMPOUND_RE) || []).length >= 2
  const shouldRender = explicitAction && (intent !== "chat" || compound || prompt.length > 180)
  const external = EXTERNAL_RE.test(prompt)
  const destructive = DESTRUCTIVE_RE.test(prompt)
  const requiresConfirmation = external || destructive
  const risk: MalikActionRisk = requiresConfirmation ? "confirmation" : intent === "code" || intent === "build" ? "review" : "none"
  const steps: MalikActionStep[] = []
  const capabilities = new Set<string>()

  steps.push({ id: "understand", title: "Зафиксировать цель и ограничения", kind: "understand" })

  if (intent === "research" || intent === "travel" || intent === "taxi" || FRESH_RE.test(prompt)) {
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
