/**
 * The answer sheet: a long written answer — a business plan, an essay, a
 * report, a letter — opens on its own page, where it is written in front of
 * the user block by block instead of landing in the chat as one wall of text.
 *
 * These are the rules for when that happens. They are deliberately plain
 * functions with no React and no DOM, so they can be tested on their own.
 */

// "Напиши", "составь", "подготовь" … — the request asks for something to be
// written, not explained.
const WRITE_VERB = /(?:^|[\s,.!?:;«"(])(?:напиши(?:те)?|написать|составь(?:те)?|составить|подготовь(?:те)?|подготовить|сделай(?:те)?|сделать|создай(?:те)?|создать|сгенерируй(?:те)?|оформи(?:те)?|разработай(?:те)?|распиши(?:те)?|набросай(?:те)?|сочини(?:те)?|опиши(?:те)?|перепиши(?:те)?|write|draft|compose|create|prepare|generate|make|жаз(?:ыңыз|шы)?|дайында(?:шы)?|құрастыр)(?=$|[\s,.!?:;»")])/iu

// What gets written on a page.
// JavaScript's \b does not see Cyrillic letters, so word edges are spelled
// out with Unicode lookarounds.
const DOCUMENT_NOUN = /(?:документ|стать[юяи]|эссе|реферат|доклад|отч[её]т|бизнес[- ]?план|(?<!\p{L})план(?:а|е|у|ы)?(?!\p{L})|стратеги[юяи]|резюме|(?<!\p{L})cv(?!\p{L})|сопроводительн|письм[оа]|договор|контракт|соглашени|инструкци|руководств|гайд|регламент|политик[уа]|положени[ея]|сочинени|рассказ|сказк|стих|поэм|сценари|конспект|лекци|(?<!\p{L})тз(?!\p{L})|техническ(?:ое|ого)\s+задани|коммерческ(?:ое|ого)\s+предложени|(?<!\p{L})кп(?!\p{L})|пресс[- ]?релиз|курсов|дипломн|исследовани|обзор|анализ|заявк|бриф|меморандум|протокол|устав|описани[ея]\s+(?:вакансии|продукта|компании|проекта)|essay|article|report|business\s+plan|\bplan\b|strategy|resume|cover\s+letter|letter|contract|agreement|manual|guide|policy|proposal|story|poem|script|whitepaper|memo|мақала|баяндама|жоспар|хат|түйіндеме|шарт|нұсқаулық)/iu

// Requests that belong somewhere else: decks go to the presentation studio,
// code to the code flow, pictures and media to their own tools.
const NOT_A_SHEET = /(?:презентаци|слайд|питч[- ]?дек|pitch[- ]?deck|presentation|slides?\b|(?<!\p{L})код(?:а|ом|у)?(?!\p{L})|скрипт|функци[юя]|html|css|javascript|typescript|python|(?<!\p{L})sql(?!\p{L})|react|картинк|изображени|фото|рисунок|нарисуй|image|picture|photo|видео|video|музык|трек|excel|\.xlsx|\.csv)/iu

// A site, an app or a bot is usually something to build, not to write about:
// with one of these in the request, only an unmistakable document name ("ТЗ
// на приложение", "бизнес-план сервиса доставки") still opens a sheet.
const SOFTWARE_WORD = /(?:сайт|лендинг|landing|приложени|(?<!\p{L})бот(?:а|ы)?(?!\p{L})|(?<!\p{L})app(?!\p{L})|website)/iu
const STRONG_DOCUMENT = /(?:документ|(?<!\p{L})тз(?!\p{L})|техническ(?:ое|ого)\s+задани|бизнес[- ]?план|стать[юяи]|отч[её]т|резюме|письм[оа]|договор|инструкци|руководств|описани|эссе|обзор|анализ|стратеги|коммерческ(?:ое|ого)\s+предложени|business\s+plan|article|report|spec(?:ification)?)/iu

// A question about documents is answered in the chat.
const QUESTION_START = /^\s*(?:что|как|почему|зачем|сколько|где|когда|кто|какой|какая|какие|чем|можно\s+ли|нужно\s+ли|what|how|why|when|where|who|which|is|are|can|should|do|does)(?!\p{L})/iu

