export type FreshnessCategory = "STATIC" | "CURRENT" | "MIXED" | "LIVE" | "UNCERTAIN"
export type FreshnessMode = "fast" | "deep" | "max"
export type TimeWindow = { from: string; to: string; label: string }
export type FreshnessIntent = {
  category: FreshnessCategory
  needsSearch: boolean
  reason: string
  language: "ru" | "kk" | "en"
  checkedAt: string
  localDate: string
  timeZone: string
  window?: TimeWindow
  historical: boolean
  ttlMs: number
}

export const NO_WEB = /(?:не\s+(?:ищи|гугли|загугливай)|без\s+(?:поиска|интернета|гугла)|do not (?:search|browse)|don't (?:search|browse)|without (?:web|search|internet)|интернетсіз|іздеме|іздеудің\s+қажеті\s+жоқ)/iu
const ASK_WEB = /(?:по[ий]щ[иь]|загугл|найди\s+(?:в\s+(?:сети|интернете)|источник)|\b(?:browse|search the web|look up|search online)\b|интернеттен\s+(?:ізде|тап))/iu
const CREATIVE = /^(?:(?:пожалуйста|please)\s+)?(?:(?:напиши|сочини|придумай)\s+(?:стих|сказк|рассказ|песн)|(?:write|compose)\s+(?:(?:a|an)\s+)?(?:story|poem|fairy\s+tale|song|lyrics)\b|(?:өлең|ертегі|әңгіме)\s+жаз)/iu
const SELF_CONTAINED = /^(?:(?:пожалуйста|please)\s+)?(?:переведи|перевод|translate\b|аудар|посчитай|вычисли|реши|calculate\b|compute\b|solve\b|есепте|шеш\b|докажи|prove\b)/iu
const WRITING = /(?:напиши|создай|сделай|объясни|рассчитай|write\b|build\b|create\b|explain\b|implement\b|жаз|түсіндір|жаса)/iu
const LIVE_WORDS = /(?:последние?\s+24\s+час|за\s+24\s+час|сегодня|вчера|прямо\s+сейчас|в\s+реальном\s+времени|\btoday\b|\byesterday\b|last\s+24\s+hours|right\s+now|бүгін|кеше|соңғы\s+24\s+сағат)/iu
const TIME_WORDS = /(?:последн|новейш|свеж|актуальн|на\s+этой\s+неделе|текущ|\blatest\b|\bcurrent\b|\brecent\b|this\s+(?:week|month|year)|соңғы|қазіргі|жаңа)/iu
const VOLATILE = /(?:новост|погод|курс\s+(?:валют|доллар|евро)|цен[ауы]|стоимост|сколько\s+стоит|президент|министр|расписани|спикер|релиз|выпуст|выш[её]л|(?<!\p{L})(?:версии?|версия)|доступност|\b(?:news|weather|price|pricing|exchange rate|president|ceo|schedule|release|version|available|availability)\b|жаңалық|бағасы|бағам|нұсқа|шығарыл|президент|министр)/iu
const AI = /(?:\b(?:AI|LLM|GPT|OpenAI|Anthropic|Claude|Gemini|DeepMind|Meta|Llama|DeepSeek|Alibaba|Qwen|Mistral|xAI|Grok)\b|ИИ[ -]?модел|модел.{0,20}ИИ|искусственн.{0,20}интеллект|жасанды\s+интеллект|ЖИ[ -]?модел)/iu
/** A ranked model list is a changing factual claim, even without words like "today". */
const LEADERBOARD = /(?:\b(?:top[\s-]?\d+|rankings?|leaderboards?|benchmarks?|best|strongest)\b|(?:^|[^\p{L}])топ(?:[\s-]?\d+|(?=[^\p{L}]|$))|рейтинг\p{L}*|лидерборд\p{L}*|бенчмарк\p{L}*|үздік\p{L}*)/iu
const LANGUAGE_MODEL = /(?:языков\p{L}*\s+модел\p{L}*|текстов\p{L}*(?:\s+\p{L}+){0,2}\s+модел\p{L}*|модел\p{L}*.{0,20}(?:языков|ИИ)|(?:large\s+)?language\s+models?|foundation\s+models?|чат-?бот\p{L}*|тілдік\s+модел\p{L}*|үлкен\s+тілдік)/iu

export function isModelLeaderboardRequest(prompt: string): boolean {
  return LEADERBOARD.test(prompt) && (AI.test(prompt) || LANGUAGE_MODEL.test(prompt))
}

const COMPARISON = /(?:сам.{0,8}(?:мощн|сильн|лучш)|сильнейш|сравни|выбери|рекоменду|\b(?:best|strongest|most powerful|compare|recommend)\b|ең\s+(?:күшті|үздік)|салыстыр)/iu
const HISTORICAL = /(?:в\s+(?:19\d{2}|20\d{2})\s*году|историческ|история|раньше|в\s+конкретный\s+исторический|\bin\s+(?:19\d{2}|20\d{2})\b|historical|history of|тарих|(?:19\d{2}|20\d{2})\s*жылы)/iu
const BASIC = /(?:фотосинтез|photosynthesis|теорем.{0,15}пифагор|pythagor|площадь\s+круга|закон\s+ньютона|newton's laws|арифметик|arithmetic|гравитация|what is a prime number)/iu
const EVENT = /(?:спикер|участник|программ|speakers?|participants?|programme?|program|lineup|қатысушылар)/iu
const TECH = /(?:технолог|продукт|компани|technology|technologies|products?|companies|next\.?js|react|python|node\.?js)/iu

export function localDateAt(now: Date, timeZone = "Asia/Almaty"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

function localMidnight(date: string, timeZone: string): number {
  const nominal = Date.parse(date + "T00:00:00Z")
  // Derive the actual zone offset (including changes/DST) from ICU, not a hardcoded UTC+6.
  let guess = nominal
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess))
    const get = (name: string) => Number(parts.find((part) => part.type === name)?.value)
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
    guess += nominal - wall
  }
  return guess
}

