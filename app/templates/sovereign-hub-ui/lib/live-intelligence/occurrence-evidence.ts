import { occurrenceSubjectPattern } from "../ai/last-occurrence"

export type OccurrenceEvidence = { start: string; end: string; excerpt: string }

const monthNames = [
  "январ[ьяе]|қаңтар(?:да)?|jan(?:uary)?", "феврал[ьяе]|ақпан(?:да)?|feb(?:ruary)?", "март[ае]?|наурыз(?:да)?|mar(?:ch)?",
  "апрел[ьяе]|сәуір(?:де)?|apr(?:il)?", "ма[йея]|мамыр(?:да)?|may", "июн[ьяе]|маусым(?:да)?|jun(?:e)?",
  "июл[ьяе]|шілде(?:де)?|jul(?:y)?", "август[ае]?|тамыз(?:да)?|aug(?:ust)?", "сентябр[ьяе]|қыркүйек(?:те)?|sep(?:t(?:ember)?)?",
  "октябр[ьяе]|қазан(?:да)?|oct(?:ober)?", "ноябр[ьяе]|қараша(?:да)?|nov(?:ember)?", "декабр[ьяе]|желтоқсан(?:да)?|dec(?:ember)?",
]
const months = `(?:${monthNames.join("|")})`
const monthLookup = monthNames.map(name => new RegExp(`^(?:${name})$`, "iu"))
const day = "(?:0?[1-9]|[12]\\d|3[01])"
const year = "(?:19|20)\\d{2}"
const dateWord = `${day}(?:st|nd|rd|th)?`
const range = "(?:-|–|—|по|to|through|until)"
const datePatterns = [
  new RegExp(`(?<![\\d-])(?<startIso>${year}-\\d{2}-\\d{2})(?:\\s*${range}\\s*(?<endIso>${year}-\\d{2}-\\d{2}))?(?![\\d-])`, "giu"),
  new RegExp(`(?<![\\d-])(?:(?<beforeYear>${year})\\s+(?:жыл(?:ғы|дың)?\\s+)?)?(?:(?<startDay>${dateWord})(?:\\s+(?<startMonth>${months})\\.?)?\\s*${range}\\s*)?(?<endDay>${dateWord})\\s+(?<endMonth>${months})(?:\\.?[,]?\\s+(?<afterYear>${year}))?(?![\\p{L}\\d])`, "giu"),
  new RegExp(`(?<![\\p{L}\\d])(?<startMonth>${months})\\.?\\s+(?<startDay>${dateWord})(?:\\s*${range}\\s*(?:(?<endMonth>${months})\\.?\\s+)?(?<endDay>${dateWord}))?(?:,?\\s+(?<afterYear>${year}))?(?![\\p{L}\\d-])`, "giu"),
]
const completion = /(?<!\p{L})(?:прош(?:[её]л|л[аио])|состоял(?:ся|[аио]сь)|проходил[аои]?|был[аои]?\s+провед[её]н[аои]?|(?:was|were)\s+(?:held|hosted)|took\s+place|(?:болып\s+)?өтті|өткізілді|ұйымдастырылды)(?!\p{L})/giu
const plannedOrNegated = /(?<!\p{L})(?:не\s+(?:прош|состоя|провод|проход|был)|пройд[её]т|состоится|планиру|запланир|отмен[её]н|перенес[её]н|wasn['’]t|weren['’]t|didn['’]t|did\s+not|(?:was|were)\s+not|will\s+(?:be\s+held|take\s+place)|scheduled|postponed|cancell?ed|жоспарлан|өтпеді|өткізілмеді)/iu
const edition = /^(?:[\s(–—,-]*)(?:edition\s+|форум\s+)?((?:19|20)\d{2})(?!\d)/iu
const descriptor = "(?:международн\\p{L}*|ежегодн\\p{L}*|технологическ\\p{L}*|профессиональн\\p{L}*|форум\\p{L}*|фестивал\\p{L}*|саммит\\p{L}*|конференци\\p{L}*|мероприяти\\p{L}*|конкурс\\p{L}*|выставк\\p{L}*|чемпионат\\p{L}*|финал\\p{L}*|the|a|an|edition|annual|international|technology|conference|summit|forum|festival|event|exhibition|final|tournament|championship|халықаралық|форумы|конференциясы|іс-шара)"
const subjectLink = new RegExp(`^(?:[\\s(),–—«»“”"-]|${year}(?!\\d)|${descriptor}(?!\\p{L}))*$`, "iu")
const dateLink = /^(?:[\s,]|(?:в|с|по|на|года?|жыл(?:ы|ғы)?|on|in|from|between)(?!\p{L}))*$/iu
const kazakhDateRange = /^\s*аралығында(?:\s+[\p{L}\p{N}'’.-]{1,32}){0,7}\s*$/iu
const reference = /^(?:он|она|оно|они|форум|конференция|мероприятие|фестиваль|саммит|it|the (?:forum|conference|event|festival|summit|tournament|championship)|ол|форум|іс-шара)\s*$/iu

function normalized(text: string) {
  return text.normalize("NFKC").replace(/ё/giu, "е").replace(/&(?:n|m)dash;|&#(?:8211|8212);/giu, "–").replace(/&amp;/giu, "&").replace(/[^\S\r\n]+/gu, " ")
}

function validDay(value: string) {
  const time = Date.parse(value + "T00:00:00Z")
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

function calendarDay(year: number, monthName: string, dayText: string) {
  const month = monthLookup.findIndex(pattern => pattern.test(monthName)) + 1
  return `${year}-${String(month).padStart(2, "0")}-${String(parseInt(dayText, 10)).padStart(2, "0")}`
}

type DateMatch = Omit<OccurrenceEvidence, "excerpt"> & { index: number; length: number }

function readDates(text: string, fallbackYear?: string, statedEdition?: string): DateMatch[] {
  const matches: DateMatch[] = []
  for (const pattern of datePatterns) for (const match of text.matchAll(pattern)) {
    const { startIso, endIso, startDay, endDay, startMonth, endMonth, beforeYear, afterYear } = match.groups || {}
    const dateYear = Number(afterYear || beforeYear || fallbackYear)
    if (!startIso && !dateYear) continue
    // A date in a different year than the explicitly named edition needs interpretation.
    if (statedEdition && (startIso ? startIso.slice(0, 4) !== statedEdition : dateYear !== Number(statedEdition))) continue
    const start = startIso || calendarDay(dateYear, startMonth || endMonth, startDay || endDay)
    const end = endIso || (startIso ? start : calendarDay(dateYear, endMonth || startMonth, endDay || startDay))
    if (validDay(start) && validDay(end) && start <= end) matches.push({ start, end, index: match.index, length: match[0].length })
  }
  return matches.sort((a, b) => a.index - b.index || b.length - a.length)
}

/** Tie a date in a completed-event statement to the requested occurrence. Publication dates are never used here. */
export function findOccurrence(subject: string, title: string, body: string, asOf: string): OccurrenceEvidence | undefined {
  const name = occurrenceSubjectPattern(subject)
  const sentences = normalized(body.slice(0, 18_000)).split(/(?<=[.!?])\s+(?=[\p{Lu}\d])|\r?\n/gu)
  const heading = normalized(title)
  const headingName = name.exec(heading)
  const headingYear = headingName && edition.exec(heading.slice(headingName.index + headingName[0].length))?.[1]
  let previousYear: string | undefined
  let previousNamed = false
  let previousClause = ""
  let latest: OccurrenceEvidence | undefined
  for (const [index, sentence] of sentences.entries()) {
    const clause = sentence.trim()
    const subjectHit = name.exec(clause)
    const subjectEnd = subjectHit && subjectHit.index + subjectHit[0].length
    const subjectYear = subjectEnd == null ? undefined : edition.exec(clause.slice(subjectEnd))?.[1]
    const anaphora = previousNamed || Boolean(index < 2 && headingYear)
    const linkedYear = subjectYear || (anaphora ? previousYear : undefined) || headingYear || undefined
    const earlier = previousNamed ? previousClause : ""
    previousYear = subjectYear
    previousNamed = Boolean(subjectHit)
    previousClause = clause
    if (!clause || plannedOrNegated.test(clause)) continue
    const verbs = [...clause.matchAll(completion)]
    if (!verbs.length) continue
    const dates = readDates(clause, linkedYear, subjectYear)
    for (const verb of verbs) {
      const after = verb.index + verb[0].length
      const nameBeforeVerb = subjectEnd != null && subjectEnd <= verb.index && verb.index - subjectEnd <= 75
      const nameAfterVerb = subjectHit && subjectHit.index >= after && subjectHit.index - after <= 75 && subjectLink.test(clause.slice(after, subjectHit.index))
      const between = nameBeforeVerb ? dates.find(date => {
        const end = date.index + date.length
        if (date.index < subjectEnd || end > verb.index) return false
        const beforeDate = clause.slice(subjectEnd, date.index), afterDate = clause.slice(end, verb.index)
        return (dateLink.test(beforeDate) || subjectLink.test(beforeDate)) && (dateLink.test(afterDate) || kazakhDateRange.test(afterDate))
      }) : undefined
      const linked = nameBeforeVerb && subjectLink.test(clause.slice(subjectEnd, verb.index))
      if (!linked && !nameAfterVerb && !between && !(anaphora && !subjectHit && reference.test(clause.slice(0, verb.index)))) continue
      // Dates after the completed action take priority. A dateline or deadline
      // elsewhere in the article cannot stand in for the event date.
      const boundary = nameAfterVerb && subjectEnd != null ? subjectEnd : after
      const date = between || dates.find(date => date.index >= boundary && date.index - boundary <= 65)
        || (linked && subjectHit ? dates.find(date => date.index + date.length <= subjectHit.index &&
          subjectHit.index - date.index - date.length <= 60 && subjectLink.test(clause.slice(date.index + date.length, subjectHit.index))) : undefined)
      if (!date || date.end > asOf) continue
      const { start, end } = date
      if (!latest || end > latest.end || end === latest.end && start < latest.start) {
        const from = Math.max(0, Math.min(verb.index, date.index, subjectHit?.index ?? verb.index) - 30)
        const excerpt = clause.slice(from, Math.min(from + 225, Math.max(date.index + date.length + 64, subjectEnd || 0, after)))
        const antecedent = earlier && !subjectHit ? earlier.slice(-120).replace(/[.!?]+$/u, "") + ". " : ""
        latest = { start, end, excerpt: antecedent + excerpt }
      }
    }
  }
  return latest
}
