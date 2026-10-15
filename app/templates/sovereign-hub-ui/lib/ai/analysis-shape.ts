import type { VisualEngineType } from "@/lib/visual/schema"

/**
 * Malik Analyst for any subject — the shape of a professional analysis when
 * the person brings a question rather than a table.
 *
 * A table in the message goes to the data analyst (lib/analysis), which
 * computes every number. A question like «проанализируй рынок кофеен в
 * Алматы» or «разбери риски открытия барбершопа» has no table: it gets the
 * structure a senior analyst would deliver — verdict, key findings, the frame
 * that fits the subject, numbers only from evidence or labelled estimates,
 * KPI cards and a chart where the numbers justify them, scenarios, a risk
 * table and concrete recommendations. A poem or a historical event is analysed
 * too, but in its own frame: nobody needs a KPI dashboard for Pushkin.
 */

export type AnalysisFrame = "market" | "company" | "decision" | "event" | "text" | "technology" | "person" | "general"

const ASKS = /(?:^|[\s,.!?:;(«"])(?:проанализ\p{L}*|анализ\p{L}*|аналитик\p{L}*\s+(?:по|о|об|рынк)|аналитическ\p{L}*\s+(?:обзор|разбор|записк|отч[её]т)|разбер\p{L}*|разбор\p{L}*|оцени\p{L}*\s+(?:рын|риск|перспектив|бизнес|иде|проект|стратег|ситуац|потенциал|конкурент|спрос|шанс|возможност|компани|стартап|инвестиц|эффективност|модел)|исследуй|исследовани\p{L}*\s+рынк|swot|pestel?|пест(?:ел)?[- ]анализ|5\s+сил\s+портер|пять\s+сил|портер\p{L}*|перспектив\p{L}*\s+(?:рынк|развит|отрасл|бизнес|компани|профессии|направлен)|стоит\s+ли\s+(?:открывать|открыть|инвестировать|вкладывать|запускать|начинать|покупать\s+акци)|due\s+diligence|deep\s+dive|analy[sz]\p{L}*|assess\p{L}*|evaluate\s|breakdown\s+of|market\s+(?:research|outlook|overview)|талда\p{L}*|сарапта\p{L}*)/iu

/** Not analysis in this sense: code review, grammar parsing, data in the message, a translation. */
const NOT = /(?:разбор\p{L}*|разбер\p{L}*)\s+(?:слов\p{L}*\s+)?по\s+составу|морфологическ|синтаксическ|фонетическ|(?:проанализ\p{L}*|разбер\p{L}*|analy[sz]e|review)\s+(?:мой\s+|этот\s+|my\s+|this\s+)?(?:код|code|скрипт|функци|function|ошибк|лог|logs?|stack\s*trace)|переведи|translate|разбери\s+(?:посылк|коробк|шкаф|завал|вещ)|анализ\p{L}*\s+(?:крови|мочи|кала|на\s)|сда\p{L}*\s+анализ|результат\p{L}*\s+анализ|^\s*(?:что\s+такое|what\s+is|кто\s+такой)/iu

export function asksAnalysis(prompt: string): boolean {
  const text = String(prompt || "").slice(0, 4000)
  return ASKS.test(text) && !NOT.test(text)
}

export function analysisFrame(prompt: string): AnalysisFrame {
  const text = String(prompt || "").toLowerCase()
  if (/стих|поэм|роман|рассказ|повест|произведени|книг|фильм|картин|песн|текст|эсс[еэ]|сочинени|poem|novel|story|film|movie|painting|lyrics|essay|өлең|шығарма/iu.test(text)) return "text"
  if (/стоит\s+ли|выбрать|выбор|вариант|альтернатив|или\s+\p{L}|should\s+i|which\s+(?:one|option)|decide/iu.test(text)) return "decision"
  if (/рын(?:ок|ка|ку|ке)|рынк|отрасл|индустр|сектор|спрос|ниш|market|industry|sector|niche|demand|нарық/iu.test(text)) return "market"
  if (/компани|бизнес[- ]?модел|стартап|бренд|акци|отч[её]тност|финанс|выручк|kaspi|halyk|tesla|apple|google|amazon|microsoft|company|startup|business\s+model|stock|earnings|revenue/iu.test(text)) return "company"
  if (/технолог|нейросет|(?<!\p{L})ии(?!\p{L})|искусственн|блокчейн|крипт|квант|робот|technology|\bai\b|blockchain|crypto|quantum|robot/iu.test(text)) return "technology"
  if (/войн|кризис|реформ|выбор(?:ы|ов)|закон|политик|санкц|инфляц|событи|революц|war|crisis|reform|election|policy|sanction|inflation|event/iu.test(text)) return "event"
  if (/личност|лидер|президент|основател|биограф|карьер|leader|founder|career|biography/iu.test(text)) return "person"
  return "general"
}

const FRAME: Record<AnalysisFrame, string> = {
  market: "MARKET frame: definition and boundaries of the market → size and growth (sourced, or a labelled bottom-up estimate with its arithmetic) → segments and customers → competitors and their positioning (table) → unit economics or price levels → entry barriers and regulation → trends and drivers.",
  company: "COMPANY frame: what it sells and to whom → business model and revenue drivers → key financials from evidence (table, with period and currency) → competitive moat and weak spots → management and strategy → valuation or outlook only from evidence.",
  decision: "DECISION frame: the options side by side → decisive criteria with weights (a Markdown table: criterion | Вес % | one 0–10 score column per option; no total row) → what each option costs and risks → the winner by scenario → the reversible first step.",
  event: "EVENT/POLICY frame: what happened and when (exact dates) → causes → actors and their interests → effects already visible (with evidence) → scenarios for what comes next → what to watch.",
  text: "WORK OF ART/TEXT frame: theme and idea → composition and structure → language and artistic devices with short quotes → characters or images → historical and personal context → interpretation and why it matters. No KPI cards or financial charts here.",
  technology: "TECHNOLOGY frame: how it works in plain terms → maturity and real adoption (evidence) → who leads and how they differ → limits, costs and risks → where it is going and what it changes for the user.",
  person: "PERSON frame: who they are and why it matters → key decisions and turning points with dates → results measured where possible → strengths and criticisms from evidence → legacy and relevance today.",
  general: "Choose the frame a top analyst would use for this exact subject (e.g. causes → mechanism → effects → options; or structure → drivers → risks → outlook) and name it in a heading.",
}

/** Which interactive blocks suit the frame: numbers get KPI cards and charts, a poem gets none. */
export function analysisVisualKinds(frame: AnalysisFrame): VisualEngineType[] {
  if (frame === "text" || frame === "person") return []
  if (frame === "decision") return ["table", "chart"]
  if (frame === "event") return ["chart", "table"]
  return ["dashboard", "chart", "table"]
}

export function buildAnalystContract(prompt: string, today: string): string {
  const frame = analysisFrame(prompt)
  const numeric = analysisVisualKinds(frame).length > 0
  return [
    "ANALYST CONTRACT (the user asked for an analysis; deliver what a senior analyst at a top consultancy would, on this exact subject, in the user's language):",
    "- First line: a bold one-sentence verdict that answers the question — the «so what». If the facts can change, the next line is «Актуально на " + today + "» (in the user's language).",
    "- Then «Ключевые выводы» (in the user's language): 3-5 bullets, most important first, each a specific finding with a number, a name or a date — never a generic statement that would fit any subject.",
    `- ${FRAME[frame]}`,
    "- Give each part a short ### heading. Every sentence carries information specific to this subject; no textbook definitions, no filler, no repeated summary.",
    ...(numeric ? [
      "- NUMBERS: use only numbers from the supplied evidence (cite [n] right after) or from the user's message. Anything else is an estimate: write «оценка», the assumption it rests on and a range, and show the arithmetic. Never present an estimate as a fact; if a figure is unknown, say so and name where to get it.",
      "- VISUALS: when the analysis has numbers, add up to three ```malik-visual blocks where they explain better than text — a dashboard of 3-6 KPI cards with the decisive figures, one chart for the key trend or comparison, a table for competitors/options. dataKind must be honest: sourced (with sources), user, or estimate. No block without numbers that justify it; never invent a series to fill a chart.",
      "- SCENARIOS: for any forward-looking question, a table Пессимистичный | Базовый | Оптимистичный — the assumption driving each and the outcome (in the user's language).",
    ] : []),
    "- RISKS: a table — риск | вероятность | влияние | как снизить (in the user's language), only risks specific to this subject.",
    "- Finish with «Рекомендации»: 3-5 numbered, concrete actions in priority order (what exactly, first step, how to measure it), then one line «Что изменит вывод»: the data that would change the conclusion.",
  ].join("\n")
}