export function temporalWindow(prompt: string, now = new Date(), timeZone = "Asia/Almaty"): TimeWindow | undefined {
  const end = now.getTime()
  const day = 86_400_000
  const date = localDateAt(now, timeZone)
  let from: number, to = end, label: string
  if (/24\s*(?:час|hours|сағат)/iu.test(prompt)) { from = end - day; label = "last-24-hours" }
  else if (/(?:вчера|\byesterday\b|кеше)/iu.test(prompt)) { to = localMidnight(date, timeZone); from = localMidnight(localDateAt(new Date(to - 1), timeZone), timeZone); label = "yesterday" }
  else if (/(?:сегодня|\btoday\b|бүгін)/iu.test(prompt)) { from = localMidnight(date, timeZone); label = "today" }
  else if (/(?:семь|7|seven)\s*(?:дн|days|күн)|недел|this week|соңғы\s+апта/iu.test(prompt)) { from = end - 7 * day; label = "last-seven-days" }
  else if (/текущ.{0,8}месяц|this month|осы ай/iu.test(prompt)) { from = localMidnight(date.slice(0, 7) + "-01", timeZone); label = "this-month" }
  else if (/текущ.{0,8}год|this year|осы жыл/iu.test(prompt)) { from = localMidnight(date.slice(0, 4) + "-01-01", timeZone); label = "this-year" }
  else return undefined
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), label }
}

