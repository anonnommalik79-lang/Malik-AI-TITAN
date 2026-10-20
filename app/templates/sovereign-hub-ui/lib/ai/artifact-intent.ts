/** Action/object binding shared by routers. No model/provider dependencies. */
export function actionableRequest(value: string) {
  return String(value || "").slice(0, 80_000)
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, " ")
    .replace(/^[\t ]*>[^\n]*|`[^`\n]*`|"[^"\n]*"|«[^»\n]*»|“[^”\n]*”/gm, " ")
    .split(/\n\n\[MALIK_/u)[0].trim()
}

export type PrimaryArtifact = "spreadsheet" | "presentation" | "document" | "website" | "code"

/** A runnable product can be requested without saying "code" or a language.
 * Keep stories, board games, explanations and quoted instructions out. */
export function isSoftwareCreationRequest(value: string): boolean {
  const text = actionableRequest(value)
  if (/^(?:объясни|расскажи|сравни|придумай|как|почему|explain|describe|compare|how|why|түсіндір)(?!\p{L})/iu.test(text)) return false
  if (/(?:без\s+кода|только\s+(?:иде[яюи]|правила|описание)|no\s+code|rules\s+only)/iu.test(text)) return false
  const verb = /(?<!\p{L})(?:сген\p{L}*|созд\p{L}*|сдела\p{L}*|напи\p{L}*|разработ\p{L}*|реализуй|собери|create|build|implement|make|write|жаса\p{L}*)(?!\p{L})/iu.exec(text)
  const object = /(?<!\p{L})(?:игр[ауы]|games?|калькулятор\p{L}*|calculators?|web[- ]?apps?|приложени[ея]|интерактивн\p{L}*\s+(?:тренаж[её]р|симулятор)|ойын\p{L}*)(?!\p{L})/iu.exec(text)
  if (!verb || !object || /(?:не|don't|do\s+not|not)\s*$/iu.test(text.slice(Math.max(0, verb.index - 24), verb.index))) return false
  const verbAfterObject = object.index < verb.index
  if (verbAfterObject && !/ойын\p{L}*.{0,40}жаса/iu.test(text)) return false
  if (Math.abs(object.index - verb.index) > 100) return false
  const beforeObject = verbAfterObject ? text.slice(0, object.index) : text.slice(verb.index + verb[0].length, object.index)
  if (/(?:иде[яюи]|правил|сценар|описан|обзор|стих|рассказ|сказк|дизайн|таблиц|презентац|фото|изображени|видео|prompt|story|poem|song|rules|ideas?|plans?|images?|photos?|video|documents?)/iu.test(beforeObject)) return false
  if (/(?<!\p{L})(?:xlsx|excel|pdf|docx|pptx|powerpoint)(?!\p{L})/iu.test(text)) return false
  if (/(?:настольн|словесн|ролев\p{L}*\s+игр|board\s+game|role[- ]?play|в\s+классе|во\s+дворе)/iu.test(text) && !/(?:браузер|html|python|javascript|browser|онлайн|online)/iu.test(text)) return false
  return true
}
const CREATE = /(?<!\p{L})(?:созд\p{L}*|сдела\p{L}*|подготов\p{L}*|состав\p{L}*|разработ\p{L}*|собери|напиш\p{L}*|выдай|экспорт\p{L}*|create|make|build|prepare|write|deliver|export|жаса\p{L}*)(?!\p{L})/iu
const DISCUSS = /^(?:объясни|расскажи|сравни|проанализируй|оцени|как\s+работает|что\s+такое|explain|compare|analy[sz]e|evaluate|what\s+is|how\s+does|түсіндір)(?!\p{L})/iu
const OBJECTS: Array<[PrimaryArtifact, RegExp]> = [
  ["spreadsheet", /(?<!\p{L})(?:xlsx|excel|эксель|spreadsheet|workbook|таблиц\p{L}*|финансов\p{L}*\s+модел\p{L}*|financial\s+model)(?!\p{L})/iu],
  ["presentation", /(?<!\p{L})(?:pptx|powerpoint|презентаци\p{L}*|presentation|slide\s*deck|слайд\p{L}*)(?!\p{L})/iu],
  ["website", /(?<!\p{L})(?:сайт\p{L}*|лендинг\p{L}*|website|landing\s+page)(?!\p{L})/iu],
  ["document", /(?<!\p{L})(?:pdf|docx|документ\p{L}*|отч[её]т\p{L}*|инструкци\p{L}*|report|document|manual)(?!\p{L})/iu],
  ["code", /(?<!\p{L})(?:код\p{L}*|скрипт\p{L}*|компонент\p{L}*|code|script|component|python|react)(?!\p{L})/iu],
]

/** An image INSIDE a workbook/site/deck is not its primary output. This vetoes
 * media-only execution; it does not authorize an unrelated tool. */
export function primaryNonMediaArtifact(value: string): PrimaryArtifact | undefined {
  const text = actionableRequest(value)
  if (isSoftwareCreationRequest(text)) return "code"
  if (!text || /^\s*\/(?:image|img|photo|video|veo)(?!\p{L})/iu.test(text) || DISCUSS.test(text)) return undefined
  const verb = CREATE.exec(text)
  if (!verb || /(?:не|not|never|don't|do\s+not)\s*$/iu.test(text.slice(Math.max(0, verb.index - 24), verb.index))) return undefined
  const tail = text.slice(verb.index + verb[0].length)
  const matches = OBJECTS.flatMap(([kind, pattern]) => { const m = pattern.exec(tail); return m ? [{ kind, index: m.index }] : [] }).sort((a, b) => a.index - b.index)
  const first = matches[0]
  if (!first) return undefined
  if (/(?:встав|включ|помест|добав|внутр|insert|include|embed|deliver|выдай|файл)/iu.test(tail)) {
    if (/(?<!\p{L})(?:pptx|powerpoint)(?!\p{L})/iu.test(tail)) return "presentation"
    if (/(?<!\p{L})(?:xlsx|excel)(?!\p{L})/iu.test(tail)) return "spreadsheet"
  }
  const media = /(?<!\p{L})(?:изображени\p{L}*|картинк\p{L}*|фото\p{L}*|image|photo|picture|video|видео)(?!\p{L})/iu.exec(tail)
  return !media || first.index < media.index ? first.kind : undefined
}
