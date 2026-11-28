import type { FreshnessIntent } from "../ai/freshness-intent"
import type { MalikWebSource } from "../ai/web-research-types"
import { fetchResearchResponse } from "../malik-research/bounded-fetch"
import { stripHtml } from "../malik-research/utils"

const bank = "https://nationalbank.kz"
const table = bank + "/ru/exchangerates/ezhednevnye-oficialnye-rynochnye-kursy-valyut/"
const aliases: Record<string, RegExp> = {
  USD: /(?:\bUSD\b|американск\p{L}*\s+доллар|доллар\p{L}*\s+США|доллар\p{L}*\s+(?:к|в)\s+тенге|US dollars?)/iu,
  EUR: /(?:\bEUR\b|евро|euros?)/iu,
  RUB: /(?:\bRUB\b|рубл|roubles?|rubles?)/iu,
  GBP: /(?:\bGBP\b|фунт|pounds? sterling)/iu,
  CNY: /(?:\bCNY\b|юан|yuan)/iu,
}

export function nationalBankQuote(prompt: string) {
  if (!/(?:курс\p{L}*|exchange rate|бағам)/iu.test(prompt)
    || !/(?:тенге|\bKZT\b|₸|нацбанк\p{L}*|nationalbank\.kz|Ұлттық банк)/iu.test(prompt)
    || /(?:биржев\p{L}*|обменник\p{L}*|ставка|прогноз|купить|продать|курс\s+продажи|buying|selling|forecast)/iu.test(prompt)) return []
  const codes = new Set((prompt.match(/\b[A-Z]{3}(?=\s*\/\s*KZT\b)/giu) || []).map(code => code.toUpperCase()))
  for (const [code, words] of Object.entries(aliases)) if (words.test(prompt)) codes.add(code)
  return [...codes].slice(0, 5)
}

type Quote = { code: string; units: number; value: number }

function quote(code: string, rawUnits: string, rawValue: string): Quote | undefined {
  const units = Number(rawUnits), value = Number(rawValue.replace(",", "."))
  if (Number.isSafeInteger(units) && units > 0 && Number.isFinite(value) && value > 0) return { code, units, value }
}

export function readNationalBankQuotes(body: string, date: string, codes: string[]): Quote[] {
  const day = date.split("-").reverse().join(".")
  const find = (input: string, field: string) => input.match(new RegExp("<" + field + ">([^<]+)</" + field + ">", "iu"))?.[1]?.trim()
  const items = [...body.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/giu)]
  if (items.length) {
    const feedDate = find(body.slice(0, items[0].index), "date")
    return items.flatMap(([, item]) => {
      const code = find(item, "title")?.toUpperCase()
      const itemDate = find(item, "pubDate") || find(item, "date") || feedDate
      if (!code || !codes.includes(code) || (itemDate !== day && itemDate !== date)) return []
      const rate = quote(code, find(item, "quant") || "", find(item, "description") || "")
      return rate ? [rate] : []
    })
  }
  // The HTML page has a date on the rate table itself. The date in the URL
  // alone cannot prove the selected date; the server may fall back to today.
  const start = body.search(/(?:Официальные\s*\(рыночные\)\s*курсы\s*валют\s*на|Official\s*\(market\)\s*exchange\s*rates\s*as\s*of)\s*:/iu)
  if (start < 0 || !stripHtml(body.slice(start, start + 340)).slice(0, 120).includes(date)) return []
  return [...body.slice(start).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].flatMap(([, row]) => {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map(([, item]) => stripHtml(item))
    const pair = cells.findIndex(cell => /^(?:[A-Z]{3})\s*\/\s*KZT$/u.test(cell))
    if (pair < 1) return []
    const code = cells[pair].slice(0, 3)
    if (!codes.includes(code)) return []
    const rate = quote(code, cells[pair - 1].match(/^\d+/u)?.[0] || "", cells[pair + 1] || "")
    return rate ? [rate] : []
  })
}

export async function fetchNationalBankQuote(prompt: string, intent: FreshnessIntent, signal: AbortSignal): Promise<MalikWebSource[]> {
  const codes = nationalBankQuote(prompt)
  if (!codes.length || intent.historical || intent.news || intent.window && intent.window.label !== "today"
    || /(?:19|20)\d{2}|вчера|завтра|yesterday|tomorrow|кеше|ертең/iu.test(prompt)) return []
  const date = intent.localDate, day = date.split("-").reverse().join(".")
  const page = table + "?date=" + day
  const urls = [bank + "/rss/get_rates.cfm?fdate=" + day, page]
  const fetched = await Promise.allSettled(urls.map(async url => {
    const response = await fetchResearchResponse(url, { signal, redirect: "error", cache: "no-store" }, 4200, 1024 * 1024)
    return response.ok ? readNationalBankQuotes(await response.text(), date, codes) : []
  }))
  const quotes = new Map<string, Quote>()
  for (const result of fetched) if (result.status === "fulfilled") for (const rate of result.value) {
    if (!quotes.has(rate.code)) quotes.set(rate.code, rate)
  }
  if (!quotes.size) return []
  const lines = [...quotes.values()].map(({ code, units, value }) => `${units} ${code} = ${value} KZT`)
  return [{ title: "Национальный Банк Казахстана · официальные курсы валют", url: page, domain: "nationalbank.kz",
    snippet: `${date}. ${lines.join(". ")}.`, provider: "nationalbank-official-quote", checkedAt: intent.checkedAt, readAt: intent.checkedAt }]
}

export function verifiedNationalBankReply(prompt: string, sources: readonly MalikWebSource[], intent: FreshnessIntent) {
  if (prompt.length > 215 || /(?:сравн|сколько\s+будет|конверт|вычисл|посчита|почему|поясни|объясни|выгодно|банках|compare|convert|why)/iu.test(prompt)) return
  const requested = nationalBankQuote(prompt)
  const index = sources.findIndex(source => source.provider === "nationalbank-official-quote" && source.domain === "nationalbank.kz" && source.readAt)
  if (index < 0 || !requested.length) return
  const source = sources[index]
  const rows = (source.snippet || "").match(/\d+ [A-Z]{3} = \d+(?:\.\d+)? KZT/gu) || []
  if (requested.some(code => !rows.some(line => line.includes(` ${code} = `)))) return
  const language = intent.language
  const date = new Intl.DateTimeFormat(language, {day: "numeric", month: "long", year: "numeric", timeZone: "UTC"}).format(new Date(intent.localDate + "T00:00:00Z"))
  const rates = rows.map(line => line.replace(/= (\d+(?:\.\d+)?) KZT/gu, (_, value) => "= " + Number(value).toLocaleString(language, { maximumFractionDigits: 6 }) + " ₸")).join(", ")
  const lead = language === "kk" ? "Ұлттық Банктің ресми бағамы" : language === "en" ? "National Bank of Kazakhstan official rate" : "Официальный курс Нацбанка Казахстана"
  return `**${rates}** — ${lead} на ${date} [${index + 1}].`
}
