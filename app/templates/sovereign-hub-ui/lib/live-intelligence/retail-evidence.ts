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

export type RetailOffer = {
  name: string
  price: number
  currency: string
  availability?: "in-stock" | "out-of-stock" | "preorder"
  variantConflict?: boolean
  condition?: "new" | "used" | "refurbished"
}

export function readStructuredRetailOffer(html: string, url: string): RetailOffer | undefined {
  const offers: RetailOffer[] = []
  const page = new URL(url)
  for (const [, block] of html.slice(0, 1_000_000).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld(?:\+|&#x2b;|&#43;)json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      // Merchant templates occasionally emit a trailing comma in a JSON-LD object.
      const data = JSON.parse(block.replace(/,\s*,/gu, ",").replace(/,\s*(?=[}\]])/gu, ""))
      const graph = (Array.isArray(data) ? data : Array.isArray(data?.["@graph"]) ? data["@graph"] : [data]).slice(0, 35)
      for (const product of graph) {
        if (!product || ![product["@type"]].flat().some(type => typeof type === "string" && /(?:^|\/)Product$/u.test(type))) continue
        const name = typeof product.name === "string" ? product.name : product.model
        if (typeof name !== "string" || name.length > 200) continue
        const entries = (Array.isArray(product.offers) ? product.offers : [product.offers]).slice(0, 10)
        for (const item of entries) {
          if (!item || !/(?:^|\/)Offer$/u.test(String(item["@type"])) || !/^[A-Z]{3}$/u.test(item.priceCurrency)) continue
          const offerUrl = item.url || product.url
          if (offerUrl) {
            const linked = new URL(/^www\./iu.test(offerUrl) ? "https://" + offerUrl : offerUrl, page)
            if (linked.hostname.replace(/^www\./u, "") !== page.hostname.replace(/^www\./u, "") || linked.pathname.replace(/\/$/u, "") !== page.pathname.replace(/\/$/u, "")) continue
          }
          if (typeof item.priceValidUntil === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(item.priceValidUntil) && item.priceValidUntil < new Date().toISOString().slice(0, 10)) continue
          const price = Number(item.price)
          if (!Number.isFinite(price) || price <= 0) continue
          const availability = /(?:\/|^)InStock$/u.test(item.availability) ? "in-stock"
            : /(?:\/|^)(?:OutOfStock|SoldOut|Discontinued)$/u.test(item.availability) ? "out-of-stock"
              : /(?:\/|^)PreOrder$/u.test(item.availability) ? "preorder" : undefined
          const storage = /(?<!\d)(\d+)\s*(?:gb|гб)(?!\p{L})/iu.exec(name)?.[1]
          const specifications = Array.isArray(product.additionalProperty) ? product.additionalProperty : []
          const variantConflict = Boolean(storage && specifications.some((property: { name?: string; value?: string }) =>
            /(?:встроенная память|объем накопителя|storage capacity)/iu.test(property?.name || "") &&
            /(?<!\d)\d+\s*(?:gb|гб)(?!\p{L})/iu.test(property?.value || "") &&
            !new RegExp(`(?<!\\d)${storage}\\s*(?:gb|гб)(?!\\p{L})`, "iu").test(property.value || "")))
          const condition = /(?:\/|^)NewCondition$/u.test(item.itemCondition) ? "new"
            : /(?:\/|^)(?:UsedCondition|DamagedCondition)$/u.test(item.itemCondition) ? "used"
              : /(?:\/|^)RefurbishedCondition$/u.test(item.itemCondition) ? "refurbished" : undefined
          offers.push({ name, price, currency: item.priceCurrency, availability, variantConflict, condition })
        }
      }
    } catch { /* An invalid block is not offer evidence. */ }
  }
  const [offer] = offers
  // Multiple distinct prices or products on a category page cannot be assigned to one listing.
  return offer && offers.every(item => item.name === offer.name && item.price === offer.price && item.currency === offer.currency && item.availability === offer.availability) ? offer : undefined
}

