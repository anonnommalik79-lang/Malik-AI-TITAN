import type { AITaskType } from "@/lib/ai/types"
import type { BusinessModeId } from "./types"

const AUTONOMOUS_MODES = new Set<BusinessModeId>([
  "ceo-decision",
  "business-war-map",
  "mvp-cut",
  "brand-voice",
  "tiktok-reels-engine",
  "ai-sales-manager",
  "customer-pain",
  "revenue-engine",
  "reality-check",
])

const TASK_BY_MODE: Partial<Record<BusinessModeId, AITaskType>> = {
  "ceo-decision": "enterprise",
  "business-war-map": "research",
  "mvp-cut": "project",
  "brand-voice": "general",
  "tiktok-reels-engine": "general",
  "ai-sales-manager": "general",
  "customer-pain": "research",
  "revenue-engine": "enterprise",
  "reality-check": "enterprise",
}

const DIRECTIVE_BY_MODE: Partial<Record<BusinessModeId, string>> = {
  "ceo-decision": "Зафиксируй одно конкретное направление бизнеса, ICP, оффер, модель дохода, приоритеты, ограничения и главные риски. Не оставляй несколько несовместимых вариантов без решения.",
  "business-war-map": "Продолжай стратегию CEO. Отделяй проверенные факты от допущений и прямо отмечай, что ещё нужно валидировать.",
  "mvp-cut": "Работай как product и engineering lead. Дай конкретный MVP: стек, основные экраны, модель данных, API и интеграции, критерии готовности и порядок сборки.",
  "brand-voice": "Не меняй продукт, ICP, цену и рынок. Построй бренд вокруг уже принятой стратегии и MVP.",
  "tiktok-reels-engine": "Не придумывай другой продукт. Маркетинг должен продавать уже зафиксированные оффер и MVP.",
  "ai-sales-manager": "Построй продажи для выбранных ICP, оффера и цены. Дай конкретные этапы воронки, сообщения и критерии перехода.",
  "customer-pain": "Проектируй поддержку и удержание для уже выбранных клиентов и продукта. Не сбрасывай контекст компании.",
  "revenue-engine": "Работай как CFO и growth analyst этой же компании. Свяжи цену, воронку, CAC, маржу, MRR, break-even и бюджет. Если цифры нет, покажи формулу и пометь допущение.",
  "reality-check": "Проверь именно готовый план этой компании. Найди противоречия между этапами и предложи дешёвый тест каждого ключевого допущения.",
}

const GENERIC_PATTERNS = [
  /как я могу помочь/i,
  /чем я могу помочь/i,
  /как могу помочь вам сегодня/i,
  /уточните (?:ваш )?(?:вопрос|запрос|задачу)/i,
  /how can i help/i,
  /how may i help/i,
  /what can i help you with/i,
]

const STATE_PATTERN = /(?:^|\n)#{1,4}\s*(?:company state|состояние компании)|\bcompany state\b/i

export function isAutonomousBusinessMode(modeId: BusinessModeId): boolean {
  return AUTONOMOUS_MODES.has(modeId)
}

export function businessTaskForMode(modeId: BusinessModeId): AITaskType {
  return TASK_BY_MODE[modeId] || "research"
}

export function augmentBusinessInput(modeId: BusinessModeId, input: string): string {
  if (!isAutonomousBusinessMode(modeId)) return input
  const directive = DIRECTIVE_BY_MODE[modeId] || "Продолжай одну и ту же компанию и не сбрасывай решения предыдущих этапов."
  return [
    input,
    "AUTONOMOUS COMPANY PROTOCOL:",
    directive,
    "Это один непрерывный запуск компании. Сохраняй исходные ограничения пользователя и решения предыдущих агентов. Не начинай новый проект и не отвечай приветствием.",
    "Если предыдущий этап содержит блок COMPANY STATE, считай его каноническим состоянием и обновляй его.",
    "В конце ответа обязательно добавь `## COMPANY STATE` из 6–10 коротких пунктов: бизнес/продукт, ICP, оффер/цена если известна, рынок/страна, бюджет/срок, ключевые решения, открытые допущения и следующий шаг.",
    "Не проси заново описать задачу. Выполни свою роль сейчас.",
  ].join("\n\n")
}

export type BusinessOutputQuality = {
  ok: boolean
  reason?: "empty" | "generic" | "too_short" | "missing_state"
}

function genericOutput(text: string) {
  return GENERIC_PATTERNS.some((pattern) => pattern.test(text)) && text.length < 700
}

/**
 * Models occasionally complete the actual business work but miss the exact
 * markdown heading requested by the handoff protocol. That is a formatting
 * miss, not a reason to throw away a useful CEO/Research/Coder result.
 *
 * The client passes the whole previous answer to the next agent, so this small
 * deterministic handoff keeps the pipeline continuous without inventing any
 * business facts or pretending an empty/generic answer was successful.
 */
export function ensureAutonomousCompanyState(modeId: BusinessModeId, output: unknown): string {
  const text = typeof output === "string" ? output.trim() : ""
  if (!text || !isAutonomousBusinessMode(modeId) || modeId === "reality-check") return text
  if (STATE_PATTERN.test(text)) return text
  if (genericOutput(text) || text.length < 360) return text

  return [
    text,
    "",
    "## COMPANY STATE",
    `- Завершённый этап: ${modeId}.`,
    "- Канонические решения: использовать все конкретные решения и ограничения из результата выше без сброса контекста.",
    "- Исходная бизнес-идея, рынок, страна, бюджет и срок: сохранить без изменений, если выше явно не обосновано изменение.",
    "- Продукт, ICP, оффер и цена: брать только из результата выше и предыдущих этапов; отсутствующие значения считать открытыми допущениями.",
    "- Факты и допущения: не превращать неподтверждённые предположения в факты.",
    "- Следующий агент: продолжить ту же компанию, используя весь результат этого этапа как вход.",
  ].join("\n")
}

export function businessOutputQuality(modeId: BusinessModeId, output: unknown): BusinessOutputQuality {
  const text = typeof output === "string" ? output.trim() : ""
  if (!text) return { ok: false, reason: "empty" }
  if (genericOutput(text)) return { ok: false, reason: "generic" }
  const minimum = isAutonomousBusinessMode(modeId) ? 220 : 70
  if (text.length < minimum) return { ok: false, reason: "too_short" }
  if (isAutonomousBusinessMode(modeId) && modeId !== "reality-check" && !STATE_PATTERN.test(text)) {
    return { ok: false, reason: "missing_state" }
  }
  return { ok: true }
}

export function businessRetryPrompt(prompt: string, reason?: BusinessOutputQuality["reason"]): string {
  const why = reason === "missing_state"
    ? "Ты выполнил содержательную часть, но не передал состояние компании следующему агенту. Сохрани результат и добавь корректный handoff."
    : "Предыдущий ответ был пустым, слишком коротким или похожим на приветственную заглушку."
  return [
    prompt,
    "",
    "ПОВТОР АГЕНТА:",
    why,
    "Не задавай встречных вопросов. Выполни поставленную роль полностью и согласованно с предыдущими этапами.",
    "Обязательно заверши ответ блоком `## COMPANY STATE` с актуальным состоянием компании.",
  ].join("\n")
}

export function businessOutputTokenBudget(modeId: BusinessModeId, owner: boolean): number | undefined {
  if (!isAutonomousBusinessMode(modeId)) return undefined
  if (modeId === "reality-check") return owner ? 1100 : 700
  return owner ? 1200 : 800
}
