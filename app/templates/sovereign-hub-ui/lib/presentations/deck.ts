import {
  SLIDE_LAYOUTS,
  type ChartDatum,
  type Deck,
  type DeckLanguage,
  type DeckOutline,
  type OutlineItem,
  type Slide,
  type SlideLayout,
  type SlidePoint,
  type SlideStat,
  type SlideStep,
} from "@/lib/presentations/types"

/**
 * Everything between "the model said something" and "this is a slide".
 *
 * Models return JSON the way people return forms: mostly right, sometimes in a
 * code fence, occasionally with a trailing comma, now and then with a field
 * called `bullets` where `points` was asked for, and every so often with nine
 * items where five was the limit. Each of those turns into a broken slide if
 * it is trusted. So nothing from the model is trusted: every field is coerced,
 * every string is stripped of Markdown and cut to the length its box can hold,
 * every list is bounded, and a slide whose layout cannot be satisfied is
 * degraded to a simpler one that can — or dropped, so the caller can ask again.
 *
 * All of it is pure, so all of it is tested.
 */

export const MIN_SLIDES = 4
export const MAX_SLIDES = 20
export const DEFAULT_SLIDES = 10

/** What each operation costs, in presentation credits. */
export const PRESENTATION_COSTS = {
  outline: 1,
  slide: 1,
} as const

const LIMITS = {
  title: 90,
  subtitle: 170,
  kicker: 40,
  intro: 200,
  pointTitle: 80,
  pointBody: 170,
  body: 420,
  statValue: 14,
  statLabel: 70,
  context: 220,
  quote: 260,
  author: 60,
  role: 80,
  stepLabel: 24,
  columnHeading: 40,
  rowLabel: 40,
  cell: 70,
  chartLabel: 26,
  takeaway: 200,
  notes: 700,
  imagePrompt: 320,
  contact: 90,
} as const

const LIST_BOUNDS = {
  points: [2, 5],
  cards: [2, 4],
  steps: [3, 6],
  stats: [1, 3],
  rows: [2, 6],
  chart: [2, 8],
  columnPoints: [2, 5],
  imagePoints: [0, 4],
} as const

let idCounter = 0

