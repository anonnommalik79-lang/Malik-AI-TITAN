import { BLUEPRINTS, ICONS, blueprintById, pickBlueprint, type Blueprint, type BookingKind, type DirectionId, type ForgeLocale, type IconId } from "./blueprints"
import { plannerSkillRules } from "./skills"

/**
 * Malik Site Forge — the content plan.
 *
 * The model fills a strict JSON plan with the site's words, prices and photo
 * searches; it never writes HTML. Whatever it leaves out or gets wrong is
 * filled from the blueprint, so a plan is always complete. The same plan is
 * embedded in the finished page, so a later «сделай зелёным» edits the plan
 * and the site is rendered again instead of being rewritten by hand.
 */

export const FORGE_VERSION = "malik-forge/v1"

export type Hours = { label: string; days: number[]; open: string; close: string }
export type CatalogItem = { id: string; name: string; description: string; price: number; from: boolean; category: string; badge: string; photo: string }

export type ForgePlan = {
  version: typeof FORGE_VERSION
  understood: string
  locale: ForgeLocale
  blueprint: string
  direction: DirectionId
  accent: string | null
  order: boolean
  brand: { name: string; tagline: string; description: string }
  /** eyebrow: the short line above the headline — what and where («Кофейня-обжарщик · Алматы»). */
  hero: { eyebrow?: string; title: string; subtitle: string; primaryCta: string; secondaryCta: string; badges: string[] }
  highlights: Array<{ icon: IconId; title: string; text: string }>
  catalog: { title: string; subtitle: string; currency: string; categories: Array<{ id: string; name: string }>; items: CatalogItem[] }
  about: { title: string; paragraphs: string[]; values: Array<{ title: string; text: string }> }
  steps: Array<{ title: string; text: string }>
  gallery: Array<{ photo: string; caption: string }>
  faq: Array<{ q: string; a: string }>
  booking: { kind: BookingKind; title: string; subtitle: string; services: string[] }
  contacts: { city: string; address: string; phone: string; email: string; whatsapp: string; telegram: string; instagram: string; hours: Hours[] }
  /** Contact fields that are examples because the request did not give them. */
  samples: string[]
  seo: { title: string; description: string }
}

export const DIRECTIONS: readonly DirectionId[] = ["roastery", "atelier", "edge", "clinic", "market", "gallery", "coast"]
const BOOKING_KINDS: readonly BookingKind[] = ["table", "appointment", "consultation", "stay", "lesson", "callback"]

export function forgeLocale(text: string): ForgeLocale {
  if (/[әіңғүұқөһ]/iu.test(text) || /(?:^|\s)(?:жаса|сайтын|сайт\s+жаса|маған|кофехана|дүкен)/iu.test(text)) return "kk"
  if (/[а-яё]/iu.test(text)) return "ru"
  return "en"
}

/* ------------------------------------------------------------- cleaning */

