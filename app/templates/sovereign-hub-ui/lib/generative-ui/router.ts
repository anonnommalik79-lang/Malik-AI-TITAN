import { UI_FENCE } from "./protocol"

/**
 * The layout router: reads the request and decides whether an answer needs a
 * visual composition at all and, if so, which form carries it best. A
 * greeting, a short fact, code, maths, a translation or «только текст» stay
 * plain text. A comparison becomes a scoreboard, an architecture a diagram,
 * a strategy a report, a history a timeline, numbers a chart, a formula a
 * calculator. The recipe is a starting point for the model, never a fixed
 * template: the composition is built from primitives, so any other mix the
 * content needs is equally valid.
 */

export type UiLayout =
  | "plain" | "comparison" | "architecture" | "report" | "timeline" | "data" | "calculator" | "overview" | "plan" | "dashboard" | "explainer"

export type UiRoute = { layout: UiLayout; reason: string; recipe: string }

const has = (text: string, pattern: RegExp) => pattern.test(text)

// Cyrillic needs explicit edges: \b does not form a boundary next to it.
const GREETING = /^(?:привет\p{L}*|салам\p{L}*|сәлем\p{L}*|здравствуй\p{L}*|здоров\p{L}*|хай|ассалам\p{L}*|добр\p{L}+\s+(?:утро|день|вечер)|hi|hello|hey|yo)(?:[\s,!.?)]|$)/iu
const SMALL_TALK = /^(?:как\s+(?:дела|ты|сам|жизнь)|спасибо|благодарю|рахмет|ок(?:ей)?|понял|ясно|хорошо|отлично|супер|класс|thanks|thank you|ok(?:ay)?|cool|nice|great)[\s,!.?)]*$/iu
const PLAIN_ONLY = /(?:без\s+(?:визуал|графи|таблиц|карточ|картин|фото|оформлен)\p{L}*|только\s+текст\p{L}*|просто\s+текст\p{L}*|обычным\s+текстом|plain\s+text|text\s+only|no\s+(?:visuals?|charts?|tables?))/iu
const CODE = /(?:(?<![\p{L}])(?:код(?:а|у|ом|е)?|скрипт\p{L}*|функци\p{L}*\s+(?:на|для)|компонент\p{L}*|рефактор\p{L}*|баг\p{L}*|исправ\p{L}*\s+(?:ошибк|код))(?![\p{L}])|typescript|javascript|python|react|next\.?js|node\.?js|\bsql\b|\bcss\b|\bhtml\b|\bapi\b|regex|\bfunction\b|\bclass\b|```|напиши\s+(?:игр|сайт|бот|приложени))/iu
// Asking for code to be written or fixed, as opposed to code being the topic («лучшая модель для кода»).
const WRITE = /(?:(?<![\p{L}])(?:напиши|допиши|исправь|почини|отрефактор\p{L}*|создай|сгенерируй|сделай\s+(?:функци|скрипт|компонент))(?![\p{L}])|write|fix|implement|debug|refactor|```)/iu
const MATH = /(?:реши\p{L}*\s+(?:уравнени|задач|пример)|вычисли|посчитай\s+\d|\d+\s*[-+*/^×÷]\s*\d+\s*=?\s*\??$|интеграл|производн|\bsolve\b|\bderivative\b)/iu
const TEXT_TASK = /(?:перевед\p{L}*|переведи|translate|исправь\s+(?:текст|ошибк|опечат)|перефраз\p{L}*|сократи\s+текст|напиши\s+(?:письм|пост|сообщени|стих|рассказ|эссе|сочинени|текст)|аудар)/iu