export function slideId() {
  idCounter = (idCounter + 1) % 1_000_000
  return `s-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function deckId() {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

/* ------------------------------------------------------------------ text */

/** Markdown the model adds for emphasis means nothing on a slide. */
export function cleanText(value: unknown, limit: number): string {
  const text = String(value ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(?:[-•*▪►]|\d{1,2}[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
  if (text.length <= limit) return text
  // Cut at a word boundary, and say that it was cut.
  const slice = text.slice(0, limit - 1)
  const lastSpace = slice.lastIndexOf(" ")
  return `${(lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : slice).replace(/[,;:—–-]\s*$/, "")}…`
}

function optionalText(value: unknown, limit: number) {
  const text = cleanText(value, limit)
  return text || undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function firstOf(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key]
    if (value !== undefined && value !== null && value !== "") return value
  }
  return undefined
}

function bounded<T>(items: T[], [min, max]: readonly [number, number]): T[] | null {
  const kept = items.slice(0, max)
  return kept.length >= min ? kept : null
}

/* ------------------------------------------------------------- the JSON */

/**
 * The JSON inside whatever the model wrapped it in: a code fence, a sentence
 * of preamble, a hidden <think> block. Trailing commas are removed because
 * they are the single most common reason a model's JSON does not parse.
 */
export function extractJson(raw: unknown): unknown {
  const clean = String(raw ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const text = fenced || clean

  const objectStart = text.indexOf("{")
  const arrayStart = text.indexOf("[")
  const useArray = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)
  const start = useArray ? arrayStart : objectStart
  const end = useArray ? text.lastIndexOf("]") : text.lastIndexOf("}")
  if (start < 0 || end <= start) return null

  const candidate = text.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1")
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

/* --------------------------------------------------------------- layouts */

export function isSlideLayout(value: unknown): value is SlideLayout {
  return typeof value === "string" && (SLIDE_LAYOUTS as readonly string[]).includes(value)
}

const LAYOUT_ALIASES: Record<string, SlideLayout> = {
  cover: "title",
  hero: "title",
  intro: "title",
  divider: "section",
  chapter: "section",
  list: "bullets",
  "bullet-list": "bullets",
  bullet: "bullets",
  columns: "two-column",
  "two-columns": "two-column",
  split: "two-column",
  metrics: "stat",
  stats: "stat",
  number: "stat",
  numbers: "stat",
  kpi: "stat",
  testimonial: "quote",
  image: "image-text",
  "image-left": "image-text",
  "image-right": "image-text",
  features: "cards",
  grid: "cards",
  roadmap: "timeline",
  process: "timeline",
  steps: "timeline",
  table: "comparison",
  versus: "comparison",
  vs: "comparison",
  graph: "chart",
  "bar-chart": "chart",
  bar: "chart",
  cta: "closing",
  end: "closing",
  thanks: "closing",
  conclusion: "closing",
}

export function coerceLayout(value: unknown, fallback: SlideLayout = "bullets"): SlideLayout {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-")
  if (isSlideLayout(key)) return key
  return LAYOUT_ALIASES[key] || fallback
}

/* ---------------------------------------------------------------- pieces */

function toPoint(value: unknown): SlidePoint | null {
  if (typeof value === "string") {
    // "Title: body" and "Title — body" are the same thing written two ways.
    const split = value.match(/^(.{2,70}?)\s*[:—–]\s+(.{3,})$/)
    const title = cleanText(split ? split[1] : value, LIMITS.pointTitle)
    if (!title) return null
    const body = split ? optionalText(split[2], LIMITS.pointBody) : undefined
    return body ? { title, body } : { title }
  }
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const title = cleanText(firstOf(raw, "title", "heading", "label", "name", "text", "point"), LIMITS.pointTitle)
  if (!title) return null
  const body = optionalText(firstOf(raw, "body", "description", "detail", "text", "desc"), LIMITS.pointBody)
  return body && body !== title ? { title, body } : { title }
}

function toStat(value: unknown): SlideStat | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const statValue = cleanText(firstOf(raw, "value", "number", "stat", "figure"), LIMITS.statValue)
  const label = cleanText(firstOf(raw, "label", "title", "description", "caption"), LIMITS.statLabel)
  return statValue && label ? { value: statValue, label } : null
}

function toStep(value: unknown, index: number): SlideStep | null {
  if (typeof value === "string") {
    const point = toPoint(value)
    return point ? { label: String(index + 1).padStart(2, "0"), title: point.title, body: point.body } : null
  }
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const title = cleanText(firstOf(raw, "title", "heading", "name", "text"), LIMITS.pointTitle)
  if (!title) return null
  const label = cleanText(firstOf(raw, "label", "date", "when", "phase", "step"), LIMITS.stepLabel) || String(index + 1).padStart(2, "0")
  const body = optionalText(firstOf(raw, "body", "description", "detail"), LIMITS.pointBody)
  return body ? { label, title, body } : { label, title }
}

function toStrings(value: unknown, limit: number): string[] {
  return asArray(value)
    .map((item) => {
      if (typeof item === "string") return cleanText(item, limit)
      if (item && typeof item === "object") {
        const point = toPoint(item)
        return point ? cleanText(point.body ? `${point.title} — ${point.body}` : point.title, limit) : ""
      }
      return ""
    })
    .filter(Boolean)
}

/** "12,5%", "1 200", "$3.4M" → a number a bar chart can draw. */
export function parseChartNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const text = String(value ?? "").replace(/[\s\u00A0\u202F]/g, "").replace(/[^\d.,-]/g, "")
  if (!text) return null
  const normalised = /,\d{1,2}$/.test(text) && !/\.\d/.test(text)
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(/,/g, "")
  const number = Number(normalised)
  return Number.isFinite(number) ? number : null
}

function toChartDatum(value: unknown): ChartDatum | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const label = cleanText(firstOf(raw, "label", "name", "x", "category", "year"), LIMITS.chartLabel)
  const number = parseChartNumber(firstOf(raw, "value", "y", "amount", "number"))
  return label && number !== null ? { label, value: number } : null
}

function toColumn(value: unknown) {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const heading = cleanText(firstOf(raw, "heading", "title", "name", "label"), LIMITS.columnHeading)
  const points = bounded(toStrings(firstOf(raw, "points", "bullets", "items"), LIMITS.pointBody), LIST_BOUNDS.columnPoints)
  return heading && points ? { heading, points } : null
}

/* ----------------------------------------------------------------- slides */

function common(raw: Record<string, unknown>) {
  const notes = optionalText(firstOf(raw, "notes", "speakerNotes", "speaker_notes"), LIMITS.notes)
  const imagePrompt = optionalText(firstOf(raw, "imagePrompt", "image_prompt", "image"), LIMITS.imagePrompt)
  const imageUrl = typeof raw.imageUrl === "string" && /^(https:|data:image\/)/.test(raw.imageUrl) ? raw.imageUrl : undefined
  return {
    id: typeof raw.id === "string" && /^[\w-]{3,64}$/.test(raw.id) ? raw.id : slideId(),
    ...(notes ? { notes } : {}),
    ...(imagePrompt ? { imagePrompt } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  }
}

/**
 * The last resort for a slide whose layout could not be satisfied: if it has
 * a title and anything that reads as a list, it is a bullet slide.
 */
function degradeToBullets(raw: Record<string, unknown>, title: string): Slide | null {
  const candidates = [
    firstOf(raw, "points", "bullets", "items"),
    firstOf(raw, "cards", "features"),
    firstOf(raw, "steps", "timeline"),
    Array.isArray(raw.stats) ? (raw.stats as unknown[]).map((stat) => {
      const parsed = toStat(stat)
      return parsed ? `${parsed.value} — ${parsed.label}` : null
    }) : undefined,
    Array.isArray(raw.data) ? (raw.data as unknown[]).map((datum) => {
      const parsed = toChartDatum(datum)
      return parsed ? `${parsed.label}: ${parsed.value}` : null
    }) : undefined,
  ]
  for (const candidate of candidates) {
    const points = bounded(asArray(candidate).map(toPoint).filter((p): p is SlidePoint => Boolean(p)), LIST_BOUNDS.points)
    if (points) return { ...common(raw), layout: "bullets", title, points }
  }
  return null
}

export function normalizeSlide(value: unknown, fallbackLayout: SlideLayout = "bullets"): Slide | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const layout = coerceLayout(raw.layout ?? raw.type, fallbackLayout)
  const title = cleanText(firstOf(raw, "title", "headline", "heading"), LIMITS.title)
  const base = common(raw)

  switch (layout) {
    case "title": {
      if (!title) return null
      const kicker = optionalText(raw.kicker, LIMITS.kicker)
      const subtitle = optionalText(firstOf(raw, "subtitle", "subheading", "body"), LIMITS.subtitle)
      return { ...base, layout, title, ...(kicker ? { kicker } : {}), ...(subtitle ? { subtitle } : {}) }
    }
    case "section": {
      if (!title) return null
      const number = optionalText(firstOf(raw, "number", "index"), 4)
      const subtitle = optionalText(firstOf(raw, "subtitle", "body"), LIMITS.subtitle)
      return { ...base, layout, title, ...(number ? { number } : {}), ...(subtitle ? { subtitle } : {}) }
    }
    case "bullets": {
      if (!title) return null
      const points = bounded(asArray(firstOf(raw, "points", "bullets", "items")).map(toPoint).filter((p): p is SlidePoint => Boolean(p)), LIST_BOUNDS.points)
      if (!points) return degradeToBullets(raw, title)
      const intro = optionalText(firstOf(raw, "intro", "subtitle", "lead"), LIMITS.intro)
      return { ...base, layout, title, points, ...(intro ? { intro } : {}) }
    }
    case "two-column": {
      if (!title) return null
      const left = toColumn(raw.left)
      const right = toColumn(raw.right)
      if (!left || !right) return degradeToBullets(raw, title)
      return { ...base, layout, title, left, right }
    }
    case "stat": {
      if (!title) return null
      const stats = bounded(asArray(firstOf(raw, "stats", "metrics", "numbers")).map(toStat).filter((s): s is SlideStat => Boolean(s)), LIST_BOUNDS.stats)
      if (!stats) return degradeToBullets(raw, title)
      const context = optionalText(firstOf(raw, "context", "body", "note"), LIMITS.context)
      return { ...base, layout, title, stats, ...(context ? { context } : {}) }
    }
    case "quote": {
      const quote = cleanText(firstOf(raw, "quote", "text", "body"), LIMITS.quote).replace(/^["«“]+|["»”]+$/g, "")
      if (!quote) return null
      const author = optionalText(firstOf(raw, "author", "name", "by"), LIMITS.author)
      const role = optionalText(firstOf(raw, "role", "position", "company"), LIMITS.role)
      return { ...base, layout, quote, ...(author ? { author } : {}), ...(role ? { role } : {}) }
    }
    case "image-text": {
      if (!title) return null
      const body = optionalText(firstOf(raw, "body", "text", "description"), LIMITS.body)
      const points = toStrings(firstOf(raw, "points", "bullets"), LIMITS.pointBody).slice(0, LIST_BOUNDS.imagePoints[1])
      if (!body && !points.length) return null
      const imageSide = raw.imageSide === "left" ? "left" : "right"
      return { ...base, layout, title, points, imageSide, ...(body ? { body } : {}) }
    }
    case "cards": {
      if (!title) return null
      const cards = bounded(asArray(firstOf(raw, "cards", "features", "items", "points")).map(toPoint).filter((p): p is SlidePoint => Boolean(p)), LIST_BOUNDS.cards)
      if (!cards) return degradeToBullets(raw, title)
      return { ...base, layout, title, cards }
    }
    case "timeline": {
      if (!title) return null
      const steps = bounded(asArray(firstOf(raw, "steps", "timeline", "items", "milestones")).map(toStep).filter((s): s is SlideStep => Boolean(s)), LIST_BOUNDS.steps)
      if (!steps) return degradeToBullets(raw, title)
      return { ...base, layout, title, steps }
    }
    case "comparison": {
      if (!title) return null
      const columnsRaw = asArray(firstOf(raw, "columns", "options", "headers")).map((c) => cleanText(c, LIMITS.columnHeading)).filter(Boolean)
      const rows = bounded(
        asArray(raw.rows)
          .map((row) => {
            if (!row || typeof row !== "object") return null
            const r = row as Record<string, unknown>
            const label = cleanText(firstOf(r, "label", "criterion", "name", "title"), LIMITS.rowLabel)
            const values = asArray(firstOf(r, "values", "cells")).map((v) => cleanText(v, LIMITS.cell))
            return label && values.length >= 2 && values[0] && values[1] ? { label, values: [values[0], values[1]] as [string, string] } : null
          })
          .filter((r): r is { label: string; values: [string, string] } => Boolean(r)),
        LIST_BOUNDS.rows,
      )
      if (columnsRaw.length < 2 || !rows) return degradeToBullets(raw, title)
      const verdict = optionalText(firstOf(raw, "verdict", "conclusion", "takeaway"), LIMITS.takeaway)
      return { ...base, layout, title, columns: [columnsRaw[0], columnsRaw[1]], rows, ...(verdict ? { verdict } : {}) }
    }
    case "chart": {
      if (!title) return null
      const data = bounded(asArray(firstOf(raw, "data", "series", "values", "bars")).map(toChartDatum).filter((d): d is ChartDatum => Boolean(d)), LIST_BOUNDS.chart)
      // A chart of negatives or of nothing but zeros is not a chart.
      if (!data || data.every((d) => d.value <= 0)) return degradeToBullets(raw, title)
      const unit = optionalText(raw.unit, 40)
      const takeaway = optionalText(firstOf(raw, "takeaway", "context", "insight"), LIMITS.takeaway)
      return { ...base, layout, title, data, ...(unit ? { unit } : {}), ...(takeaway ? { takeaway } : {}) }
    }
    case "closing": {
      if (!title) return null
      const subtitle = optionalText(firstOf(raw, "subtitle", "body", "cta"), LIMITS.subtitle)
      const contact = optionalText(firstOf(raw, "contact", "email", "website"), LIMITS.contact)
      return { ...base, layout, title, ...(subtitle ? { subtitle } : {}), ...(contact ? { contact } : {}) }
    }
  }
}

/** A batch of slides, in order, each held to the outline item it was asked for. */
export function normalizeSlides(value: unknown, expected: OutlineItem[] = []): Slide[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).slides)
      ? ((value as Record<string, unknown>).slides as unknown[])
      : []
  return list
    .map((item, index) => normalizeSlide(item, expected[index]?.layout || "bullets"))
    .filter((slide): slide is Slide => Boolean(slide))
}

/* ---------------------------------------------------------------- outline */

export function normalizeOutline(value: unknown, fallbackTitle: string, count: number): DeckOutline | null {
  const raw = (value && typeof value === "object" && !Array.isArray(value) ? value : { items: value }) as Record<string, unknown>
  const title = cleanText(firstOf(raw, "title", "deckTitle", "name"), LIMITS.title) || cleanText(fallbackTitle, LIMITS.title)
  const items = asArray(firstOf(raw, "items", "slides", "outline"))
    .map((item, index): OutlineItem | null => {
      if (typeof item === "string") {
        const text = cleanText(item, LIMITS.title)
        return text ? { title: text, point: "", layout: index === 0 ? "title" : "bullets" } : null
      }
      if (!item || typeof item !== "object") return null
      const r = item as Record<string, unknown>
      const itemTitle = cleanText(firstOf(r, "title", "headline", "heading"), LIMITS.title)
      if (!itemTitle) return null
      return {
        title: itemTitle,
        point: cleanText(firstOf(r, "point", "message", "summary", "description"), LIMITS.subtitle),
        layout: coerceLayout(firstOf(r, "layout", "type"), index === 0 ? "title" : "bullets"),
      }
    })
    .filter((item): item is OutlineItem => Boolean(item))
    .slice(0, clampSlideCount(count))

  if (items.length < MIN_SLIDES) return null

  // A deck opens with a cover and ends on a conclusion whatever the model
  // thought, because a deck that starts on bullet points looks unfinished.
  items[0] = { ...items[0], layout: "title" }
  const last = items[items.length - 1]
  if (last.layout !== "closing" && last.layout !== "quote") items[items.length - 1] = { ...last, layout: "closing" }

  return { title, items }
}

/* ------------------------------------------------------------ the request */

export function clampSlideCount(value: unknown) {
  const number = Math.round(Number(value))
  if (!Number.isFinite(number)) return DEFAULT_SLIDES
  return Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, number))
}

/** "на 8 слайдов", "12 slides", "8 слайдтан" → 8, 12, 8. */
export function extractSlideCount(text: string): number | null {
  const match = String(text || "").toLowerCase().match(/(\d{1,2})\s*(?:-?\s*)(?:слайд|slide|бет|кадр)/u)
  return match ? clampSlideCount(match[1]) : null
}

export function detectDeckLanguage(text: string): DeckLanguage {
  const value = String(text || "")
  if (/[әіңғүұқөһ]/iu.test(value)) return "kk"
  if (/[а-яё]/iu.test(value)) return "ru"
  return "en"
}

/**
 * Whether a chat message is asking for a deck to be made, as opposed to asking
 * about decks. "Сделай презентацию про кофейню" opens the studio; "как сделать
 * хорошую презентацию?" is a question and belongs in the chat. Getting the
 * second one wrong would hijack an ordinary conversation, so the rule is
 * strict: a deck noun, a making verb, and no sign of a how-to question.
 *
 * Note the absence of \b around Russian words: \b is defined on ASCII word
 * characters and never forms a boundary beside a Cyrillic letter.
 */
export function isPresentationCreationRequest(text: string): boolean {
  const value = String(text || "").trim().toLowerCase()
  if (!value || value.length > 1200) return false

  const noun = /презентаци|слайд|питч[- ]?дек|pitch[- ]?deck|slide[- ]?deck|\bdeck\b|\bpresentation\b|\bslides\b|таныстырылым/u
  if (!noun.test(value)) return false

  const verb = /(?:^|[\s,.!])(?:сделай|сделайте|создай|создайте|сгенерируй|сгенерируйте|подготовь|подготовьте|собери|соберите|напиши|сварганить|сварганишь|нужна|нужен|хочу|жаса|дайында|make|create|generate|build|design|prepare|need)(?=$|[\s,.!:])/u
  if (!verb.test(` ${value}`)) return false

  // Questions about how to make one are conversation, not a job.
  const howTo = /(?:^|[\s,.])(?:как|каким образом|почему|зачем|советы|совет|how|why|tips|advice|қалай)(?:$|[\s,.?])/u
  if (howTo.test(` ${value}`) && !/(?:сделай|создай|сгенерируй|make|create|generate)/u.test(value)) return false
  if (/^(?:как|how)\s/u.test(value)) return false

  return true
}

/** The topic without the command around it, for the studio's prompt field. */
export function presentationTopic(text: string): string {
  return String(text || "")
    .replace(/^\s*(?:пожалуйста|please|бро|брат)[,\s]+/iu, "")
    .replace(/^\s*(?:сделай(?:те)?|создай(?:те)?|сгенерируй(?:те)?|подготовь(?:те)?|собери(?:те)?|напиши|make|create|generate|build|prepare)\s+(?:мне\s+|me\s+|a\s+|an\s+)?/iu, "")
    .replace(/^\s*(?:презентаци[юяи]|питч[- ]?дек|pitch[- ]?deck|presentation|slide[- ]?deck|deck|слайды)\s*/iu, "")
    .replace(/^\s*(?:про|о|об|на тему|по теме|about|on|for|для)\s+/iu, "")
    // The slide count is a setting, not part of the topic: "про кофейню на 8
    // слайдов" is a deck about a coffee shop, 8 slides long.
    .replace(/[\s,]*(?:(?:на|из|в|in|with|of)\s+)?\d{1,2}\s*-?\s*(?:слайд\p{L}*|slides?|бет\p{L}*|кадр\p{L}*)/giu, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,.;:!-]+$/u, "")
    .trim() || String(text || "").trim()
}

/** Credits a deck of this many slides will cost, outline included. */
export function deckCost(slideCount: number) {
  return PRESENTATION_COSTS.outline + clampSlideCount(slideCount) * PRESENTATION_COSTS.slide
}

const DECK_LANGUAGES: DeckLanguage[] = ["ru", "kk", "en"]
const THEME_KEYS = ["obsidian", "paper", "ember", "forest", "sand", "royal"] as const

/**
 * A whole deck, read back from anywhere it could have been changed: a
 * browser's storage, an export request, an older build. Slides that no longer
 * validate are dropped rather than rendered half-broken.
 */
export function normalizeDeck(value: unknown): Deck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const slides = asArray(raw.slides)
    .map((slide) => normalizeSlide(slide))
    .filter((slide): slide is Slide => Boolean(slide))
    .slice(0, 30)
  if (!slides.length) return null

  const theme = (THEME_KEYS as readonly string[]).includes(String(raw.theme)) ? raw.theme as Deck["theme"] : "obsidian"
  const language = DECK_LANGUAGES.includes(raw.language as DeckLanguage) ? raw.language as DeckLanguage : "ru"
  const now = Date.now()
  return {
    id: typeof raw.id === "string" && /^[\w-]{3,64}$/.test(raw.id) ? raw.id : deckId(),
    title: cleanText(raw.title, LIMITS.title) || "Презентация",
    theme,
    language,
    slides,
    prompt: cleanText(raw.prompt, 4000),
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
  }
}
