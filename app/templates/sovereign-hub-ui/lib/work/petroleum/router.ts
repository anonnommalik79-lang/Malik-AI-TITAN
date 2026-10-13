import { isOilGasRequest } from "../../ai/oil-gas-skill"
import { routingScope } from "../../ai/prompt-shape"

export const PETROLEUM_SKILL_ID = "petroleum.analyze" as const
export const PETROLEUM_TOKEN = "@Malik Oil AI"
export const petroleumSelected = (text: string) => /(?:^|\s)@Malik Oil AI(?=\s|$)/i.test(text)
export const stripPetroleumToken = (text: string) => text.replace(/(?:^|\s)@Malik Oil AI(?=\s|$)/gi, " ").trim()
export function petroleumMention(text: string, caret = text.length) {
  const match = text.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/)
  if (!match || !["oil", "petroleum", "нефть", "нефти", "malik", "نفط"].some(alias => alias.startsWith(match[1].toLowerCase()))) return null
  return { start: caret - match[1].length - 1, end: caret }
}
/** An oil column with a rate unit (a pasted production table) is petroleum data whatever the wording. */
const PRODUCTION_TABLE = /(?<![\p{L}])(?:oil|нефт\p{L}*|мұнай\p{L}*|نفط|qo)[^|;\t\n]{0,24}?(?:bbl|stb|bopd|m3|м3|m³|м³|т\/сут|t\/d|т\/тәул|tonnes?\/)/iu
export type PetroleumRoute = { skillId?: typeof PETROLEUM_SKILL_ID; engine: "petroleum" | "chat" | "image" | "video" | "music" | "presentation" | "code"; domain: boolean; explicit: boolean }
/** Domain and output intent are separate. Quoted examples and fenced data cannot select a generator. */
export function routePetroleum(prompt: string, selectedSkillId?: unknown): PetroleumRoute {
  const explicit = selectedSkillId === PETROLEUM_SKILL_ID || petroleumSelected(prompt)
  const text = routingScope(stripPetroleumToken(prompt)).slice(0, 6000)
  const actionable = text.replace(/(?:не\s+(?:генерируй|создавай|рисуй|нарисуй|сгенерируй)|do\s+not\s+(?:generate|create|draw)|don't\s+(?:generate|create|draw)|لا\s+(?:ترسم|تنشئ))[^.;\n]*/giu, "")
  const domain = explicit || isOilGasRequest(text) || PRODUCTION_TABLE.test(stripPetroleumToken(prompt).slice(0, 600_000)) || /النفط|نفطي|الغاز الطبيعي|إنتاج النفط|البئر|الآبار|مكمن|حقل نفط|الغاز المسال|\bLNG\b|water\s*cut|gas.oil\s+ratio|\bGOR\b|sour\s+gas|\brefinery\b|\brefining\b/iu.test(text)
  const base = { domain, explicit, ...(domain ? { skillId: PETROLEUM_SKILL_ID } : {}) }
  const create = /нарисуй|сгенерируй|создай|сделай|напиши|write|generate|draw|create|make|render|ارسم|أنشئ|انشئ|صمم|жаса|сал/iu.test(actionable)
  if (/(?:напиши|создай|разработай|исправь|write|create|build|fix|debug|اكتب)\s+(?:мне\s+|an?\s+)?(?:(?:python|javascript|typescript|SQL)\s+)?(?:код|скрипт|сайт|code|script|website|function|برنامج)/iu.test(actionable)) return { ...base, engine: "code" }
  if (domain && /(?:нарисуй|draw|ارسم|сал).{0,40}(?:график|диаграмм|chart|diagram|منحنى|مخطط|conclusion)/iu.test(actionable)) return { ...base, engine: "petroleum" }
  // Match a requested object next to a creation verb, not the mere presence of a media term.
  if (/^\s*\/(?:image|img|photo)\b/iu.test(actionable) || /(?:нарисуй|draw|ارسم)\s/iu.test(actionable) || create && /(?:сгенерируй|создай|сделай|generate|create|make|render|أنشئ|انشئ|صمم)\s+(?:мне\s+|an?\s+|the\s+)?(?:изображени|фото|картин|image|photo|picture|صورة)/iu.test(actionable)) return { ...base, engine: "image" }
  if (/^\s*\/video\b/iu.test(actionable) || create && /(?:создай|сделай|сгенерируй|create|generate|make|أنشئ|انشئ)\s+(?:мне\s+|an?\s+)?(?:видео|ролик|video|فيديو)/iu.test(actionable)) return { ...base, engine: "video" }
  if (/^\s*\/music\b/iu.test(actionable) || create && /(?:создай|напиши|сделай|сгенерируй|create|write|generate|make|أنشئ|انشئ)\s+(?:мне\s+|a\s+)?(?:музык|песн|трек|music|song|track|أغنية|موسيقى)/iu.test(actionable)) return { ...base, engine: "music" }
  if (create && /презентаци|слайд|presentation|slide\s*deck|عرض تقديمي/iu.test(actionable)) return { ...base, engine: "presentation" }
  if (/(?:напиши|создай|разработай|write|create|build|اكتب)\s+(?:мне\s+|a\s+)?(?:код|скрипт|сайт|code|script|website|function|برنامج)/iu.test(actionable)) return { ...base, engine: "code" }
  const analytic = /проанализ|анализ|рассчита|посчитай|прогноз|дебит|диагност|причин|экономик|обводн|пада[ею]|отч[её]т|сравн|оцен|calculate|compute|analy[sz]|forecast|decline|diagnos|estimate|compare|report|\bNPV\b|\bIRR\b|حل[ّل]*|احسب|تحليل|توقع|تنبؤ|المخاطر|талда|есепте|болжам/iu.test(text)
  return { ...base, engine: domain && (explicit || analytic) ? "petroleum" : "chat" }
}
