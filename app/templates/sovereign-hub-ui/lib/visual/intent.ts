import type { VisualEngineType } from "./schema"

/**
 * Dynamic UI: which interactive blocks suit this request.
 *
 * Deterministic and cheap - it runs on every chat request and only decides
 * which schemas the model is shown. The model still decides whether a block
 * genuinely helps; with no match nothing is added to the prompt, so ordinary
 * answers stay plain text and cost no extra tokens.
 */

const NO_VISUALS = /(?:только\s+текст|без\s+(?:диаграмм|график|визуал|карточ|схем|таблиц)|не\s+(?:добавляй|показывай|рисуй)\s+(?:диаграмм|график|карточ|схем)|text\s+only|no\s+(?:charts?|visuals?|graphs?|diagrams?)|тек\s+мәтін)/iu
/** A request for code that draws a chart wants the code, not a chart. */
const WANTS_CODE = /(?:напиши|сгенерируй|дай|покажи)\s+(?:мне\s+)?(?:код|скрипт|программ)|(?:код|code|скрипт|script)\s+(?:для|на|for)|на\s+(?:python|питоне|javascript|js|react|matplotlib|plotly|d3)|\b(?:matplotlib|plotly|chart\.js|recharts|d3\.js|pandas)\b/iu

const PATTERNS: Array<[VisualEngineType, RegExp]> = [
  ["calculator", /(?:посчита|подсчита|рассчита|расчёт|расчет|калькулятор|симулятор|simulat|calculat|сколько\s+(?:я\s+)?(?:заработ|получ|нужно\s+клиент|стоит\s+кредит)|break[- ]?even|безубыточ|окупаем|юнит[- ]?эконом|unit\s+economics|runway|ранвей|на\s+сколько\s+(?:месяцев|хватит)|ипотек|кредит\p{L}*\s+(?:на|под|в)\s|аннуитет|ежемесячн\p{L}*\s+платёж|ежемесячн\p{L}*\s+платеж|есепте)/iu],
  ["dashboard", /(?:дашборд|dashboard|аналитик\p{L}*\s+(?:панел|продукт|сервис|бизнес|проект|приложени|пользовател)|\bkpi\b|\bdau\b|\bwau\b|\bmau\b|retention|удержани\p{L}*\s+пользовател|\bchurn\b|метрик\p{L}*\s+(?:продукт|сервис|бизнес|приложени|сайт|saas|стартап))/iu],
  ["chart", /(?:график|диаграмм|chart|plot|визуализ|инфограф|динамик|тренд|покажи\s+(?:рост|падени|изменени|распределени)|рост\s+(?:бизнес|продаж|выручк|пользовател|аудитори|цен|курс|населени)|по\s+(?:месяцам|годам|кварталам|неделям|дням)|распределени\p{L}*|дол[яию]\s+рынк|структур\p{L}*\s+(?:расход|доход|бюджет|рынк)|сравни\p{L}*\s+(?:цен|продаж|выручк|рост|показател)|кесте|диаграмма)/iu],
  ["table", /(?:таблиц|table|сравни\p{L}*\s+(?:\d+|несколько|все|топ|модел|тариф|смартфон|телефон|ноутбук|сервис|банк|язык|фреймворк|библиотек|платформ|вариант)|сравнени\p{L}*\s+(?:\d+|модел|тариф|сервис|платформ)|топ[- ]?\d+|рейтинг|список\s+\d+|\d+\s+(?:лучших|моделей|сервисов|тарифов|вариантов))/iu],
  ["graph", /(?:архитектур|схем\p{L}*|блок[- ]?схем|flow\s?chart|flowchart|граф(?:\s|$|а\s|ы\s|ом)|дерев\p{L}*\s+(?:решени|зависим|навык|целей)|mind\s?map|майнд[- ]?карт|ментальн\p{L}*\s+карт|зависимост\p{L}*\s+(?:модул|сервис|пакет|компонент)|микросервис|pipeline|пайплайн|воркфлоу|workflow|как\s+(?:устроен|работает)\s+(?:нейросет|система|сервис|бэкенд|backend|api|платформ)|структур\p{L}*\s+(?:нейросет|систем|проект|компани|команд|приложени)|сетев\p{L}*\s+граф)/iu],
]

export function selectVisualKinds(prompt: string): VisualEngineType[] {
  const value = String(prompt || "").slice(0, 4000)
  if (!value.trim() || NO_VISUALS.test(value) || WANTS_CODE.test(value)) return []
  const kinds = PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([kind]) => kind)
  // A dashboard already contains a chart; a calculator about a loan does not need one.
  if (kinds.includes("dashboard")) return kinds.filter((kind) => kind !== "chart").slice(0, 3)
  return kinds.slice(0, 3)
}

