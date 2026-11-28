import { normalizeWebSearchQuery } from "./web-search-query"

export type LastOccurrence = { subject: string; dateOnly: boolean; opening?: boolean; location?: string }

const russianPast = "(?:был[аои]?|прош[её]л|прошл[аио]|проходил[аои]?|состоял(?:ся|[аио]сь)|проводил(?:ся|[аио]сь))"
const russianLast = "(?:в\\s+)?последн(?:ий|и|ии|ый)\\s+раз"
const englishPast = "(?:held|take place|took place|happen(?:ed)?|occur(?:red)?)"
const kazakhDate = "(?:қашан|қай\\s+(?:күні|жылы))"
const kazakhPast = "(?:өткен|өтті|өткізілді|болды)"
const questionShapes = [
  new RegExp(`^когда\\s+${russianLast}(?:\\s+${russianPast})?\\s+(.+)$`, "iu"),
  new RegExp(`^когда\\s+${russianPast}\\s+${russianLast}\\s+(.+)$`, "iu"),
  new RegExp(`^когда\\s+${russianPast}\\s+последн(?:ий|яя|ее|ие)\\s+(.+)$`, "iu"),
  new RegExp(`^когда\\s+(.+?)(?:\\s+${russianPast})?\\s+${russianLast}(?:\\s+${russianPast})?$`, "iu"),
  new RegExp(`^when\\s+was\\s+the\\s+last\\s+time\\s+(.+?)\\s+(?:(?:was|were)\\s+)?${englishPast}$`, "iu"),
  new RegExp(`^when\\s+was\\s+(?:the\\s+)?(?:last|most recent)\\s+(?!time\\s)(.+?)(?:\\s+(?:${englishPast}|edition))?$`, "iu"),
  new RegExp(`^when\\s+(?:did|was)\\s+(.+?)\\s+(?:last\\s+${englishPast}|${englishPast}\\s+last)$`, "iu"),
  new RegExp(`^(?:${kazakhDate} соңғы рет ${kazakhPast}|соңғы рет ${kazakhDate} ${kazakhPast})\\s+(.+)$`, "iu"),
  new RegExp(`^(.+?)\\s+соңғы рет\\s+(?:${kazakhDate}\\s+${kazakhPast}|${kazakhPast}\\s+${kazakhDate})$`, "iu"),
  new RegExp(`^соңғы рет\\s+(.+?)\\s+${kazakhDate}\\s+${kazakhPast}$`, "iu"),
]

const formatHint = /[,.!?\s]+(?:дай\s+ссылку\p{L}*|укажи\s+источник\p{L}*|со\s+ссылкой|с\s+источником|give\s+(?:a\s+)?source|cite\s+(?:your\s+)?sources?|cite\s+the\s+source|дереккөзд[іе]\s+көрсет|ответь\s+(?:в\s+)?json|answer\s+in\s+json)[.!?\s]*$/iu
const anotherTask = /[.!?]\s+(?=\p{L})|[\s,]+(?:и\s+(?:где|кто|почему|расскажи|перечисли|что)|and\s+(?:where|who|why|what|how|list|explain)|және\s+(?:қайда|кім|неге|қандай)|ответь|answer)(?!\p{L})/iu
const explicitPeriod = /(?<!\p{L})(?:сегодня|вчера|за\s+(?:последн|прошл)\p{L}*|на\s+этой\s+неделе|в\s+текущем\s+(?:году|месяце)|today|yesterday|this\s+(?:week|month|year)|in\s+the\s+(?:past|last)|бүгін|кеше|осы\s+(?:айда|аптада|жылы))(?!\p{L})/iu
const futureQuestion = /(?<!\p{L})(?:будет|будут|пройд[её]т|состоится|следующ\p{L}*|will\s+(?:take place|be held)|upcoming|өтеді|келесі)(?!\p{L})/iu
const noSubject = /^(?:это|оно?|она|они|такое|такое событие|it|this|that|the event|ол|бұл)$/iu
const releaseSubject = /^(?:(?:stable|major|стабильн\p{L}*|основн\p{L}*)\s+)?(?:верс\p{L}*|релиз\p{L}*|обновлени\p{L}*|versions?|releases?|updates?|нұсқа|жаңарту)(?!\p{L})/iu

/** The latest completed occurrence can be years old. A relative lookup is still a web task. */
export function lastOccurrenceRequest(prompt: string): LastOccurrence | undefined {
  if (!/(?:когда|when|қашан|қай\s+(?:күні|жылы))/iu.test(prompt)) return
  const question = normalizeWebSearchQuery(prompt).replace(/^(?:скажи|подскажи|пожалуйста|please)[,\s]+/iu, "").replace(formatHint, "")
  const split = question.search(anotherTask)
  const lookup = (split < 0 ? question : question.slice(0, split)).replace(/[?.!]+$/u, "").trim()
  if (explicitPeriod.test(lookup) || futureQuestion.test(lookup)) return
  const opened = /^когда(?:\s+в\s+([\p{L}-]+(?:\s+[\p{Lu}][\p{L}-]+)?))?\s+(?:в\s+)?последний\s+раз\s+(?:открыли|открылась|открылись|открыли\s+для\s+посетителей|ввели\s+в\s+эксплуатацию)\s+(.+)$/iu.exec(lookup)
  const openedEnglish = /^when\s+(?:did|were|was)\s+(.+?)\s+(?:last\s+open(?:ed)?|last\s+enter\s+service)(?:\s+in\s+(.+?))?$/iu.exec(lookup)
  const openedSubject = (opened?.[2] || openedEnglish?.[1])?.replace(/^(?:нов\p{L}*|new|the)\s+/iu, "").trim()
  if (openedSubject && openedSubject.length <= 120 && !noSubject.test(openedSubject)) {
    return { subject: openedSubject, location: opened?.[1] || openedEnglish?.[2], dateOnly: split < 0 && prompt.length <= 260, opening: true }
  }
  for (const shape of questionShapes) {
    const subject = shape.exec(lookup)?.[1]?.replace(/^[«“"\s]+|[»”"\s]+$/gu, "").trim()
    if (subject && subject.length <= 120 && /\p{L}{2}/u.test(subject) && !noSubject.test(subject) && !releaseSubject.test(subject)) return { subject, dateOnly: split < 0 && prompt.length <= 260 }
  }
}

const descriptors = /^(?:форум(?:а)?|конференци[яию]|фестивал[ья]|саммит(?:а)?|выставк[аиу]|мероприяти[ея]|forum|conference|festival|summit|exhibition|event|the|форумы|фестивалі|конференциясы)\s+/iu

/** Preserve the order and boundaries of the name. Ignore punctuation such as a brand's ampersand. */
export function occurrenceSubjectPattern(subject: string, opening = false): RegExp {
  const name = subject.replace(descriptors, "").replace(/ё/giu, "е")
  const words = name.match(/[\p{L}\p{N}]+/gu) || []
  const term = words.length > 1 && /^(?:ai|ии|ж[иі])$/iu.test(words[0] || "") ? words.slice(1) : words
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${term.map(word => opening && /^станци/iu.test(word) ? "станци\\p{L}*" : word).join(opening ? "(?:[^\\p{L}\\p{N}]+(?:нов\\p{L}*[^\\p{L}\\p{N}]+)?)" : "[^\\p{L}\\p{N}]+") || "(?!)"})(?![\\p{L}\\p{N}])`, "iu")
}
