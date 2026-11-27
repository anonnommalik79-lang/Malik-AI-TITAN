import type { MalikWebSource } from "../ai/web-research-types"
import { normalizeWebSearchQuery } from "../ai/web-search-query"
import { worldAgeProjections } from "./world-age-projections"

/** On January 1, a completed age corresponds to a calendar birth year within one day. */
export function worldBirthCohorts(referenceYear: number) {
  const counts = worldAgeProjections[referenceYear]
  if (!counts) return
  let rank = 0
  return counts
    .map((count, age) => ({ count, birthYear: referenceYear - age - 1 }))
    .sort((a, b) => b.count - a.count)
    .map((cohort, index, sorted) => {
      if (cohort.count !== sorted[index - 1]?.count) rank = index + 1
      return { ...cohort, rank }
    })
}

export function worldBirthCohortEvidence(question: string, localDate: string) {
  const referenceYear = Number(localDate.slice(0, 4))
  const cohorts = worldBirthCohorts(referenceYear)
  if (!cohorts) return
  const requestedYears = new Set([...question.matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/gu)].slice(0, 8).map(match => Number(match[0])))
  const lines = cohorts.filter(item => item.rank <= 10 || requestedYears.has(item.birthYear))
    .map(item => `${item.birthYear}: ${item.count} living people (rank ${item.rank})`)
  const source: MalikWebSource = {
    title: `World population by birth cohort on 1 January ${referenceYear} — UN World Population Prospects 2024`,
    url: "https://anthrotempo.com/tools/my-generation/",
    domain: "anthrotempo.com",
    provider: "un-population-by-age",
    readAt: new Date().toISOString(),
    snippet: [
      `World population on 1 January ${referenceYear}, UN medium-variant projections. The completed age on 1 January corresponds to a birth-year cohort to within one day. Counts below give the estimated living population. Rank compares cohorts represented by single ages under 100 at the same reference date. Source data: United Nations DESA World Population Prospects 2024, processed by Anthrotempo.`,
      ...lines,
    ].join("\n"),
  }
  return { source, cohorts, referenceYear }
}

/** Direct answer for a single lookup. Longer analyses still get the evidence in the model. */
export function worldBirthCohortAnswer(
  question: string,
  evidence: NonNullable<ReturnType<typeof worldBirthCohortEvidence>>,
  language: "ru" | "en",
) {
  const text = normalizeWebSearchQuery(question)
  if (text.length > 180 || /(?:;|\n|и\s+(?:сколько|почему|какое|как)|сравн|compare|\band\s+(?:why|how|which)|в\s+\S+\s+(?:тоже|отдельно))/iu.test(text)) return
  const yearMatches = [...new Set(text.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/gu))]
  const rankQuestion = /(?:на\s+каком\s+месте|сколько\s+месте\s+сто[ий]т|какое\s+место|\b(?:what\s+rank|where\s+does.+rank)\b)/iu.test(text)
  const largestQuestion = /(?:какого\s+года|в\s+каком\s+году\s+родил\p{L}*|\b(?:which|what)\s+(?:birth\s+)?year\b).{0,100}(?:много|больше|многочислен|\b(?:most|largest)\b)/iu.test(text)
  const countQuestion = /(?:сколько|численност|\bhow many\b)/iu.test(text)
    && /(?:сейчас|сегодня|жив|родивш|года\s+рождени|\b(?:alive|now|today)\b)/iu.test(text)
    && !/(?:умер|смерт|рождений|родилось|погиб|\b(?:deaths|died)\b)/iu.test(text)
  const cohort = largestQuestion && !yearMatches.length ? evidence.cohorts[0]
    : yearMatches.length === 1 && evidence.cohorts.find(item => item.birthYear === Number(yearMatches[0]))
  if (!cohort || !rankQuestion && !largestQuestion && !countQuestion) return

  const millions = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(cohort.count / 1_000_000)
  const year = evidence.referenceYear
  const birthYear = cohort.birthYear
  const snapshot = language === "ru" ? `по среднему прогнозу ООН на 1 января ${year} года [1]`
    : `according to the UN medium projection for January 1, ${year} [1]`
  if (language === "ru") {
    if (largestQuestion) return `Самый многочисленный год рождения в мире — **${birthYear}**. Около **${millions} млн** человек этого года рождения были живы ${snapshot}.`
    if (rankQuestion) return `**${birthYear} год рождения — на ${cohort.rank}-м месте в мире** по числу живущих людей среди отдельных годов рождения. Это около **${millions} млн человек** ${snapshot}.`
    return `Около **${millions} млн человек**, родившихся в ${birthYear} году, жили в мире ${snapshot}.`
  }
  if (largestQuestion) return `**${birthYear}** is the largest living birth cohort worldwide, with about **${millions} million** people ${snapshot}.`
  if (rankQuestion) return `People born in **${birthYear}** rank **No. ${cohort.rank}** among living birth cohorts worldwide, at about **${millions} million** ${snapshot}.`
  return `About **${millions} million** people born in ${birthYear} were alive worldwide ${snapshot}.`
}

export function explainWorldBirthCohort(
  referenceQuestion: string,
  evidence: NonNullable<ReturnType<typeof worldBirthCohortEvidence>>,
) {
  const years = [...new Set(referenceQuestion.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/gu))]
  if (years.length !== 1) return
  const cohort = evidence.cohorts.find(item => item.birthYear === Number(years[0]))
  const leader = evidence.cohorts[0]
  if (!cohort || !leader) return
  const millions = (count: number) => new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(count / 1_000_000)
  const snapshot = `По среднему прогнозу ООН на 1 января ${evidence.referenceYear} года [1].`
  if (cohort.rank === 1) return `**${millions(cohort.count)} млн человек для одного года рождения — первое место в мире.** ${snapshot}`
  return `**${millions(cohort.count)} млн для одного года рождения — это ${cohort.rank}-е место в мире.** Для сравнения, у самого многочисленного ${leader.birthYear} года рождения около ${millions(leader.count)} млн человек, всего на ${millions(leader.count - cohort.count)} млн больше. ${snapshot}`
}
