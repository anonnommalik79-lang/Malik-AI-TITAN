import type { MalikWebSource } from "../ai/web-research-types"
import { explicitCalendarDates } from "./occurrence-evidence"

const latestMatch = /(?:последн\p{L}*\s+(?:официальн\p{L}*\s+)?(?:матч\p{L}*|игр\p{L}*)|\b(?:last|latest|most recent)\s+(?:league\s+)?(?:match|game)\b|соңғы\s+матч)/iu

export function asksLatestMatch(question: string) {
  return latestMatch.test(question)
}

export function kazakhstanLeagueMatch(question: string) {
  if (!latestMatch.test(question) || /\b(?:19|20)\d{2}\b/u.test(question) || !/(?:чемпионат\p{L}*\s+Казахстана|казахстанск\p{L}*\s+премьер|(?:^|\s)КПЛ(?=$|[\s?!,.])|Kazakhstan Premier League|Қазақстан Премьер)/iu.test(question)
    || /(?:Кайрат[- ]Жастар|молодёж|футзал|женск|резерв|кубок|суперкубок|women|Futsal|youth)/iu.test(question)) return
  const team = /(?:матч\p{L}*|игр\p{L}*)\s+(?:ФК\s+)?[«“"']([^»”"']{2,55})[»”"']/iu.exec(question)?.[1]
    || /(?:матч\p{L}*|игр\p{L}*)\s+(?:ФК\s+)?([\p{L}][\p{L}\d -]{1,35}?)\s+в\s+(?:чемпионат|КПЛ|премьер)/iu.exec(question)?.[1]
    || /^\s*[^.!?]{0,32}?([A-Z][\p{L} ]{1,30}?)['’]s\s+(?:last|latest|most recent)\s+(?:league\s+)?match/u.exec(question)?.[1]
  if (!team || !/^[\p{L}\p{N} -]{2,55}$/u.test(team.trim())) return
  return team.trim().replace(/^Кайрата$/iu, "Кайрат").replace(/^Астаны$/iu, "Астана")
}

const normalizedTeam = (name: string) => name.normalize("NFKC").toLowerCase().replace(/қ/gu, "к").replace(/ё/gu, "е").replace(/^(?:фк|fc)\s+/iu, "").trim()

export function officialLeagueResult(source: MalikWebSource, team: string, today: string) {
  let url: URL
  try { url = new URL(source.url) } catch { return }
  if (url.searchParams.has("tournament") && url.searchParams.get("tournament") !== "premier-league") return
  if (!/^(?:www\.)?kffleague\.kz$/iu.test(url.hostname) || !/^\/(?:ru\/|kk\/|en\/)?matches\/\d+\/?$/u.test(url.pathname)) return
  const title = source.title.split(/\s+\|\s+/u)[0]
  const score = /^([\p{L}\p{N} .-]{2,45}?)\s+(\d{1,2})\s*:\s*(\d{1,2})\s+([\p{L}\p{N} .-]{2,45}?)\s+[—–-]\s+(?:КПЛ|Премьер-Лига|Premier League)[,\s]/iu.exec(title)
  if (!score || ![score[1], score[4]].some(value => normalizedTeam(value) === normalizedTeam(team))) return
  if (/(?:перенес|отмен|cancelled|postponed|предварительн|товарищеск|penalties)/iu.test(title + " " + (source.snippet || "").slice(0, 170))) return
  const date = explicitCalendarDates(title)[0]
  if (!date || date > today || !date.startsWith(today.slice(0, 4))) return
  return { date, home: score[1].trim(), away: score[4].trim(), score: score[2] + ":" + score[3], source }
}

export function leagueMatchReply(question: string, sources: readonly MalikWebSource[], today: string, language: "ru" | "kk" | "en") {
  const team = kazakhstanLeagueMatch(question)
  if (!team || language !== "ru" || /(?:предыдущ|перед ним|перед последн|previous|разбери|составах|кто забил|голы)/iu.test(question)) return
  const result = sources.flatMap(source => officialLeagueResult(source, team, today) || []).sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!result) return
  const date = new Intl.DateTimeFormat("ru", { dateStyle: "long", timeZone: "UTC" }).format(new Date(result.date + "T00:00:00Z"))
  const citation = sources.indexOf(result.source) + 1
  return `**${result.home} ${result.score} ${result.away}**. Последний найденный матч в Премьер-лиге Казахстана состоялся ${date}${date.endsWith(".") ? "" : "."} [Карточка матча на сайте лиги](${result.source.url}) [${citation}].`
}