// eslint-disable-next-line no-control-regex -- removing control characters is the point
const CONTROL = /[\u0000-\u001f\u007f]/g
export function clean(value: unknown, max: number, fallback = "") {
  const text = String(value ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim()
  return (text || fallback).slice(0, max)
}
function list<T>(value: unknown, map: (entry: Record<string, unknown>, index: number) => T | null, max: number): T[] {
  return (Array.isArray(value) ? value : []).slice(0, max).map((entry, index) => map(entry && typeof entry === "object" ? entry as Record<string, unknown> : { value: entry }, index)).filter((entry): entry is T => entry !== null)
}
const strings = (value: unknown, max: number, chars: number) => (Array.isArray(value) ? value : []).map((entry) => clean(entry, chars)).filter(Boolean).slice(0, max)
const slug = (value: string, index: number) => value.toLowerCase().replace(/[^a-z0-9а-яёәіңғүұқөһ]+/giu, "-").replace(/^-+|-+$/g, "").slice(0, 32) || `c${index + 1}`

/** Words that mean nobody wrote real copy. */
const FILLER = /lorem ipsum|placeholder|заглушк|ваш\s+текст|ваша\s+компания|название\s+компании|your\s+company|company\s+name|coming\s+soon|\btodo\b|\btbd\b|replace\s+this|текст\s+здесь|описание\s+здесь|xxx+/iu

/* ---------------------------------------------------------------- hours */

const DAY_WORDS: Array<[RegExp, number]> = [
  [/^(?:пн|пон|mon|дс|дүй)/iu, 1], [/^(?:вт|tue|сс|сей)/iu, 2], [/^(?:ср|wed|ср|сәр)/iu, 3], [/^(?:чт|thu|бс|бей)/iu, 4],
  [/^(?:пт|fri|жм|жұм)/iu, 5], [/^(?:сб|sat|сн|сен)/iu, 6], [/^(?:вс|вос|sun|жс|жек)/iu, 0],
]
function dayIndex(word: string) {
  const found = DAY_WORDS.find(([pattern]) => pattern.test(word.trim()))
  return found ? found[1] : -1
}

/** «Пн–Пт», «Сб, Вс», «Ежедневно», «Daily», «Будни» → weekday numbers (0 = Sunday). */
export function parseDays(label: string): number[] {
  const text = clean(label, 60).toLowerCase()
  if (/ежеднев|каждый день|без выходных|daily|every day|7\/7|күн сайын|круглосуточ|24\/7/iu.test(text)) return [0, 1, 2, 3, 4, 5, 6]
  if (/будни|weekdays|жұмыс күн/iu.test(text)) return [1, 2, 3, 4, 5]
  if (/выходн|weekend|демалыс/iu.test(text)) return [6, 0]
  const days = new Set<number>()
  for (const part of text.split(/[,;/]+/)) {
    const [from, to] = part.split(/[–—-]|\s+до\s+|\s+to\s+/).map((word) => dayIndex(word))
    if (from >= 0 && to >= 0) {
      const order = [1, 2, 3, 4, 5, 6, 0]
      const start = order.indexOf(from), end = order.indexOf(to)
      for (let at = start; at <= (end >= start ? end : start); at++) days.add(order[at])
    } else if (from >= 0) days.add(from)
  }
  return [...days]
}

const TIME = /^(?:[01]?\d|2[0-4]):[0-5]\d$/
function time(value: unknown, fallback: string) {
  const text = clean(value, 5).replace(".", ":")
  return TIME.test(text) ? text.padStart(5, "0") : fallback
}

/* ------------------------------------------------------------- fallback */

const NAMES: Record<string, string[]> = {
  coffee: ["Зерно", "Обжарка", "Утро", "Crema"], restaurant: ["Огонь", "Терраса", "Дастархан"], beauty: ["Лён", "Аура", "Bloom"],
  barber: ["Бритва", "Шеф", "Old Town"], fitness: ["Импульс", "Форма", "Kinetic"], clinic: ["Дента Плюс", "Здоровье", "Медика"],
  hotel: ["Горный воздух", "Тишина", "Nomad"], shop: ["Полка", "Ателье", "North"], studio: ["Ориентир", "Квадрат", "Atlas"], generic: ["Ориентир"],
}
const NAMES_EN: Record<string, string[]> = {
  coffee: ["Grain", "Daybreak", "Crema"], restaurant: ["Ember", "Terrace", "Hearth"], beauty: ["Linen", "Aura", "Bloom"], barber: ["Razor", "Old Town"],
  fitness: ["Kinetic", "Pulse"], clinic: ["Bright Dental", "Wellpoint"], hotel: ["Quiet Peak", "Nomad"], shop: ["Shelf", "North"], studio: ["Atlas", "Northline"], generic: ["Atlas"],
}

/** A name the request gives: «кофейня «Арома»», "called Aroma", под названием X. */
export function nameFromPrompt(prompt: string) {
  const quoted = prompt.match(/[«"“„']([^»"”'\n]{2,40})[»"”']/u)?.[1]
  if (quoted && !/^(?:сайт|website|site)$/iu.test(quoted.trim())) return quoted.trim()
  const named = prompt.match(/(?:под названием|с названием|назван\p{L}*|называется|called|named|атауы)\s+([\p{L}\p{N}][\p{L}\p{N}&' .-]{1,30})/iu)?.[1]
  return named ? named.trim().replace(/[.,!?]+$/, "") : ""
}

function hash(text: string) {
  let value = 0
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0
  return value
}

const HOURS: Record<string, Array<[string, number[], string, string]>> = {
  coffee: [["Ежедневно", [0, 1, 2, 3, 4, 5, 6], "08:00", "22:00"]],
  restaurant: [["Ежедневно", [0, 1, 2, 3, 4, 5, 6], "11:00", "23:00"]],
  beauty: [["Ежедневно", [0, 1, 2, 3, 4, 5, 6], "09:00", "21:00"]],
  barber: [["Ежедневно", [0, 1, 2, 3, 4, 5, 6], "10:00", "21:00"]],
  fitness: [["Ежедневно", [0, 1, 2, 3, 4, 5, 6], "07:00", "23:00"]],
  clinic: [["Пн–Сб", [1, 2, 3, 4, 5, 6], "09:00", "20:00"]],
  hotel: [["Круглосуточно", [0, 1, 2, 3, 4, 5, 6], "00:00", "24:00"]],
  shop: [["Ежедневно", [0, 1, 2, 3, 4, 5, 6], "10:00", "21:00"]],
  studio: [["Пн–Пт", [1, 2, 3, 4, 5], "09:00", "18:00"]],
}
const DAY_LABEL_EN: Record<string, string> = { "Ежедневно": "Daily", "Пн–Сб": "Mon–Sat", "Пн–Пт": "Mon–Fri", "Круглосуточно": "24/7" }
const DAY_LABEL_KK: Record<string, string> = { "Ежедневно": "Күн сайын", "Пн–Сб": "Дс–Сн", "Пн–Пт": "Дс–Жм", "Круглосуточно": "Тәулік бойы" }

const CTA: Record<ForgeLocale, Record<BookingKind, string>> = {
  ru: { table: "Забронировать стол", appointment: "Записаться", consultation: "Оставить заявку", stay: "Забронировать номер", lesson: "Записаться на пробное", callback: "Задать вопрос" },
  kk: { table: "Үстел брондау", appointment: "Жазылу", consultation: "Өтінім қалдыру", stay: "Нөмір брондау", lesson: "Сынақ сабаққа жазылу", callback: "Сұрақ қою" },
  en: { table: "Book a table", appointment: "Book now", consultation: "Get in touch", stay: "Book a room", lesson: "Book a free trial", callback: "Ask a question" },
}
const BOOKING_NOTE: Record<ForgeLocale, Record<BookingKind, string>> = {
  ru: { table: "Выберите дату, время и число гостей — мы подтвердим бронь сообщением.", appointment: "Выберите услугу и удобное время — подтвердим запись сообщением.", consultation: "Опишите задачу — мы свяжемся в рабочее время.", stay: "Выберите даты и число гостей — подтвердим, что номер свободен.", lesson: "Первое занятие бесплатно. Выберите день и время.", callback: "Задайте вопрос — ответим в течение рабочего дня." },
  kk: { table: "Күнді, уақытты және қонақтар санын таңдаңыз — брондауды хабарламамен растаймыз.", appointment: "Қызмет пен ыңғайлы уақытты таңдаңыз — жазылуды хабарламамен растаймыз.", consultation: "Міндетті сипаттаңыз — жұмыс уақытында хабарласамыз.", stay: "Күндер мен қонақтар санын таңдаңыз — нөмірдің бос екенін растаймыз.", lesson: "Алғашқы сабақ тегін. Күн мен уақытты таңдаңыз.", callback: "Сұрағыңызды жазыңыз — жұмыс күні ішінде жауап береміз." },
  en: { table: "Pick a date, time and party size — we confirm by message.", appointment: "Pick a service and a time — we confirm by message.", consultation: "Tell us about the task — we reply during working hours.", stay: "Pick your dates and guests — we confirm the room is free.", lesson: "The first session is free. Pick a day and time.", callback: "Ask anything — we answer within a working day." },
}

/** «Смотреть меню», «See rooms», «Көру: Нөмірлер». */
function browseLabel(locale: ForgeLocale, catalog: string) {
  if (locale === "en") return `See ${catalog.toLowerCase()}`
  if (locale === "kk") return `Көру: ${catalog.toLowerCase()}`
  return `Смотреть ${catalog.toLowerCase()}`
}

function currencyFor(prompt: string, locale: ForgeLocale) {
  if (/руб|₽|росси|москв|петербург|russia|moscow/iu.test(prompt)) return "₽"
  if (/\$|usd|доллар|dollar|сша|usa|new york|нью-йорк/iu.test(prompt)) return "$"
  if (/€|eur|евро|europe|европ|berlin|paris/iu.test(prompt)) return "€"
  if (/сом\b|кыргыз|бишкек|kgs/iu.test(prompt)) return "сом"
  if (/сум\b|узбек|ташкент|uzs/iu.test(prompt)) return "сум"
  return locale === "en" ? "$" : "₸"
}

const CITIES = /(Алмат[ыа]|Астан[аеы]|Шымкент[еа]?|Караганд[аые]|Актобе|Актау|Атырау|Павлодар[еа]?|Костана[йе]|Усть-Каменогорск[еа]?|Тараз[еа]?|Туркестан[еа]?|Кызылорд[аые]|Семе[йе]|Петропавловск[еа]?|Бишкек[еа]?|Ташкент[еа]?|Москв[аеы]|Санкт-Петербург[еа]?|Новосибирск[еа]?|Казан[ьи]|Almaty|Astana|Shymkent|Bishkek|Tashkent|Moscow|London|Dubai|New York|Berlin|Paris|Istanbul)/u
const CITY_BASE: Record<string, string> = { "Алматы": "Алматы", "Алмате": "Алматы", "Астане": "Астана", "Астаны": "Астана", "Шымкенте": "Шымкент", "Караганде": "Караганда", "Караганды": "Караганда", "Москве": "Москва", "Москвы": "Москва", "Бишкеке": "Бишкек", "Ташкенте": "Ташкент", "Казани": "Казань" }

export function cityFromPrompt(prompt: string) {
  const match = prompt.match(CITIES)?.[1]
  return match ? CITY_BASE[match] || match.replace(/[еы]$/u, (end) => (end === "е" && /Астан|Москв/u.test(match) ? "а" : end)) : ""
}

/** The complete plan built from the blueprint alone: used when no model answers, and as the base every model plan is merged onto. */
export function fallbackPlan(prompt: string, blueprintInput?: Blueprint): ForgePlan {
  const locale = forgeLocale(prompt)
  const blueprint = blueprintInput || pickBlueprint(prompt)
  const copy = locale === "en" ? blueprint.fallback.en : blueprint.fallback.ru
  const names = (locale === "en" ? NAMES_EN : NAMES)[blueprint.id] || (locale === "en" ? NAMES_EN : NAMES).generic
  const brand = nameFromPrompt(prompt) || names[hash(prompt) % names.length]
  const city = cityFromPrompt(prompt) || (locale === "en" ? "" : "Алматы")
  const hours = (HOURS[blueprint.id] || HOURS.studio).map(([label, days, open, close]) => ({ label: locale === "en" ? DAY_LABEL_EN[label] || label : locale === "kk" ? DAY_LABEL_KK[label] || label : label, days, open, close }))
  const items = copy.items.map((item, index) => ({ id: `i${index + 1}`, name: item.name, description: item.description, price: item.price, from: false, category: item.category, badge: item.badge || "", photo: item.photo }))
  return {
    version: FORGE_VERSION,
    understood: "",
    locale,
    blueprint: blueprint.id,
    direction: blueprint.direction,
    accent: null,
    order: blueprint.order,
    brand: { name: brand, tagline: copy.tagline, description: copy.heroSubtitle },
    hero: { eyebrow: city, title: copy.heroTitle(brand), subtitle: copy.heroSubtitle, primaryCta: CTA[locale][blueprint.booking.kind], secondaryCta: browseLabel(locale, blueprint.catalog[locale]), badges: copy.highlights.slice(0, 3).map((item) => item.title) },
    highlights: copy.highlights,
    catalog: { title: blueprint.catalog[locale], subtitle: copy.tagline, currency: currencyFor(prompt, locale), categories: copy.categories, items },
    about: { title: copy.aboutTitle, paragraphs: copy.about, values: copy.values },
    steps: copy.steps,
    gallery: blueprint.photos.gallery.map((photo) => ({ photo, caption: "" })),
    faq: copy.faq,
    booking: { kind: blueprint.booking.kind, title: blueprint.booking.label[locale], subtitle: BOOKING_NOTE[locale][blueprint.booking.kind], services: copy.services.length ? copy.services : items.slice(0, 6).map((item) => item.name) },
    contacts: { city, address: "", phone: "", email: "", whatsapp: "", telegram: "", instagram: "", hours },
    samples: [],
    seo: { title: `${brand} — ${copy.tagline}`.slice(0, 70), description: copy.heroSubtitle.slice(0, 160) },
  }
}

/* ---------------------------------------------------------------- merge */

function jsonCandidate(raw: string) {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || text
  const start = fenced.indexOf("{")
  const end = fenced.lastIndexOf("}")
  return start >= 0 && end > start ? fenced.slice(start, end + 1) : ""
}

function priceOf(value: unknown): { price: number; from: boolean } | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return { price: value, from: false }
  const text = clean(value, 40)
  const from = /^(?:от|from|бастап)\s/iu.test(text) || /\+$/.test(text)
  const number = Number(text.replace(/[^\d.,]/g, "").replace(/\s/g, "").replace(",", "."))
  return text && Number.isFinite(number) && /\d/.test(text) ? { price: number, from } : null
}

const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)

/** The model's plan merged onto the blueprint: every field valid, nothing missing. */
export function mergePlan(raw: unknown, base: ForgePlan): ForgePlan {
  let data: Record<string, unknown> = {}
  if (raw && typeof raw === "object") data = raw as Record<string, unknown>
  else {
    try { data = JSON.parse(jsonCandidate(String(raw || ""))) as Record<string, unknown> } catch { data = {} }
  }
  if (FILLER.test(JSON.stringify(data))) data = stripFiller(data)
  const obj = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {})
  const blueprint = blueprintById(data.blueprint)
  const brand = obj(data.brand), hero = obj(data.hero), catalog = obj(data.catalog), about = obj(data.about), booking = obj(data.booking), contacts = obj(data.contacts), seo = obj(data.seo)

  const categories = list(catalog.categories, (entry, index) => {
    const name = clean(entry.name ?? entry.value, 40)
    return name ? { id: slug(clean(entry.id, 32) || name, index), name } : null
  }, 8)
  const categoryIds = new Set(categories.map((category) => category.id))
  const items = list(catalog.items, (entry, index) => {
    const name = clean(entry.name, 60)
    const price = priceOf(entry.price)
    if (!name || !price) return null
    let category = slug(clean(entry.category, 32), index)
    if (!categoryIds.has(category)) {
      const byName = categories.find((item) => item.name.toLowerCase() === clean(entry.category, 40).toLowerCase())
      category = byName?.id || categories[0]?.id || "main"
    }
    return { id: `i${index + 1}`, name, description: clean(entry.description, 160), price: price.price, from: price.from, category, badge: clean(entry.badge, 18), photo: clean(entry.photo, 60) || name }
  }, 24)
  const useCatalog = items.length >= 4 && categories.length >= 1

  const hours = list(contacts.hours, (entry) => {
    const label = clean(entry.label ?? entry.days, 30)
    const days = Array.isArray(entry.days) ? (entry.days as unknown[]).map(Number).filter((day) => day >= 0 && day <= 6) : parseDays(label)
    if (!label || !days.length) return null
    return { label, days, open: time(entry.open, "09:00"), close: time(entry.close, "21:00") }
  }, 4)

  const pairs = (value: unknown, a: string, b: string, max: number, min: number, fallback: Array<Record<string, string>>) => {
    const got = list(value, (entry) => {
      const first = clean(entry[a], 90), second = clean(entry[b], 320)
      return first && second ? { [a]: first, [b]: second } : null
    }, max)
    return got.length >= min ? got : fallback
  }

  const highlights = list(data.highlights, (entry) => {
    const title = clean(entry.title, 48), text = clean(entry.text, 160)
    if (!title || !text) return null
    const icon = ICONS.includes(entry.icon as IconId) ? entry.icon as IconId : "check"
    return { icon, title, text }
  }, 6)

  const accent = isHex(data.accent) ? data.accent : null
  const direction = DIRECTIONS.includes(data.direction as DirectionId) ? data.direction as DirectionId : blueprint?.direction || base.direction
  const kind = BOOKING_KINDS.includes(booking.kind as BookingKind) ? booking.kind as BookingKind : base.booking.kind
  const name = clean(brand.name, 40) || base.brand.name

  return {
    ...base,
    understood: clean(data.understood, 300),
    blueprint: blueprint?.id || base.blueprint,
    direction,
    accent,
    order: typeof data.order === "boolean" ? data.order && useCatalog : base.order,
    brand: { name, tagline: clean(brand.tagline, 90, base.brand.tagline), description: clean(brand.description, 240, base.brand.description) },
    hero: {
      eyebrow: clean(hero.eyebrow, 48) || base.hero.eyebrow || "",
      title: clean(hero.title, 90) || base.hero.title.replace(base.brand.name, name),
      subtitle: clean(hero.subtitle, 220, base.hero.subtitle),
      primaryCta: clean(hero.primaryCta, 28, base.hero.primaryCta),
      secondaryCta: clean(hero.secondaryCta, 28, base.hero.secondaryCta),
      badges: strings(hero.badges, 3, 40).length ? strings(hero.badges, 3, 40) : base.hero.badges,
    },
    highlights: highlights.length >= 3 ? highlights : base.highlights,
    catalog: {
      title: clean(catalog.title, 30, base.catalog.title),
      subtitle: clean(catalog.subtitle, 160, base.catalog.subtitle),
      currency: clean(catalog.currency, 4, base.catalog.currency),
      categories: useCatalog ? categories.filter((category) => items.some((item) => item.category === category.id)) : base.catalog.categories,
      items: useCatalog ? items : base.catalog.items,
    },
    about: {
      title: clean(about.title, 90, base.about.title),
      paragraphs: strings(about.paragraphs ?? about.text, 3, 600).length ? strings(about.paragraphs ?? about.text, 3, 600) : base.about.paragraphs,
      values: pairs(about.values, "title", "text", 4, 2, base.about.values) as ForgePlan["about"]["values"],
    },
    steps: pairs(data.steps, "title", "text", 4, 3, base.steps) as ForgePlan["steps"],
    gallery: (() => {
      const got = list(data.gallery, (entry) => {
        const photo = clean(entry.photo ?? entry.value, 60)
        return photo ? { photo, caption: clean(entry.caption, 80) } : null
      }, 8)
      return got.length >= 4 ? got : base.gallery
    })(),
    faq: pairs(data.faq, "q", "a", 8, 3, base.faq) as ForgePlan["faq"],
    booking: {
      kind,
      title: clean(booking.title, 40, base.booking.title),
      subtitle: clean(booking.subtitle, 200, base.booking.subtitle),
      services: strings(booking.services, 10, 50).length >= 2 ? strings(booking.services, 10, 50) : base.booking.services,
    },
    contacts: {
      city: clean(contacts.city, 40, base.contacts.city),
      address: clean(contacts.address, 120),
      phone: clean(contacts.phone, 24).replace(/[^\d+()\s-]/g, ""),
      email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(clean(contacts.email, 80)) ? clean(contacts.email, 80) : "",
      whatsapp: clean(contacts.whatsapp, 24).replace(/[^\d+]/g, ""),
      telegram: clean(contacts.telegram, 40).replace(/^@|^https?:\/\/t\.me\//i, "").replace(/[^\w]/g, ""),
      instagram: clean(contacts.instagram, 40).replace(/^@|^https?:\/\/(?:www\.)?instagram\.com\//i, "").replace(/[^\w.]/g, ""),
      hours: hours.length ? hours : base.contacts.hours,
    },
    seo: { title: clean(seo.title, 70, `${name} — ${base.brand.tagline}`.slice(0, 70)), description: clean(seo.description, 160, base.seo.description) },
  }
}

function stripFiller(value: Record<string, unknown>): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return FILLER.test(node) ? "" : node
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]))
    return node
  }
  return walk(value) as Record<string, unknown>
}

