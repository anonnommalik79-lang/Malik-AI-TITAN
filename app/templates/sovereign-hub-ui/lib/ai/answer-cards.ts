/**
 * Answer cards: the parts of an answer that are things you can open, attend,
 * apply to or buy - events, funds, competitions, companies, products, places.
 *
 * ChatGPT shows them as cards: a picture from the source page, the name as a
 * link to the official page, a status badge, date and place, the key figure,
 * source chips and a button for the next step. The model writes a closed
 * ```malik-cards JSON fence; this module validates it and the chat renders it
 * (MalikAnswerCards.tsx). Links and pictures are resolved against the answer's
 * own web sources at render time, so a card cannot point somewhere the
 * evidence does not.
 */

export type CardLink = { label: string; url: string }
export type CardFact = { label: string; value: string }

export type AnswerCard = {
  title: string
  url?: string
  /** A source number whose page picture to show, or a well-known name to look up. */
  image?: number | string
  badge?: string
  meta?: string
  value?: string
  valueNote?: string
  text?: string
  note?: string
  facts?: CardFact[]
  links?: CardLink[]
  action?: CardLink
  sources?: number[]
}

export type AnswerCardsBlock =
  | { type: "cards"; title?: string; items: AnswerCard[] }
  | { type: "hero"; item: AnswerCard }
  | { type: "options"; title?: string; items: AnswerCard[] }
  | { type: "dates"; title?: string; items: CardFact[] }
  | { type: "actions"; items: Array<CardLink & { primary?: boolean }> }

const MAX_ITEMS = 8
const CITATION = /\s*\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\]/g

function text(value: unknown, limit: number): string {
  if (typeof value !== "string" && typeof value !== "number") return ""
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, limit)
}

function numbers(value: unknown): number[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return [...new Set(list.map(Number).filter((number) => Number.isInteger(number) && number >= 1 && number <= 40))].slice(0, 6)
}

/** Text with its [n] markers moved into the card's source list. */
function textWithSources(value: unknown, limit: number, sources: Set<number>): string {
  const raw = text(value, limit + 40)
  return raw.replace(CITATION, (_, list: string) => {
    for (const piece of list.split(/[,;]/)) {
      const number = Number(piece.trim())
      if (Number.isInteger(number) && number >= 1 && number <= 40) sources.add(number)
    }
    return ""
  }).trim().slice(0, limit)
}

function link(value: unknown): CardLink | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  const label = text(record.label, 80)
  const url = text(record.url, 1200)
  return label && /^https?:\/\//i.test(url) ? { label, url } : undefined
}

function facts(value: unknown, limit = 4): CardFact[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as Record<string, unknown>
    const label = text(record.label, 48)
    const factValue = text(record.value, 60)
    return label && factValue ? [{ label, value: factValue }] : []
  }).slice(0, limit)
}

function card(value: unknown): AnswerCard | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const title = text(record.title, 120)
  if (!title) return null
  const sources = new Set(numbers(record.sources))
  const image = typeof record.image === "number" && Number.isInteger(record.image) && record.image >= 1 && record.image <= 40
    ? record.image
    : text(record.image, 100) || undefined
  const result: AnswerCard = { title }
  const url = text(record.url, 1200)
  if (/^https?:\/\//i.test(url)) result.url = url
  if (image !== undefined) result.image = image
  for (const [key, limit] of [["badge", 40], ["meta", 120], ["value", 40], ["valueNote", 140]] as const) {
    const field = text(record[key], limit)
    if (field) result[key] = field
  }
  const body = textWithSources(record.text, 600, sources)
  if (body) result.text = body
  const note = textWithSources(record.note, 240, sources)
  if (note) result.note = note
  const cardFacts = facts(record.facts)
  if (cardFacts.length) result.facts = cardFacts
  const cardLinks = (Array.isArray(record.links) ? record.links : []).map(link).filter((entry): entry is CardLink => Boolean(entry)).slice(0, 3)
  if (cardLinks.length) result.links = cardLinks
  const action = link(record.action)
  if (action) result.action = action
  if (sources.size) result.sources = [...sources].slice(0, 6)
  return result
}

