export type WebSearchOptions = {
  research?: boolean
  disableResearch?: boolean
  forceResearch?: boolean
}

/** Pure intent check: no classifier request, keys, or token consumption. */
export function shouldUseWeb(prompt: string, options: WebSearchOptions = {}): boolean {
  const text = prompt.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim()
  if (!text || options.disableResearch || options.research === false) return false
  if (/(?:не\s+(?:ищи|гугли|загугливай)|без\s+(?:поиска|интернета|гугла)|do not (?:search|browse)|don't (?:search|browse)|without (?:web|search|internet))/i.test(text)) return false

  // An explicit search request always wins.
  if (/(?:по[ий]щ[иь]|поиск\s+(?:в|по)|загугл|гугл[еи]|найди\s+(?:в\s+(?:сети|интернете)|через\s+веб)|проверь\s+(?:онлайн|в\s+сети)|\b(?:google|browse|search the web|look up|search online)\b)/i.test(text)) return true

  // Coding/writing/calculation requests must stay on the model path even when
  // the dashboard's generic "web & sources" toggle is enabled. This prevents
  // irrelevant sources from bloating model context and breaking free-tier TPM.
  if (/^(?:(?:пожалуйста|можешь|давай)\s+)?(?:переведи|перевод|перепиши|сократи|исправь|напиши|сочини|придумай|создай|сделай|почини|добавь|измени|сверстай|посчитай|реши|найди\s+(?:ошибку|баг|сумму|корень)|translate\b|rewrite\b|summari[sz]e\b|write\b|create\b|build\b|implement\b|fix\b|calculate\b|debug\b)/i.test(text)) return false
  if (/(?:\bhtml\b|\bcss\b|javascript|typescript|python|react|next\.?js|node\.?js|\bsql\b|index\.html|localstorage|код|скрипт|компонент|функц|api\b)/i.test(text)) return false
  if (/(?:кто\s+ты|что\s+ты\s+умеешь|что\s+умеешь|\bwho are you\b|\bwhat can you do\b)/i.test(text)) return false

  if (options.forceResearch) return true

  if (/(?:найди|найти|ищи|ищем|источники|ссылки\s+на|проведи\s+(?:глубокое\s+)?исследование|\b(?:search|sources|research)\b)/i.test(text)) return true
  if (/(?:что\s+такое|кто\s+так(?:ой|ая|ие)|\bwhat (?:is|are)\b|\bwho is\b|деген\s+не)/i.test(text)) return true

  const changingFact = /(?:погод[ауы]|прогноз\s+погоды|курс\s+(?:валют|доллар|евро|тенге)|цен[ауы]\s+на|сколько\s+стоит|расписани[ея]|последни[ея]\s+(?:новости|версии)|свежие\s+новости|\b(?:weather|exchange rate|stock price|latest news|release date)\b)/i.test(text)
  const currentQuestion = /(?:кто|како[йеяг]|какие|когда|где|сколько|\b(?:who|what|when|where|how much)\b)/i.test(text)
    && /(?:сейчас|сегодня|актуальн|последн|президент|министр|\b(?:current|today|latest|president|ceo)\b)/i.test(text)
  return changingFact || currentQuestion
}