/** Contacts the request did not give become clearly editable examples, and are listed. */
export function withSampleContacts(plan: ForgePlan, prompt: string): ForgePlan {
  const samples: string[] = []
  const contacts = { ...plan.contacts }
  const phoneInPrompt = prompt.match(/(?:\+?\d[\d\s()-]{8,}\d)/)?.[0]
  if (phoneInPrompt) contacts.phone = phoneInPrompt.trim()
  const emailInPrompt = prompt.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i)?.[0]
  if (emailInPrompt) contacts.email = emailInPrompt
  // A phone or address the model wrote without the user giving one is invented: it becomes a marked example.
  if (!phoneInPrompt) { contacts.phone = plan.locale === "en" ? "+1 555 010 0000" : "+7 700 000 00 00"; samples.push("phone") }
  // example.com is reserved for examples: an order can never reach a stranger's inbox.
  if (!emailInPrompt) { contacts.email = "hello@example.com"; samples.push("email") }
  if (!contacts.whatsapp) contacts.whatsapp = contacts.phone.replace(/[^\d]/g, "")
  if (!/(?:ул\.|улица|пр\.|проспект|мкр|street|st\.|avenue|ave\.|көшесі|даңғылы)\s*\S+/iu.test(prompt)) {
    contacts.address = plan.locale === "en" ? "12 Market Street" : plan.locale === "kk" ? "Абай даңғылы, 10" : "пр. Абая, 10"
    samples.push("address")
  } else contacts.address = contacts.address || prompt.match(/(?:ул\.|улица|пр\.|проспект|мкр|street|st\.|avenue|ave\.|көшесі|даңғылы)\s*[^,\n]{2,60}/iu)?.[0] || ""
  return { ...plan, contacts, samples }
}