export function relevantRetailOffer(source: MalikWebSource, retail: NonNullable<ReturnType<typeof retailLookup>>) {
  const offer = source.retailOffer
  return source.readAt && offer && isRetailLead({ ...source, title: offer.name, url: "", snippet: "" }, retail) ? offer : undefined
}

export function retailAnswer(question: string, sources: readonly MalikWebSource[], readOnly = false) {
  const retail = retailLookup(question)
  if (!retail || !/[а-я]/iu.test(question)) return
  const leadCount = /(?:два|2|двух)\s+магазин/iu.test(question) ? 2 : /(?:сравн|compare)/iu.test(question) ? 3 : 1
  const listings = sources.flatMap((source, index) => {
    if (!isRetailLead(source, retail)) return []
    const offer = relevantRetailOffer(source, retail)
    const text = source.snippet || ""
    const inRequestedCity = !retail.location || source.title.toLowerCase().includes(retail.location.toLowerCase())
    const price = String.raw`(?<![\d.,])(?:от\s+)?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,]\d{1,2})?\s*(?:₸|тенге|тг\.?|KZT|₽|руб\.)(?!\p{L})(?!\s*[/×])`
    const labelled = [...text.matchAll(new RegExp(`(?:цена|price)\\s*[:=]\\s*(${price})`, "giu"))].map(match => match[1])
    const rawValues = labelled.length ? labelled : [...text.matchAll(new RegExp(price, "giu"))].map(match => match[0])
    const values = [...new Set(rawValues.map(value => value.replace(/\s+/gu, " ").trim()))]
    const labeledCard = Boolean(source.readAt && labelled.length && values.length === 1 &&
      isRetailLead({ ...source, url: "", snippet: "" }, retail) && !/(?:каталог|цены от|marketplace)/iu.test(source.title))
    const verifiedPrice = Boolean(inRequestedCity && (offer ? !offer.variantConflict : labeledCard))
    if (readOnly && !verifiedPrice) return []
    const amount = offer ? new Intl.NumberFormat("ru", { maximumFractionDigits: 2 }).format(offer.price) + " " + (offer.currency === "KZT" ? "₸" : offer.currency)
      : values.length === 1 ? values[0] : "Цена не подтверждена"
    const availability = offer?.availability === "in-stock" ? "В наличии по данным карточки"
      : offer?.availability === "out-of-stock" ? "Нет в наличии по данным карточки"
        : offer?.availability === "preorder" ? "Предзаказ по данным карточки" : "Наличие не подтверждено"
    const condition = offer?.condition === "used" || /(?<!\p{L})б\s*\/\s*у(?!\p{L})/iu.test(source.title) ? ". Б/у"
      : offer?.condition === "refurbished" ? ". Восстановленный" : ""
    const coverage = offer?.variantConflict ? "Объём памяти в характеристиках расходится с названием карточки"
      : offer ? availability + (retail.location ? ". Остаток в конкретной точке не проверен" : "")
      : values.length === 1 && !labeledCard ? "Цена из фрагмента страницы. Наличие не подтверждено" : availability
    const region = !inRequestedCity ? ". Привязка к " + retail.location + " не подтверждена" : ""
    return [{ source, index, verifiedPrice, amount, coverage: coverage + condition + region }]
  }).sort((a, b) => Number(b.verifiedPrice) - Number(a.verifiedPrice) || Number(Boolean(b.source.readAt)) - Number(Boolean(a.source.readAt)))
  const stores = new Set<string>()
  const selected = listings.filter(row => {
    if (stores.has(row.source.domain)) return false
    stores.add(row.source.domain)
    return true
  }).slice(0, leadCount)
  if (!selected.length || readOnly && selected.length < leadCount) return
  const rows = selected.map(row => `| ${row.source.domain} [${row.index + 1}] | ${row.amount} | ${row.coverage} |`).join("\n")
  return `**${retail.subject}${retail.location ? " в " + retail.location : ""}**\n\n| Карточка | Цена | Наличие |\n|---|---:|---|\n${rows}`
}