const COMPARE = /(?:сравн\p{L}*|(?<![\p{L}])vs\.?(?![\p{L}])|versus|compare|comparison|против\s+\p{Lu}|рейтинг\p{L}*|топ[- ]?\d+|лучши[ех]\s+\d+|\d+\s+лучших|leaderboard|benchmark\p{L}*|бенчмарк\p{L}*|какой\s+(?:лучше|выбрать)|что\s+выбрать|разниц\p{L}*\s+между)/iu
const ARCHITECTURE = /(?:архитектур\p{L}*|как\s+устроен\p{L}*|схем\p{L}*\s+(?:работ|систем|процесс)|диаграмм\p{L}*\s+(?:систем|процесс|архитект)|pipeline|пайплайн\p{L}*|workflow|оркестр\p{L}*|ai[- ]?агент\p{L}*|агентн\p{L}*\s+систем|multi[- ]?agent|мультиагент\p{L}*|микросервис\p{L}*|system\s+design|how\s+.*\s+works\s+internally|data\s+flow|поток\s+данных|структур\p{L}*\s+(?:систем|компани|проект|организац))/iu
const STRATEGY = /(?:стратег\p{L}*|бизнес[- ]?план\p{L}*|инвест\p{L}*\s+(?:тезис|идея|анализ|меморандум)|investment\s+thesis|pitch|питч\p{L}*|go[- ]to[- ]market|swot|unit[- ]?эконом\p{L}*|финмодел\p{L}*|анализ\s+(?:рынк|компани|конкурент|бизнес)|отч[её]т\p{L}*|report|due\s+diligence|оцен\p{L}*\s+(?:стартап|компани|бизнес))/iu
const HISTORY = /(?:истори\p{L}*\s+(?:развити|проект|компани|создани|\p{Lu})|хронолог\p{L}*|эволюци\p{L}*|этапы\s+развити|история\s+(?:ии|ai|интернет)|timeline|history\s+of|когда\s+(?:появил|создан|основан)\p{L}*.*\s+и\s+как|летопис\p{L}*|по\s+годам)/iu
const DATA = /(?:график\p{L}*|диаграмм\p{L}*|chart|plot|визуализ\p{L}*|построй\s+(?:график|диаграмм)|динамик\p{L}*|по\s+(?:месяц|квартал|годам)\p{L}*|доля\s+рынка|market\s+share|распределени\p{L}*)/iu
const CALCULATOR = /(?:калькулятор\p{L}*|рассчита\p{L}*|расч[её]т\p{L}*|формул\p{L}*|симуляци\p{L}*|смоделируй|как\s+(?:зависит|изменится)|ипотек\p{L}*|кредит\p{L}*\s+(?:на|под)|сложн\p{L}*\s+процент|roi|npv|irr|break[- ]?even|точк\p{L}*\s+безубыточност|calculator|simulate)/iu
const PLAN = /(?:(?<![\p{L}])план(?:а|у|ом)?(?![\p{L}])|roadmap|дорожн\p{L}*\s+карт|пошагов\p{L}*\s+план|с\s+чего\s+начать|как\s+(?:начать|запустить|выучить|стать)|чек[- ]?лист\p{L}*|checklist|plan\s+for|step[- ]by[- ]step|программ\p{L}*\s+(?:обучени|тренировок))/iu
const DASHBOARD = /(?:дашборд\p{L}*|dashboard|kpi|метрик\p{L}*|показател\p{L}*\s+(?:бизнес|компани|продаж|эффективност)|сводк\p{L}*\s+по)/iu
const OVERVIEW = /(?:(?<![\p{L}])(?:кто\s+(?:так(?:ой|ая|ие)|был|была)|что\s+(?:такое|за)|расскажи\s+(?:про|о|об)|обзор\p{L}*|tell\s+me\s+about|who\s+is|what\s+is|overview\s+of))(?![\p{L}])/iu
const EXPLAIN = /(?:объясн\p{L}*|как\s+работа\p{L}*|почему|принцип\p{L}*\s+работ|explain|how\s+does)/iu