/* -------------------------------------------------------------- prompting */

export function plannerPrompt(prompt: string, base: ForgePlan, feedback: string[] = []) {
  const blueprintIds = BLUEPRINTS.map((item) => item.id).join("|")
  return [
    "You are the content lead of a top web studio. Write the complete content plan for a multi-page website as ONE JSON object. Never write HTML, CSS or Markdown.",
    "",
    "Read the request past typos, slang and wrong keyboard layouts. Work out the real business, city, audience and what visitors must be able to do.",
    `Write every visible text in ${base.locale === "kk" ? "Kazakh" : base.locale === "en" ? "English" : "Russian"}. Photo searches ("photo" fields) are short ENGLISH queries describing a real photograph of that exact thing.`,
    "",
    "COPY RULES:",
    "- The hero title says what this place is and why to come, in under 9 words. Never «Добро пожаловать», «Welcome», «Наш сайт».",
    "- Write like a sharp local copywriter: concrete, sensory, specific to this business. No hype words (лучший, уникальный, инновационный, premium quality) unless the user used them.",
    "- Keep every name, price, item, address, phone, hours and city the user gave, exactly.",
    "- Prices are realistic local prices as numbers in the local currency. «от» prices may be strings like «от 5000».",
    "- 8 to 14 catalogue items in 3 to 5 categories; each description is one appetising, factual sentence.",
    "- Never invent reviews, ratings, awards, years in business, staff names or press quotes.",
    "- If the user gave no phone, email or address, leave those fields as empty strings.",
    "- hero.eyebrow is 2-5 words above the headline: the kind of place and the city («Кофейня-обжарщик · Алматы»).",
    ...(() => { const rules = plannerSkillRules(prompt, base.blueprint); return rules.length ? ["", "DESIGN-SYSTEM COPY RULES (from the skills this site uses):", ...rules] : [] })(),
    "",
    "SHAPE (all keys required):",
    JSON.stringify({
      understood: "one sentence in the user's language: what was asked",
      blueprint: blueprintIds,
      direction: DIRECTIONS.join("|"),
      accent: "#RRGGBB that fits the subject, or null",
      order: "true if visitors should be able to order items to a basket",
      brand: { name: "string", tagline: "string", description: "string" },
      hero: { eyebrow: "string", title: "string", subtitle: "string", primaryCta: "string", secondaryCta: "string", badges: ["three short facts"] },
      highlights: [{ icon: ICONS.join("|"), title: "string", text: "string" }],
      catalog: { title: "string", subtitle: "string", currency: "₸|₽|$|€|сом", categories: [{ id: "latin-id", name: "string" }], items: [{ name: "string", description: "string", price: 1200, category: "category id", badge: "optional short label", photo: "english photo query" }] },
      about: { title: "string", paragraphs: ["2-3 paragraphs"], values: [{ title: "string", text: "string" }] },
      steps: [{ title: "string", text: "string" }],
      gallery: [{ photo: "english photo query", caption: "string" }],
      faq: [{ q: "string", a: "string" }],
      booking: { kind: BOOKING_KINDS.join("|"), title: "string", subtitle: "string", services: ["what can be booked"] },
      contacts: { city: "string", address: "", phone: "", email: "", whatsapp: "", telegram: "", instagram: "", hours: [{ label: "Пн–Пт", open: "08:00", close: "22:00" }] },
      seo: { title: "string", description: "string" },
    }),
    "",
    `Suggested blueprint: ${base.blueprint}. Suggested direction: ${base.direction}. Change them only if the request clearly fits another.`,
    ...(feedback.length ? ["", "YOUR PREVIOUS PLAN WAS REJECTED. Fix exactly this:", ...feedback.map((line) => `- ${line}`)] : []),
    "",
    "USER REQUEST:",
    prompt.slice(0, 4000),
    "",
    "Return JSON only.",
  ].join("\n")
}

