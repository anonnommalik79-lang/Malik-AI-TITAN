import type { MalikWebSource } from "../ai/web-research-types"

export function retailLookup(question: string) {
  const asksPrice = /(?:сколько\s+(?:(?:сейчас|сегодня)\s+)?стоит|какая\s+цена|current price|how much does|бағасы\s+қанша)/iu
  const commerce = /(?:магазин|в наличии|наличи[еяю]|купить|retailer|store|in stock|available to buy|дүкен)/iu
  if (!asksPrice.test(question) || !commerce.test(question)) return
  const subject = question.split(/[?!\n]/u)[0].replace(/^.*?(?:сколько\s+(?:(?:сейчас|сегодня)\s+)?стоит|какая\s+цена|current price of|how much does)\s+(?:(?:сейчас|сегодня)\s+)?/iu, "")
    .replace(/\s+(?:в|in)\s+[\p{L}\p{N}].*$/iu, "").replace(/\s+cost$/iu, "").trim()
  const location = /(?:\s(?:в|in)\s+)([\p{Lu}][\p{L}-]*(?:\s+[\p{Lu}][\p{L}-]*)?)(?:[?!,.]|$)/u.exec(question)?.[1]
  const tokens = subject.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []
  if (!tokens.length || tokens.length > 9) return
  return { subject, location, tokens }
}

export function isRetailLead(source: MalikWebSource, retail: NonNullable<ReturnType<typeof retailLookup>>) {
  const title = `${source.title} ${source.url}`.toLowerCase()
  const text = `${title} ${source.snippet || ""}`.toLowerCase().replace(/айфон/gu, "iphone").replace(/гигабайт\p{L}*|\bgb\b|гб/gu, "gb").replace(/[\s_-]+/gu, " ")
  const tokens = retail.tokens.map(token => token === "гб" ? "gb" : token === "айфон" ? "iphone" : token)
  return tokens.every(token => new RegExp(`(?<![\\p{L}\\d])${token}(?![\\p{L}\\d])`, "iu").test(text)
    || /^\d+$/u.test(token) && new RegExp(`(?<!\\d)${token}(?=gb(?!\\p{L}))`, "iu").test(text)
    || token === "gb" && /\d+gb(?!\p{L})/iu.test(text))
}

export function retailPageEvidence(text: string, title: string) {
  const heading = title.split(/(?:[|–—]|\s+-\s+)/u)[0].trim()
  const priceOrAvailability = /(?:\d[\d \u00a0]{0,12}\s*(?:₸|тенге|KZT|USD|EUR|руб\.|₽)|(?:USD|EUR|\$|€)\s*\d[\d.,]*|в\s+наличии|нет\s+в\s+наличии|нет\s+на\s+складе|под\s+заказ|out of stock|in stock)/giu
  const snippets: string[] = []
  for (const match of text.slice(0, 16_000).matchAll(priceOrAvailability)) {
    const excerpt = text.slice(Math.max(0, match.index - 90), match.index + match[0].length + 110).trim()
    if (!snippets.some(value => value.includes(match[0]))) snippets.push(excerpt)
    if (snippets.length === 4) break
  }
  return [heading, ...snippets, text.slice(0, 850)].filter(Boolean).join("\n").slice(0, 2250)
}