/** A validated block, or null for anything malformed, partial or unknown. */
export function parseAnswerCards(json: string): AnswerCardsBlock | null {
  if (!json || json.length > 24_000) return null
  let data: Record<string, unknown>
  try { data = JSON.parse(json) } catch { return null }
  if (!data || typeof data !== "object" || data.version !== 1) return null
  const title = text(data.title, 120) || undefined
  if (data.type === "cards" || data.type === "options") {
    const items = (Array.isArray(data.items) ? data.items : []).map(card).filter((entry): entry is AnswerCard => Boolean(entry)).slice(0, MAX_ITEMS)
    return items.length ? { type: data.type, ...(title ? { title } : {}), items } : null
  }
  if (data.type === "hero") {
    const item = card(data.item)
    return item ? { type: "hero", item } : null
  }
  if (data.type === "dates") {
    const items = facts(data.items, 5)
    return items.length >= 2 ? { type: "dates", ...(title ? { title } : {}), items } : null
  }
  if (data.type === "actions") {
    const items = (Array.isArray(data.items) ? data.items : []).flatMap((entry) => {
      const parsed = link(entry)
      return parsed ? [{ ...parsed, ...((entry as Record<string, unknown>)?.primary === true ? { primary: true } : {}) }] : []
    }).slice(0, 3)
    return items.length ? { type: "actions", items } : null
  }
  return null
}

const FENCE = /^\s*```malik-cards\s*\n([\s\S]*?)\n\s*```\s*$/gmu

function cite(sources?: number[]) {
  return sources?.length ? ` [${sources.join("][")}]` : ""
}

function cardText(item: AnswerCard): string {
  return [
    `**${item.title}**${item.badge ? ` (${item.badge})` : ""}${item.url ? ` — ${item.url}` : ""}`,
    [item.value, item.valueNote].filter(Boolean).join(" — "),
    item.meta || "",
    item.text ? `${item.text}${cite(item.sources)}` : item.sources?.length ? cite(item.sources).trim() : "",
    item.note || "",
    ...(item.facts || []).map((fact) => `${fact.label}: ${fact.value}`),
    ...(item.links || []).map((entry) => `${entry.label}: ${entry.url}`),
    item.action ? `${item.action.label}: ${item.action.url}` : "",
  ].filter(Boolean).join("\n")
}

/**
 * The same answer with every card block written out as plain text: for
 * copying, reading aloud, sharing and for checking the cards' figures and [n]
 * markers against the sources.
 */
export function answerCardsToText(answer: string): string {
  return String(answer || "").replace(FENCE, (whole, body: string) => {
    const block = parseAnswerCards(body)
    if (!block) return ""
    if (block.type === "hero") return cardText(block.item)
    if (block.type === "dates") return [block.title ? `**${block.title}**` : "", ...block.items.map((item) => `${item.label}: ${item.value}`)].filter(Boolean).join("\n")
    if (block.type === "actions") return block.items.map((item) => `${item.label}: ${item.url}`).join("\n")
    return [block.title ? `**${block.title}**` : "", ...block.items.map(cardText)].filter(Boolean).join("\n\n")
  })
}

export const MALIK_ANSWER_CARDS_CONTRACT = [
  "ANSWER CARDS: when the answer names concrete things the user can open, attend, apply to, buy, contact or visit - events, funds, programmes, competitions, companies, products, places, courses - show them as cards in a closed ```malik-cards JSON fence, the way ChatGPT does, and keep the reasoning, comparison and caveats in ordinary Markdown around them. One fence per block; several blocks per answer are fine.",
  "Card fields: title (exact name), url (its official page), image, badge (a short factual status: «Приём заявок открыт», «Ближайшее в Казахстане»; «Мой первый приоритет» only for your own recommendation), meta («23 октября 2026 · Астана»), value (one key figure: «$30 млн», «7–8 июня 2027»), valueNote (what the figure means), text (1-2 sentences), note (a caveat), facts [{label,value}] («Последний день подачи» → «2 ноября 2026»), links [{label,url}], action {label,url} (the next step), sources [n].",
  "Block types: {\"version\":1,\"type\":\"cards\",\"title\":\"...\",\"items\":[card,...]} a list of 2-6 items, each with a picture; {\"version\":1,\"type\":\"hero\",\"item\":card} the single main recommendation with a large picture; {\"version\":1,\"type\":\"options\",\"title\":\"...\",\"items\":[card with action,...]} where to apply, buy or invest, each with its button; {\"version\":1,\"type\":\"dates\",\"title\":\"...\",\"items\":[{\"label\":\"Дедлайн\",\"value\":\"1 мая 2027\"},...]} 2-4 key dates; {\"version\":1,\"type\":\"actions\",\"items\":[{\"label\":\"Заявка\",\"url\":\"...\",\"primary\":true},{\"label\":\"Сайт форума\",\"url\":\"...\"}]} 1-3 buttons.",
  "image is the number of a web source marked «Page picture: available» that shows that very thing, or a short canonical name (preferably English) of a well-known person, place or product to look up; omit it otherwise. Every url must come from the web sources (the source URL or an address printed in its text) - never invent or guess a link, date, price, prize or status; what the sources do not confirm is written as unconfirmed in the text. Put each card's supporting source numbers in sources.",
  "In prose and tables, write names of such things as Markdown links [Name](url) to the same official pages. Do not use cards for definitions, code, maths, small talk or when there is nothing concrete to open.",
].join("\n")