const COMMON = [
  "VISUAL ENGINE: the Malik chat renders interactive blocks from validated JSON - you never write HTML, JS or images for them. Insert ONE closed ```malik-visual fence per block, containing one JSON object, at the point where it helps; at most 3 blocks per answer and only when a block genuinely explains better than text. The text answer stays complete on its own.",
  "Every block: {\"version\":2,\"type\":\"...\",\"title\":\"...\",\"subtitle\":\"...\",\"dataKind\":\"user|sourced|estimate|example\",\"sources\":[{\"title\":\"...\",\"url\":\"https://...\"}],\"asOf\":\"...\",\"note\":\"...\"}. dataKind is mandatory and honest: user = numbers the user gave; sourced = numbers from cited evidence (list the sources); estimate = your clearly labelled assumptions; example = illustrative demo numbers. Never present example or estimate numbers as the user's real data or as facts, and never invent metrics of a real product; without data use \"example\" and say so in the text. Use the user's language for every visible label.",
]

const SCHEMAS: Record<VisualEngineType, string> = {
  chart: "chart: {\"type\":\"chart\",\"chart\":\"line|area|bar|hbar|stacked-bar|stacked-area|pie|donut|radar|composed|scatter\",\"unit\":\"%\",\"yLabel\":\"...\",\"labels\":[\"Пн\",\"Вт\"],\"series\":[{\"name\":\"Активные пользователи\",\"values\":[38,46]}]}. For switchable ranges give \"periods\":[{\"label\":\"7 дней\",\"labels\":[...],\"series\":[...]}] (2-6) instead of labels/series. scatter: \"scatter\":[{\"name\":\"...\",\"points\":[{\"x\":1,\"y\":2,\"label\":\"...\"}]}]. pie/donut: exactly one series of non-negative values, at most 8 labels. Up to 8 series; every values array aligned with labels, null for a missing value; one unit per chart, never two y-axes; composed charts may set series[].kind line|bar|area.",
  dashboard: "dashboard (KPI panel with period tabs): {\"type\":\"dashboard\",\"periods\":[{\"label\":\"7 дней\",\"metrics\":[{\"label\":\"Активные пользователи\",\"value\":86,\"format\":\"number|percent|currency|duration|compact\",\"currency\":\"USD|KZT|EUR|RUB\",\"unit\":\"\",\"delta\":12.4,\"better\":\"up|down\",\"note\":\"Рост активности\"}],\"chart\":{\"title\":\"Активность пользователей\",\"subtitle\":\"...\",\"chart\":\"line|area|bar\",\"labels\":[...],\"series\":[...]}}]}. 1-6 periods (shown as tabs, each fully recalculated), 1-8 metrics per period; duration values are seconds; delta is percent change vs the previous period.",
  calculator: "calculator (sliders; the UI computes every result deterministically - you only choose the model, sensible ranges and starting values, using the user's numbers when given): {\"type\":\"calculator\",\"model\":\"saas|unit-economics|loan|runway\",\"currency\":\"USD|KZT|EUR|RUB\",\"inputs\":{\"users\":{\"value\":650,\"min\":0,\"max\":5000,\"step\":10}},\"scenarios\":[{\"label\":\"Базовый\",\"values\":{\"users\":650}}]}. Input keys - saas: users, price (per month), fixedCosts (per month), variableCost (per user per month), churn (% per month, optional), cac (optional); unit-economics: units, price, unitCost, fixedCosts; loan: principal, rate (% per year), years; runway: cash, burn (monthly expenses), revenue (monthly), growth (% per month). Up to 4 scenarios (e.g. Консервативный / Базовый / Агрессивный). Results exclude taxes; do not state different results in the text.",
  table: "table (sortable, searchable, exportable): {\"type\":\"table\",\"columns\":[{\"label\":\"Модель\",\"kind\":\"text|number|percent|currency|date\",\"unit\":\"...\",\"currency\":\"USD\"}],\"rows\":[[\"Name\",12.5]],\"highlight\":{\"column\":1,\"best\":\"max|min\"}}. Up to 12 columns and 1000 rows; every row has one cell per column; numeric columns hold JSON numbers or null for unknown - never guess a value to fill a cell.",
  graph: "graph (interactive architecture / flowchart / decision tree / mind map): {\"type\":\"graph\",\"direction\":\"down|right\",\"nodes\":[{\"id\":\"router\",\"label\":\"Intelligent Router\",\"detail\":\"one-sentence role\",\"kind\":\"input|router|module|process|check|output|data|note\"}],\"edges\":[{\"from\":\"router\",\"to\":\"llm\",\"label\":\"Pass\",\"dashed\":false}]}. 2-40 nodes with short labels, ids of latin letters/digits; a retry loop back to an earlier node is allowed. It shows a proposed or conceptual design unless verified evidence describes the real system - say which in the subtitle.",
}

/** The instruction added to the system prompt for this request, or "". */
export function visualEngineContract(prompt: string): string {
  const kinds = selectVisualKinds(prompt)
  if (!kinds.length) return ""
  return [...COMMON, `Suitable for this request: ${kinds.join(", ")}.`, ...kinds.map((kind) => SCHEMAS[kind])].join("\n")
}

/** Full catalogue, for documentation and tests. */
export const VISUAL_ENGINE_SCHEMAS = SCHEMAS