export function classifyFreshness(prompt: string, now = new Date(), timeZone = "Asia/Almaty"): FreshnessIntent {
  const text = prompt.normalize("NFKC").replace(/ё/giu, "е").trim()
  const language = /[әіңғүұқөһ]|бүгін|кеше|қандай|соңғы|нұсқа/iu.test(text) ? "kk" : /[а-я]/iu.test(text) ? "ru" : "en"
  const historical = HISTORICAL.test(text) && !TIME_WORDS.test(text) && !LIVE_WORDS.test(text)
  const base = { language, checkedAt: now.toISOString(), localDate: localDateAt(now, timeZone), timeZone, historical } as const
  const result = (category: FreshnessCategory, needsSearch: boolean, reason: string): FreshnessIntent => {
    const window = needsSearch && !historical ? temporalWindow(text, now, timeZone) : undefined
    // "Latest model today" asks what is current as of today, not what was released today.
    const asOf = window?.label === "today" && !/(?:новост|news|жаңалық|произошл|выш|выпуст|released|announced|launch|опублик|событ|не\s+болды|шығарыл)/iu.test(text)
      && /(?:модел|models?|верс|version|price|pricing|цен|погод|weather|президент|president|министр|minister|бағам|нұсқа)/iu.test(text)
    return { ...base, category, needsSearch, reason, ttlMs: category === "LIVE" ? 60_000 : category === "STATIC" ? 1_200_000 : 300_000, ...(window && !asOf ? { window } : {}) }
  }
  if (!text) return result("STATIC", false, "empty")
  if (NO_WEB.test(text)) return result("UNCERTAIN", false, "user-opt-out")
  if (ASK_WEB.test(text)) return result(historical ? "STATIC" : LIVE_WORDS.test(text) ? "LIVE" : "UNCERTAIN", true, "explicit-search")
  if (/^(?:переведи|перевод|translate\b|аудар)/iu.test(text)) return result("STATIC", false, "translation")
  if (CREATIVE.test(text) && !/(?:новост|источник|research|sources|news|жаңалық)/iu.test(text)) return result("STATIC", false, "creative")
  if (SELF_CONTAINED.test(text) && !VOLATILE.test(text) && !/(?:актуальн|current|latest|соңғы|қазіргі)/iu.test(text)) return result("STATIC", false, "self-contained")
  if (historical) return result("STATIC", false, "historical")
  const changing = isModelLeaderboardRequest(text) || VOLATILE.test(text) || AI.test(text) && (COMPARISON.test(text) || TIME_WORDS.test(text) || /(?:модел|models?|GPT[ -]?\d|Claude[ -]?\d|Gemini[ -]?\d|Grok[ -]?\d)/iu.test(text))
    || TECH.test(text) && /(?:нов[а-я]*|latest|current|recent|new|жаңа|соңғы)/iu.test(text)
    || EVENT.test(text) && /(?:форум|конференц|мероприяти|выставк|conference|summit|forum|event|expo)/iu.test(text)
  const factualTime = (TIME_WORDS.test(text) || LIVE_WORDS.test(text)) && /(?:кто|како|каки|что.{0,20}(?:произошло|нового)|когда|what|which|who|when|қандай|не\s+болды)/iu.test(text)
  if (changing || factualTime) return result(LIVE_WORDS.test(text) ? "LIVE" : WRITING.test(text) ? "MIXED" : "CURRENT", true, "changing-fact")
  if (BASIC.test(text) || /(?:код|code|python|typescript|javascript|html|css)/iu.test(text) && WRITING.test(text)) return result("STATIC", false, "stable-task")
  if (/^(?:привет|салам|сәлем|hi|hello|спасибо|thanks|как дела|мне грустно|сегодня я устал)[.!?\s]*$/iu.test(text)) return result("STATIC", false, "conversation")
  return result("UNCERTAIN", false, "no-changing-fact-detected")
}

export function freshnessMode(value: unknown): FreshnessMode {
  return /^(?:max|ultra)$/iu.test(String(value)) ? "max" : /^(?:deep|глубоко)$/iu.test(String(value)) ? "deep" : "fast"
}

/** Public search queries must not contain account data, credentials or private attachments. */
export function publicSearchText(prompt: string): string {
  if (/(?:моя\s+зарплата|мои\s+доходы|мой\s+(?:паспорт|ИИН)|банковск.{0,15}(?:счет|счёт)|my\s+(?:salary|income|account)|жеке\s+дерек)/iu.test(prompt)) {
    return /налог|tax|салық/iu.test(prompt) ? "Казахстан налоговый кодекс актуальные ставки официальный источник" : ""
  }
  if (/(?:\b(?:api[_ -]?key|password|secret|token|authorization|bearer|sk-[\w-]+)\b|пароль|секрет|ключ\s*[:=]|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|(?:\+?\d[\s()-]*){10,}|BEGIN .{0,20}PRIVATE KEY)/iu.test(prompt)) {
    if (/(?:next\.?js|react|python|node\.?js)/iu.test(prompt) && /(?:верс|version|latest|нұсқа)/iu.test(prompt)) return `${prompt.match(/next\.?js|react|python|node\.?js/iu)?.[0]} latest stable version official`
    if (/курс\s+(?:доллар|евро)|exchange rate|бағам/iu.test(prompt)) return "USD KZT EUR exchange rate official"
    return ""
  }
  // eslint-disable-next-line no-control-regex -- Public queries must remove control bytes.
  return prompt.replace(/\[(?:system|assistant|developer|internal)[^\]]*\][\s\S]*$/iu, "").replace(/[\u0000-\u001f<>]/gu, " ").replace(/https?:\/\/\S+/giu, (link) => {
    try { const url = new URL(link); return url.origin + url.pathname } catch { return "" }
  }).replace(/\s+/gu, " ").trim().slice(0, 400)
}