/** What a reviewer would reject before showing the site to the client. */
export function reviewPlan(raw: unknown, merged: ForgePlan): string[] {
  const issues: string[] = []
  let data: Record<string, unknown>
  try { data = typeof raw === "string" ? JSON.parse(jsonCandidate(raw)) : (raw as Record<string, unknown>) || {} } catch { return ["the answer was not valid JSON"] }
  const catalog = (data.catalog || {}) as Record<string, unknown>
  if (!Array.isArray(catalog.items) || catalog.items.length < 6) issues.push("catalog.items must have 8-14 items with numeric prices")
  if (!Array.isArray(data.highlights) || data.highlights.length < 3) issues.push("highlights needs 3-6 entries")
  if (!Array.isArray(data.faq) || data.faq.length < 3) issues.push("faq needs 4-6 questions")
  const title = String(((data.hero || {}) as Record<string, unknown>).title || "")
  if (title.split(/\s+/).length < 3 || /добро пожаловать|welcome/iu.test(title)) issues.push("hero.title must name this place and its reason to visit")
  if (FILLER.test(JSON.stringify(data))) issues.push("remove placeholder text")
  if (merged.locale !== "en" && /^[\x20-\x7e]+$/.test(String(((data.hero || {}) as Record<string, unknown>).subtitle || "x"))) issues.push(`texts must be in ${merged.locale === "kk" ? "Kazakh" : "Russian"}`)
  return issues
}
