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
  if (options.forceResearch) return true

  // A user's explicit web request takes priority over a writing/coding task.
  if (/(?:по[ий]щ[иь]|поиск\s+(?:в|по)|загугл|гугл[еи]|найди\s+(?:в\s+(?:сети|интернете)|через\s+веб)|проверь\s+(?:онлайн|в\s+сети)|\b(?:google|browse|search the web|look up|search online)\b)/i.test(text)) return true

  // Quotes, code, calculations, personal discussion and rewriting don't need a search.
  if (/^(?:(?:пожалуйста|можешь|давай)\s+)?(?:переведи|перевод|перепиши|сократи|исправь|напиши|сочини|придумай|создай|посчитай|реши|найди\s+(?:ошибку|баг|сумму|корень)|translate\b|rewrite\b|summari[sz]e\b|write\b|calculate\b|debug\b)/i.test(text)) return false
  if (/(?:кто\s+ты|что\s+ты\s+умеешь|что\s+умеешь|\bwho are you\b|\bwhat can you do\b)/i.test(text)) return false

  if (/(?:найди|найти|ищи|ищем|источники|ссылки\s+на|проведи\s+(?:глубокое\s+)?исследование|\b(?:search|sources|research)\b)/i.test(text)) return true
  if (/(?:что\s+такое|кто\s+так(?:ой|ая|ие)|\bwhat (?:is|are)\b|\bwho is\b|деген\s+не)/i.test(text)) return true

  const changingFact = /(?:погод[ауы]|прогноз\s+погоды|курс\s+(?:валют|доллар|евро|тенге)|цен[ауы]\s+на|сколько\s+стоит|расписани[ея]|последни[ея]\s+(?:новости|версии)|свежие\s+новости|\b(?:weather|exchange rate|stock price|latest news|release date)\b)/i.test(text)
  const currentQuestion = /(?:кто|како[йеяг]|какие|когда|где|сколько|\b(?:who|what|when|where|how much)\b)/i.test(text)
    && /(?:сейчас|сегодня|актуальн|последн|президент|министр|\b(?:current|today|latest|president|ceo)\b)/i.test(text)
  return changingFact || currentQuestion
}
