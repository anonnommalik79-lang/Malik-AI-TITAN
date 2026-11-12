/**
 * People type the way they talk: «а щя скоко оценивается …». The words that
 * decide whether an answer needs today's facts must still be recognised, so
 * the classifiers read this normalised copy. The person's own text is never
 * changed or shown in this form.
 */

const SLANG: Array<[RegExp, string]> = [
  [/(?<!\p{L})(?:щя|щяс|ща|щас|счас|сча|счяс|сечас|ceйчас)(?!\p{L})/giu, "сейчас"],
  [/(?<!\p{L})(?:скоко|скока|скок|скоклько|сколко|скольк)(?!\p{L})/giu, "сколько"],
  [/(?<!\p{L})(?:чо|чё|шо|што|чта)(?!\p{L})/giu, "что"],
  [/(?<!\p{L})(?:ваще|вапще|вопще|вообше)(?!\p{L})/giu, "вообще"],
  [/(?<!\p{L})(?:седня|сення|сёдня|седня)(?!\p{L})/giu, "сегодня"],
  [/(?<!\p{L})(?:плиз|плз|пж|пжлст)(?!\p{L})/giu, "пожалуйста"],
  [/(?<!\p{L})(?:када|кода)(?!\p{L})/giu, "когда"],
  [/(?<!\p{L})(?:слушай|а\s+вот)\s+/giu, ""],
]

/** «а щя скоко оценивается …» → «сейчас сколько оценивается …». */
export function normalizeColloquial(input: string): string {
  let text = String(input || "")
  for (const [pattern, replacement] of SLANG) text = text.replace(pattern, replacement)
  // A leading «а», «и», «ну», «так» opens a new question as often as it continues one.
  return text.replace(/^(?:\s*(?:а|и|ну|так|ок|окей|да)(?:[\s,]+|$))+/iu, "").replace(/\s+/gu, " ").trim()
}

// The words around a subject in a question; they are never part of a name.
const QUESTION_WORDS = /(?<!\p{L})(?:сейчас|сегодня|щас|га|же|ли|вообще|сколько|оценива\p{L}*|оценк[аиуе]|стоит|стоят|стоимост\p{L}*|капитализац\p{L}*|чем|занима\p{L}*|находится|расположен\p{L}*|где|когда|какая|какой|какое|какие|каков\p{L}*|кто|что|это|такое|такой|такая|компани\p{L}*|стартап\p{L}*|про|о|об|в|на|у)(?!\p{L})/giu

const BRAND_LETTERS: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" }

/**
 * «хиггсфиелд ии» is Higgsfield AI typed in Cyrillic. Search engines, source
 * ranking and photo catalogues all know the brand by its Latin name.
 */
export function latinBrandName(text: string): string | null {
  const stripped = normalizeColloquial(String(text || "")).replace(QUESTION_WORDS, " ").replace(/[?!.,;:«»"]/gu, " ").replace(/\s+/gu, " ").trim()
  const match = /(?<!\p{L})(\p{Script=Cyrillic}{3,})\s+(?:ии|аи)(?!\p{L})/iu.exec(stripped)
  if (!match) return null
  const latin = match[1].toLowerCase().replace(/\p{Script=Cyrillic}/gu, (letter) => BRAND_LETTERS[letter] ?? letter)
  return latin ? `${latin.charAt(0).toUpperCase()}${latin.slice(1)} AI` : null
}

/** The text with the brand's Latin name added, so every later step can match it. */
export function withLatinBrand(text: string): string {
  const brand = latinBrandName(text)
  return brand && !String(text).toLowerCase().includes(brand.toLowerCase()) ? `${text} ${brand}` : text
}
