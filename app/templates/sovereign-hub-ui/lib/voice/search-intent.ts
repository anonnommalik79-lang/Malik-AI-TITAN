import { classifyFreshness } from "../ai/freshness-intent"

/** Shared, browser-safe spoken search policy. No provider code or secrets. */
export type VoiceSearchReason = "off" | "asked" | "fresh"

const OPEN = "(^|[^\\p{L}\\p{N}])"
const CLOSE = "(?![\\p{L}\\p{N}])"
const word = (words: string) => new RegExp(`${OPEN}(?:${words})${CLOSE}`, "iu")

/** "Don't look it up" - always wins. */
const REFUSED = word(
  "не\\s+(?:ищи|гугли|загугливай|смотри\\s+в\\s+интернете)|без\\s+(?:поиска|интернета|гугла)|" +
  "do\\s+not\\s+(?:search|browse|look\\s+it\\s+up)|don'?t\\s+(?:search|browse|google)|" +
  "without\\s+(?:the\\s+)?(?:web|search|internet)|іздеме|іздеудің\\s+қажеті\\s+жоқ",
)

/** Work the model does by itself; a web search would only add noise. */
const SELF_CONTAINED = word(
  "переведи|перевод|напиши\\s+(?:стих|рассказ|песню|письмо|код)|сочини|придумай|" +
  "посчитай|вычисли|реши\\s+(?:пример|уравнение|задачу)|найди\\s+(?:ошибку|баг|сумму|корень)|" +
  "translate|write\\s+(?:a\\s+)?(?:poem|story|song|letter|code)|calculate|solve|" +
  "find\\s+(?:a|the)\\s+(?:bug|sum|error)|аудар|өлең\\s+жаз",
)

/**
 * An explicit instruction to look something up.
 *
 * Russian verbs inflect, so every stem here ends in \p{L}* - the tests caught
 * "загугли" failing against a bare "загугл", which the closing boundary
 * rejected because the next character was still a letter.
 */
const ASKED = word(
  "по[ий]щ\\p{L}*|поиска\\p{L}*|загугл\\p{L}*|нагугл\\p{L}*|гугл\\p{L}*|" +
  "найди\\s+(?!ошибку|баг|сумму|корень)(?:в\\s+(?:интернете|сети|гугле)|информац\\p{L}*|сведен\\p{L}*|новост\\p{L}*|источник\\p{L}*|мне\\s+\\p{L}+)|поиск\\s+(?:в|по)|" +
  "провер\\p{L}*\\s+(?:онлайн|в\\s+сети|в\\s+интернете)|посмотри\\s+в\\s+интернете|" +
  "google|browse|search\\p{L}*|look\\s+(?:it\\s+)?up|" +
  "ізде\\p{L}*|интернеттен\\s+(?:тап|қара)",
)

/** Topics whose answer is wrong the moment it is stale. */
const VOLATILE = word(
  // weather
  "погод[ауые]|прогноз\\s+погоды|температур[аыу]\\s+(?:на\\s+улице|сейчас|сегодня)|ауа\\s+райы|weather|forecast|" +
  // money
  "курс\\s+(?:доллара|евро|рубля|тенге|валют)|сколько\\s+стоит|цен[аыу]\\s+на|подорожал|" +
  "биткоин\\p{L}*|биткойн\\p{L}*|крипт\\p{L}*|акци[ияй]\\s+(?:компании)?|бирж[аеи]|" +
  "bitcoin|crypto|stock\\s+price|exchange\\s+rate|how\\s+much\\s+(?:is|does|costs?)|" +
  "бағас[ыа]|валюта\\s+бағамы|" +
  // news and events
  "новост\\p{L}*|что\\s+(?:случилось|происходит|нового)|последние\\s+событ\\p{L}*|жаңалық\\p{L}*|" +
  "news|what\\s+happened|breaking|" +
  // standings, scores, releases
  "счёт\\s+матча|счет\\s+матча|результат\\s+матча|кто\\s+выиграл|кто\\s+победил|турнирн\\p{L}*|" +
  "score|who\\s+won|standings|" +
  "вышел\\s+ли|когда\\s+выйдет|релиз|when\\s+(?:is|does)\\s+.{0,20}(?:release|come\\s+out)|" +
  // opening hours, schedules, availability
  "расписание|во\\s+сколько\\s+(?:открыва|закрыва|начина)|работает\\s+ли|открыт[оы]\\s+ли|" +
  "opening\\s+hours|is\\s+.{0,20}\\s+open|" +
  // who currently holds a role
  "кто\\s+(?:сейчас|сегодня|нынешн\\p{L}*|действующ\\p{L}*)|нынешн\\p{L}*\\s+президент|" +
  "who\\s+is\\s+(?:the\\s+)?(?:current|president|ceo)",
)

/** Words that pin a question to the present moment. */
const TIME_WORDS = word(
  "сейчас|сегодня|вчера|завтра|на\\s+этой\\s+неделе|в\\s+этом\\s+(?:году|месяце)|" +
  "последн\\p{L}*|свеж\\p{L}*|актуальн\\p{L}*|на\\s+данный\\s+момент|нынешн\\p{L}*|" +
  "қазір|бүгін|кеше|ертең|соңғы|" +
  "now|today|yesterday|tomorrow|this\\s+(?:week|month|year)|latest|current|right\\s+now|recent",
)

/** Anything that makes the utterance a question rather than a statement. */
const QUESTION = new RegExp(
  "\\?|" +
  `${OPEN}(?:кто|что|где|когда|скольк\\p{L}*|как(?:ой|ая|ое|ие|ов)?|почему|зачем|` +
  `кім|не|қайда|қашан|қанша|қандай|неше|` +
  `who|what|where|when|why|how|which|is|are|does|do|did|can)${CLOSE}`,
  "iu",
)

export function voiceSearchReason(text: string): VoiceSearchReason {
  const value = String(text || "")
  if (!value.trim()) return "off"
  if (REFUSED.test(value)) return "off"
  if (ASKED.test(value)) return "asked"
  if (classifyFreshness(value).needsSearch) return "fresh"
  if (SELF_CONTAINED.test(value)) return "off"
  if (VOLATILE.test(value)) return "fresh"
  // A time word alone is not enough - "сегодня я устал" is not a search.
  if (TIME_WORDS.test(value) && QUESTION.test(value)) return "fresh"
  return "off"
}

/** Kept for callers that only need the yes/no. */
export function shouldSearchVoice(text: string) {
  return voiceSearchReason(text) !== "off"
}
