/**
 * The shape a question asks for, independent of its length.
 *
 * Shared by the answer prompt (how to write it) and the web policy (whether to
 * look it up): a short question about a whole subject or between named
 * contenders deserves both a full answer and current sources.
 */

function lowerOf(prompt: string) {
  return String(prompt || "").trim().toLowerCase()
}

/**
 * «скажи про второго президента», «кто такой Илон Маск», «tell me about
 * Kazakhstan». Not «что такое рендер» - a definition stays a definition - and
 * not «расскажи о себе», which is about Malik AI.
 */
export function asksSubjectOverview(prompt: string): boolean {
  const lower = lowerOf(prompt)
  if (/(?:про|о|обо)\s+(?:себя|себе|тебя|тебе|вас|вам)(?:[\s,.!?]|$)|about (?:you|yourself)/u.test(lower)) return false
  return /(?:^|[\s,.!?])(?:расскажи|скажи|напиши|поведай|опиши|дай\s+(?:инфу|информацию|справку))\s+(?:мне\s+|нам\s+|пожалуйста\s+)?(?:про|о|об|обо)\s+\p{L}|(?:^|\s)кто\s+(?:такой|такая|такие|был|была|были|является)(?:[\s,.!?]|$)|биограф|(?:^|\s)истори[яюи]\s+(?!болезн|браузер|чата|сообщен|переписк|заказ|изменен)\p{L}|(?:^|\s)обзор|tell me about|who (?:is|was|are|were)\s|overview of|history of|biography|туралы|кім\s+болған/u.test(lower)
}

/** «сравни X и Y», «X vs Y», «что лучше X или Y» - but not «как лучше: позвонить или написать». */
export function asksHeadToHead(prompt: string): boolean {
  const lower = lowerOf(prompt)
  const comparesOptions = /сравн|разниц|лучше|versus|\bvs\b|compare|отлич|против|круче|сильнее/u.test(lower)
  const namesContenders = /\svs\.?\s|\sversus\s|\sпротив\s|сравн\p{L}*\s+.+\s(?:и|с|со|and|with)\s+\S|разниц\p{L}*\s+между|compare\s+.+\s(?:and|with|to)\s+\S|\S\s+или\s+\S|\S\s+or\s+\S/u.test(lower)
  return comparesOptions && namesContenders && !/^(?:как|когда|где)\s+лучше|how (?:should|to|do) /u.test(lower)
}

/** «какой ноутбук купить до 400 тысяч», «best phone to buy 2026»: prices and models change. */
export function asksPurchaseAdvice(prompt: string): boolean {
  const lower = lowerOf(prompt)
  return /(?:какой|какую|какое|какие|что)\s+(?:\p{L}+\s+){0,3}(?:купить|выбрать|взять|брать)(?![\p{L}])|(?:посоветуй|подскажи|порекомендуй)\s+(?:\p{L}+\s+){0,2}(?:ноутбук|телефон|смартфон|наушник|планшет|машин|авто|монитор|видеокарт|процессор|камер|часы|телевизор|пылесос)|(?:best|which)\s+(?:\w+\s+){0,3}(?:to\s+buy|should\s+i\s+buy)/u.test(lower)
}