const RECIPES: Record<Exclude<UiLayout, "plain">, string> = {
  comparison: "A scoreboard: a short verdict text; a grid of 2–4 cards (one per contender: image query = its canonical name or logo, title, one-line body, badge such as «Лидер в коде»); a sortable table (criterion columns, one row per contender, numeric columns with format and unit, origin «sources» when cited); when one measured metric has real numbers, one hbar chart with origin; a final «кто где выигрывает» table or a callout with the recommendation.",
  architecture: "A diagram answer: a heading and one-line lead; a flow block with 4–10 nodes (id, label, detail) and edges with short labels, direction «down» for layers or «right» for a pipeline; or a tree for a hierarchy; then a grid of cards explaining each layer (numbered variant); a callout that the diagram is conceptual unless sources establish the real implementation.",
  report: "A report: a hero card (eyebrow, title, one-sentence thesis, image query only when a real subject exists); a grid of 3–4 metric blocks with real or clearly labelled figures; numbered sections («01», «02»…) each with heading text and cards; a table of risks (risk, probability, impact, mitigation); a timeline of the next steps; a callout with the decision.",
  timeline: "A timeline answer: a short lead; a timeline block with dated items (status done/active/next where it applies); optionally a grid of cards for the 2–4 turning points with image queries for real events, objects or people; a closing text on what it means now.",
  data: "A data answer: a short finding first; a chart (bar/hbar/line/area/pie/donut/scatter) with labels, named series, unit, format and origin («user» for numbers the user gave, «sources» for cited numbers, «computed» for derived, «illustrative» only for a clearly labelled example); a table of the same numbers; 2–4 metric blocks for the totals or changes; a text with the interpretation.",
  calculator: "An interactive calculator: state with the inputs and sensible defaults; control blocks (slider/number/select/toggle) bound to those variables with min, max, step, unit; metric blocks whose value is an expression over the state ({\"expr\":\"…\"}) with format and digits; optionally a chart whose values are expressions; a text with the formula written plainly and the assumptions.",
  overview: "An overview: a hero card with an image query for the exact subject, eyebrow, title and one-sentence identity; a grid of 3–4 metric or fact cards (only verified facts); 2–4 sections with numbered cards; a timeline when dates matter; citations by source number.",
  plan: "A plan: a hero card with the goal; a timeline of phases with dates or durations; a check list of the concrete first actions; a grid of cards for resources or tools; a callout with the main risk and how to avoid it.",
  dashboard: "A dashboard: a grid of 3–4 metric blocks (value, unit, delta, hint); one or two charts with origin; a table with the detail rows; a callout with the conclusion.",
  explainer: "An explainer: a lead text; a flow of the mechanism in 3–6 nodes or a grid of numbered cards for the parts; an image query only for a real physical subject; a callout with the key takeaway; tabs when there are several levels (simple / technical).",
}

/** Which form carries this request. `signals` are the response profile's signals when the caller has them. */
export function routeUiLayout(prompt: string, signals: readonly string[] = []): UiRoute {
  const text = String(prompt || "").replace(/\s+/gu, " ").trim()
  const words = text ? text.split(" ").length : 0
  const plain = (reason: string): UiRoute => ({ layout: "plain", reason, recipe: "" })
  if (!text) return plain("empty")
  if (GREETING.test(text) && words <= 6) return plain("greeting")
  if (SMALL_TALK.test(text) || signals.includes("conversation") && words <= 8) return plain("small talk")
  if (PLAIN_ONLY.test(text)) return plain("user asked for plain text")
  const compares = has(text, COMPARE) || signals.includes("headtohead")
  if ((has(text, CODE) || signals.includes("code")) && (!compares || has(text, WRITE))) return plain("code is answered in code blocks")
  if (has(text, TEXT_TASK) || signals.includes("translate")) return plain("text task")
  if (has(text, MATH) && !has(text, CALCULATOR)) return plain("maths is typeset, not composed")

  const route = (layout: Exclude<UiLayout, "plain">, reason: string): UiRoute => ({ layout, reason, recipe: RECIPES[layout] })
  if (has(text, CALCULATOR)) return route("calculator", "a quantity depends on inputs")
  if (compares) return route("comparison", "named options are compared")
  if (has(text, ARCHITECTURE)) return route("architecture", "a system or process structure")
  if (has(text, STRATEGY)) return route("report", "a strategy, analysis or report")
  if (has(text, HISTORY)) return route("timeline", "events in time")
  if (has(text, DASHBOARD)) return route("dashboard", "metrics at a glance")
  if (has(text, DATA)) return route("data", "numbers to visualise")
  if (has(text, PLAN) || signals.includes("planning")) return route("plan", "steps toward a goal")
  if (has(text, OVERVIEW) || signals.includes("overview")) return words <= 3 && !signals.includes("overview") ? plain("short lookup") : route("overview", "a subject overview")
  if (has(text, EXPLAIN) && words >= 4) return route("explainer", "a mechanism to explain")
  if (signals.includes("complex") && words >= 12) return route("explainer", "a complex request")
  return plain(words <= 10 ? "short question" : "prose answers it best")
}