/** Whether a chat request asks for a written document that belongs on a sheet. */
export function isSheetRequest(text: string): boolean {
  const value = String(text || "").trim()
  if (value.length < 8 || value.length > 4000) return false
  if (NOT_A_SHEET.test(value)) return false
  if (!DOCUMENT_NOUN.test(value)) return false
  if (SOFTWARE_WORD.test(value) && !STRONG_DOCUMENT.test(value)) return false
  // "Как написать резюме?" is a question about writing, answered in the chat.
  if (QUESTION_START.test(value)) return false
  if (WRITE_VERB.test(` ${value}`)) return true
  // "Бизнес-план кофейни на 12 месяцев" — a bare document name is a request too,
  // unless it is phrased as a question.
  return !/\?\s*$/.test(value) && value.split(/\s+/).length <= 14 && /^(?:бизнес[- ]?план|план|эссе|реферат|доклад|отч[её]т|резюме|письмо|договор|стать[яю]|сочинение|инструкция|business\s+plan|essay|report|resume|cover\s+letter)/iu.test(value)
}

function stripCode(markdown: string) {
  return markdown.replace(/```[\s\S]*?(?:```|$)/g, "")
}

/**
 * Whether a finished answer reads better as a document than as a chat
 * bubble: long, and organised — headings, lists, tables — rather than one
 * long paragraph or a block of code.
 */
export function isSheetWorthy(answer: string): boolean {
  const text = String(answer || "")
  const prose = stripCode(text)
  if (prose.length < 900) return false
  if (prose.length < text.length * 0.5) return false
  const headings = (prose.match(/^#{1,6}\s+\S/gm) || []).length
  const listItems = (prose.match(/^\s*(?:[-*•]|\d+[.)])\s+\S/gm) || []).length
  const tables = (prose.match(/^\s*\|.+\|\s*$/gm) || []).length
  if (headings >= 2) return true
  if (headings >= 1 && (listItems >= 3 || tables >= 2)) return true
  return prose.length >= 2600
}

/** The sheet's title: the answer's first heading, else what was asked for. */
export function sheetTitle(answer: string, request = ""): string {
  const heading = String(answer || "").match(/^#{1,3}\s+(.+?)\s*#*\s*$/m)?.[1]
  const clean = (value: string) => value.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim()
  if (heading && clean(heading)) return clean(heading).slice(0, 120)
  const topic = clean(String(request || ""))
    .replace(/^(?:пожалуйста|please)[,\s]+/iu, "")
    .replace(WRITE_VERB, " ")
    .replace(/^\s*(?:мне|me|a|an)\s+/iu, "")
    .trim()
  const title = topic ? topic.charAt(0).toUpperCase() + topic.slice(1) : "Документ"
  return title.length > 120 ? `${title.slice(0, 117)}…` : title
}

/** A download name every operating system accepts. */
export function sheetFileName(title: string, extension = "md"): string {
  const base = String(title || "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return `${base || "document"}.${extension}`
}

/**
 * How long each block of the sheet takes to be written, in milliseconds, and
 * when it starts. Long documents are written faster so the whole reveal never
 * takes more than `budget`.
 */
export type SheetBlockKind = "h" | "p" | "list" | "table" | "code" | "quote" | "hr" | "other"

export function sheetTimeline(blocks: Array<{ kind: SheetBlockKind; size: number }>, budget = 9000) {
  const natural = blocks.map(({ kind, size }) => {
    switch (kind) {
      case "h": return 420
      case "p": return Math.min(1100, 260 + size * 1.6)
      case "list": return Math.min(1600, 220 + size * 150)
      case "table": return Math.min(1600, 260 + size * 110)
      case "code": return 520
      case "quote": return 600
      case "hr": return 200
      default: return 400
    }
  })
  const total = natural.reduce((sum, value) => sum + value, 0)
  const scale = total > budget ? budget / total : 1
  let at = 0
  return natural.map((duration) => {
    const start = Math.round(at)
    at += duration * scale
    return { start, duration: Math.round(at) - start }
  })
}
