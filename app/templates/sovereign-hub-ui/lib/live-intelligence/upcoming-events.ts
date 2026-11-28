import type { FreshnessIntent } from "../ai/freshness-intent"
import type { MalikWebSource } from "../ai/web-research-types"
import { explicitCalendarDates } from "./occurrence-evidence"
import { fetchResearchResponse } from "../malik-research/bounded-fetch"
import { stripHtml } from "../malik-research/utils"

const FUTURE = /(?:ближайш\p{L}*|предстоящ\p{L}*|следующ\p{L}*|когда\s+будет|\b(?:upcoming|next|when will)\b|келесі|қашан\s+болады)/iu
const EVENT = /(?:затмени|метеорн\p{L}*\s+поток|концерт|матч|фестивал|форум|выставк|турнир|мероприяти|заседани|запуск|конференц|\b(?:eclipse|meteor shower|match|concert|festival|conference|event|meeting|launch|tournament)\b|тұтылу|іс-шара)/iu
export function asksUpcomingEvent(prompt: string) {
  return FUTURE.test(prompt) && EVENT.test(prompt)
    && /(?:когда|дата|дату|расписани|во\s+сколько|где\s+пройд|\b(?:when|date|schedule|what time|where will)\b|қашан|қай\s+күні)/iu.test(prompt)
    && !/(?:последний\s+(?:раз|матч)|прошл\p{L}*\s+и\s+следующ|previous and next)/iu.test(prompt)
}
export function upcomingDates(source: Pick<MalikWebSource, "title" | "snippet">, asOf: string) {
  return explicitCalendarDates(`${source.title}\n${source.snippet || ""}`).filter(date => date >= asOf)
}

export function scheduleTimes(text: string) {
  return [...text.matchAll(/(?<![\d:])([0-2]?\d):([0-5]\d)(?:\s*([ap])\.?m\.?)?(?![\d:])/giu)].flatMap(([, hour, minute, meridiem]) => {
    const n = Number(hour)
    if (meridiem ? n < 1 || n > 12 : n >= 24) return []
    const local = meridiem ? n % 12 + (meridiem.toLowerCase() === "p" ? 12 : 0) : n
    return [String(local).padStart(2, "0") + ":" + minute]
  })
}

const cities = [
  { name: "Almaty", ru: "Алматы", slug: "almaty", wording: /Алмат[ыа]|Алма-Ат\p{L}*|\bAlmaty\b/iu },
  { name: "Astana", ru: "Астане", slug: "astana", wording: /Астан[ауыые]|\bAstana\b/iu },
  { name: "Shymkent", ru: "Шымкенте", slug: "shymkent", wording: /Шымкент\p{L}*|\bShymkent\b/iu },
] as const

export function eclipseCity(question: string) {
  if (!asksUpcomingEvent(question) || !/(?:полн\p{L}*\s+лунн\p{L}*\s+затмени|лунн\p{L}*\s+полн\p{L}*\s+затмени|total\s+lunar\s+eclipse|Айдың толық тұтылуы)/iu.test(question)) return
  const matching = cities.filter(city => city.wording.test(question))
  return matching.length === 1 ? matching[0] : undefined
}

/** The location calendar includes both global and local rows. Use only links that show totality at this location. */
export function totalLunarDates(html: string, asOf: string) {
  const eligible = new Set<string>()
  for (const [, iso, label] of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']\?iso=(\d{8})["'][^>]*>([\s\S]*?)<\/a>/giu)) {
    const date = `${iso.slice(0, 4)}-${iso.slice(4, 6)}-${iso.slice(6, 8)}`
    if (date < asOf || !explicitCalendarDates(date).includes(date) || !/\btotal lunar eclipse\b/iu.test(stripHtml(label))) continue
    eligible.add(date)
  }
  return [...eligible].sort()
}

export function localLunarMaximum(html: string, date: string, city: string) {
  const rows = [...html.matchAll(/<tr\b[^>]*>\s*<th[^>]*>\s*(Local Type|Maximum):\s*<\/th>[\s\S]*?<\/tr>/giu)]
  const type = rows.find(row => row[1].toLowerCase() === "local type")
  const max = rows.find(row => row[1].toLowerCase() === "maximum")
  if (!type || !max) return
  const typeText = stripHtml(type[0])
  const maxText = stripHtml(max[0])
  if (!/Total Lunar Eclipse\s*,\s*in\s+/iu.test(typeText) || !typeText.toLowerCase().endsWith("in " + city.toLowerCase())) return
  if (!explicitCalendarDates(maxText).includes(date)) return
  return scheduleTimes(maxText)[0]
}

export async function fetchLocalEclipse(question: string, intent: FreshnessIntent, signal: AbortSignal): Promise<MalikWebSource[]> {
  const city = eclipseCity(question)
  if (!city) return []
  const url = `https://www.timeanddate.com/eclipse/in/kazakstan/${city.slug}`
  const get = async (target: string) => {
    const response = await fetchResearchResponse(target, { signal, redirect: "error", cache: "no-store" }, 4200)
    return response.ok ? response.text() : ""
  }
  try {
    const calendar = await get(url)
    for (const date of totalLunarDates(calendar, intent.localDate).slice(0, 2)) {
      const detailUrl = url + "?iso=" + date.replace(/-/gu, "")
      const detail = await get(detailUrl)
      const peak = localLunarMaximum(detail, date, city.name)
      if (!peak) continue
      const checked = new Date(intent.checkedAt)
      const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Almaty", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(checked)
      const dateInCity = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).format(checked)
      if (date < dateInCity || date === dateInCity && peak < localTime) continue
      return [{ title: `Total Lunar Eclipse in ${city.name} · ${date}`, snippet: `Totality visible in ${city.name}. ${date}. Local maximum: ${peak} (Asia/Almaty).`, url: detailUrl, domain: "timeanddate.com", provider: "local-eclipse-calendar", checkedAt: intent.checkedAt, readAt: intent.checkedAt },
        { title: `Eclipses visible in ${city.name}`, snippet: `Next total lunar eclipse visible in ${city.name}: ${date}.`, url, domain: "timeanddate.com", provider: "local-eclipse-calendar", checkedAt: intent.checkedAt, readAt: intent.checkedAt }]
    }
  } catch { signal.throwIfAborted() }
  return []
}

export function eclipseReply(question: string, sources: readonly MalikWebSource[], intent: FreshnessIntent) {
  const city = eclipseCity(question)
  if (!city || intent.language !== "ru" || question.length > 240 || /(?:сравни|почему|объясни|история|все фазы|все этапы)/iu.test(question)) return
  const index = sources.findIndex(source => source.domain === "timeanddate.com" && source.provider === "local-eclipse-calendar" && source.readAt && /[?&]iso=\d{8}/u.test(source.url))
  if (index < 0) return
  const source = sources[index]
  const day = upcomingDates(source, intent.localDate)[0]
  const time = scheduleTimes(source.snippet || "")[0]
  if (!day || !time) return
  const date = new Intl.DateTimeFormat("ru", { dateStyle: "long", timeZone: "UTC" }).format(new Date(day + "T00:00:00Z"))
  return `В ${city.ru} ближайшее полное лунное затмение можно будет увидеть **${date.replace(/\s+г\.$/u, "")} года**. Максимум — **${time} по местному времени (UTC+5)** [${index + 1}].`
}
