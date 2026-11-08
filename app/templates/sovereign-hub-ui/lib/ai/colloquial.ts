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
  [/(?<!\p{L})(?:скажи|подскажи|слушай|а\s+вот)\s+/giu, ""],
]

/** «а щя скоко оценивается …» → «сейчас сколько оценивается …». */
export function normalizeColloquial(input: string): string {
  let text = String(input || "")
  for (const [pattern, replacement] of SLANG) text = text.replace(pattern, replacement)
  // A leading «а», «и», «ну», «так» opens a new question as often as it continues one.
  return text.replace(/^(?:\s*(?:а|и|ну|так|ок|окей|да)(?:[\s,]+|$))+/iu, "").replace(/\s+/gu, " ").trim()
}