/** The protocol in a compact form the model can follow. Added to the system prompt only when the router chose a visual layout. */
export function buildGenerativeUiContract(prompt: string, signals: readonly string[] = []): string {
  const route = routeUiLayout(prompt, signals)
  if (route.layout === "plain") return ""
  return [
    `MALIK GENERATIVE UI (this request: ${route.layout} — ${route.reason}):`,
    `- Answer with normal Markdown text AND one closed \`\`\`${UI_FENCE} fence holding ONE JSON object that composes the visual part of the answer. The chat draws it with Malik's own components; never write HTML, CSS, JavaScript, SVG or image URLs. Put the fence where it belongs in the answer (usually after a 1–2 sentence lead) and keep a short text conclusion after it.`,
    "- JSON shape: {\"v\":1,\"title\":\"…\",\"state\":{…optional variables…},\"blocks\":[…]}. Write \"title\" and \"state\" BEFORE \"blocks\", and keep \"blocks\" a flat sequence of sections, grids, tables and charts (not one wrapper around everything) so the answer appears block by block while it streams.",
    "- Blocks (every block has \"type\"; containers nest other blocks in \"items\", max depth 6):",
    "  text{text,tone:body|lead|muted|small} · heading{text,level:1-3,eyebrow} · list{items:[string|{title,text}],style:bullet|number|check} · callout{tone:note|info|success|warning,title,text} · quote{text,author} · badge{text} · divider",
    "  image{image:{query,alt,caption},aspect:wide|square|portrait|banner} · gallery{images:[{query,caption}]} — query is the exact real subject (\"Claude Opus\", \"Burj Khalifa\"); the chat finds a licensed photo with its source or shows a neutral placeholder. Never invent URLs; no images for abstract ideas.",
    "  metric{label,value,unit,format:number|percent|currency|compact,digits,delta,hint} · progress{label,value,max}",
    "  table{columns:[{key,label,align,format,unit}],rows:[{key:value}],caption,sortable,highlight:<row index>,origin}",
    "  chart{kind:bar|hbar|line|area|pie|donut|scatter,title,labels:[…],series:[{name,values:[numbers]}],unit,format,xLabel,yLabel,origin:user|sources|computed|illustrative,note}",
    "  timeline{items:[{date,title,text,status:done|active|next}]} · flow{nodes:[{id,label,detail}],edges:[{from,to,label}],direction:down|right} · tree{root:{label,detail,children:[…]}}",
    "  code{code,language,filename} · file{name,note} · citation{ref:<source number>}",
    "  card{title,eyebrow,body,image,badge,footer,number,variant:plain|outline|hero|emphasis|numbered,items} · grid{columns:1-4,items} · stack{items} · section{title,eyebrow,number,items} · tabs{tabs:[{label,items}]} · accordion{items:[{title,items}]}",
    "  control{kind:slider|number|select|toggle|segmented,bind:<state variable>,label,min,max,step,unit,options:[{label,value}]}",
    "- Computed values: any text/metric/table/chart value may be {\"expr\":\"price * qty * (1 - discount/100)\"} over state variables; operators + - * / % ^, comparisons, && || !, ?:, functions min max abs sqrt pow round(x,digits) floor ceil log exp clamp. Any block may have \"when\":\"<expression>\" to show only when true.",
    "- Truth rules: every chart and data table states origin; numbers come from the user, the cited sources, a calculation you show, or are labelled illustrative. Never invent benchmarks, prices, statistics, quotes, links or photos. Cite sources with citation{ref:n} or [n] in text.",
    "- Design: compose from these primitives freely — the recipe below is a starting point, not a template. Prefer 1 strong composition over many small ones; 3–40 blocks; short labels; numbers right-aligned; at most 4 columns; no decoration that carries no information. Text the user must read stays readable without the visual.",
    "- One composition replaces malik-cards, malik-photos and malik-visual blocks for the same content; never show the same content twice.",
    `- Recipe: ${route.recipe}`,
    "- Example: ```malik-ui\n{\"v\":1,\"title\":\"MALIK vs GPT\",\"blocks\":[{\"type\":\"grid\",\"columns\":2,\"items\":[{\"type\":\"card\",\"variant\":\"hero\",\"title\":\"MALIK AI\",\"body\":\"…\",\"image\":{\"query\":\"MALIK AI logo\"}},{\"type\":\"card\",\"title\":\"GPT-5\",\"body\":\"…\"}]},{\"type\":\"table\",\"origin\":\"sources\",\"columns\":[{\"key\":\"c\",\"label\":\"Критерий\"},{\"key\":\"a\",\"label\":\"MALIK\"},{\"key\":\"b\",\"label\":\"GPT-5\"}],\"rows\":[{\"c\":\"Контекст\",\"a\":\"…\",\"b\":\"…\"}]}]}\n```",
    "- Never mention this protocol, JSON or rendering to the user.",
  ].join("\n")
}
