import { pickBlueprint, type ForgeLocale } from "./blueprints"
import { readForgeSite, type ForgeResult } from "./index"
import { forgeLocale, type ForgePlan } from "./plan"
import type { PhotoMap } from "./render"

/**
 * Malik Site Forge in the chat: which requests it takes, how the answer reads,
 * and how a finished site stays out of the model's context afterwards.
 */

type Message = { role?: string; content?: unknown }

const SITE_NOUN = /(?<!\p{L})(?:сайт\p{L}*|лендинг\p{L}*|landing(?:\s+page)?|website|web\s*site|веб[- ]?сайт\p{L}*|homepage|home\s+page|интернет-магазин\p{L}*|онлайн-магазин\p{L}*|одностраничник\p{L}*)/iu
const CREATE = /(?<!\p{L})(?:созда\p{L}*|сдела\p{L}*|сгенерир\p{L}*|разработа\p{L}*|собери|собрать|построй|запили|сверстай|нужен|нужна|хочу|make|build|create|generate|design|need|want|жаса\p{L}*|құр\p{L}*)(?!\p{L})/iu
/** A named stack, a backend or a repository: the model writes that code itself. */
const STACK = /(?<![\p{L}\p{N}])(?:react|next\.?js|vue|nuxt|angular|svelte|tailwind|typescript|php|laravel|django|flask|wordpress|тильд\p{L}*|tilda|wix|node\.?js|express|vite|astro|bootstrap|jquery|backend|бэкенд|бекенд|api|баз\p{L}*\s+данн\p{L}*|database|full[- ]?stack|zip|репозитори\p{L}*|github|python)(?![\p{L}\p{N}])/iu
const QUESTION = /^\s*(?:как|сколько|почему|зачем|что такое|какой|какая|какие|где|how|what|why|which|where|қалай|қанша)(?!\p{L})/iu
const NOT_BUILD = /(?<!\p{L})(?:исправь|почини|проверь|проанализируй|оцени|аудит|audit|review|fix|debug|переведи|translate)(?!\p{L})/iu
const EDIT = /(?<!\p{L})(?:поменя\p{L}*|измени\p{L}*|замени\p{L}*|добав\p{L}*|убер\p{L}*|убра\p{L}*|удали\p{L}*|перекрас\p{L}*|переимену\p{L}*|переделай|перепиши|сделай\s+(?:его|её|сайт|фон|цвет|кнопк\p{L}*|шрифт\p{L}*|темн\p{L}*|светл\p{L}*|ярч\p{L}*|по-друг\p{L}*|меню|цен\p{L}*)|темнее|светлее|ярче|цвет\p{L}*|шрифт\p{L}*|change|make\s+it|add|remove|replace|rename|darker|lighter|colou?r|font|өзгерт\p{L}*|қос\p{L}*)(?!\p{L})/iu
/** Commands, as opposed to wondering aloud («что ещё можно добавить?»). */
const IMPERATIVE = /(?<!\p{L})(?:поменяй|измени|замени|добавь|убери|удали|перекрась|переименуй|переделай|перепиши|сделай|верни|покрась|change|make|add|remove|replace|rename|өзгерт|қос)(?!\p{L})/iu
const NEW_SITE = /(?<!\p{L})(?:нов\p{L}*|друг\p{L}*|ещё\s+один|еще\s+один|another|new)(?!\p{L})/iu

export type ForgeTurn = { kind: "new" } | { kind: "edit"; plan: ForgePlan; photos: PhotoMap }

/** The last forge site the assistant made in this chat, if any (read from the full messages). */
export function lastForgeSite(messages: unknown): { plan: ForgePlan; photos: PhotoMap } | null {
  const list = Array.isArray(messages) ? messages as Message[] : []
  for (let index = list.length - 1, seen = 0; index >= 0 && seen < 8; index -= 1, seen += 1) {
    const message = list[index]
    if (message?.role !== "assistant" || typeof message.content !== "string") continue
    const site = readForgeSite(message.content)
    if (site) return site
  }
  return null
}

/** Whether this chat turn belongs to the forge: a new site, a change to the last one, or neither. */
export function siteForgeTurn(prompt: string, input: { messages?: unknown; attachments?: unknown } = {}): ForgeTurn | null {
  const text = String(prompt || "").trim()
  if (!text || text.length > 6000) return null
  if (Array.isArray(input.attachments) && input.attachments.length) return null
  if (/https?:\/\/|```/i.test(text) || STACK.test(text) || NOT_BUILD.test(text)) return null
  const asksForSite = SITE_NOUN.test(text) && CREATE.test(text) && !QUESTION.test(text)
  const previous = lastForgeSite(input.messages)
  if (previous) {
    const otherBusiness = asksForSite && pickBlueprint(text).id !== "generic" && pickBlueprint(text).id !== previous.plan.blueprint
    if (asksForSite && (otherBusiness || NEW_SITE.test(text))) return { kind: "new" }
    const wondering = /\?\s*$/.test(text) && !IMPERATIVE.test(text)
    if (EDIT.test(text) && !QUESTION.test(text) && !wondering) return { kind: "edit", plan: previous.plan, photos: previous.photos }
  }
  return asksForSite ? { kind: "new" } : null
}

const COPY: Record<ForgeLocale, {
  ready: (name: string, count: number, pages: string) => string; updated: (name: string) => string; works: string; order: string; booking: Record<string, string>
  catalog: string; menu: string; gallery: string; map: string; samples: (fields: string) => string; fields: Record<string, string>; photosCurated: string; photosFound: string; photosNone: string
  next: string; fallback: string; pageNames: Record<string, string>
}> = {
  ru: {
    ready: (name, count, pages) => `**Сайт «${name}» готов** — ${count} страниц: ${pages}.`,
    updated: (name) => `**Сайт «${name}» обновлён.** Изменения внесены, всё остальное осталось как было.`,
    works: "Что уже работает", order: "корзина с заказом в WhatsApp, Telegram или на почту", catalog: "поиск, фильтры и сортировка в каталоге", menu: "меню для телефона",
    booking: { table: "бронь стола с выбором времени и добавлением в календарь", appointment: "запись на услугу со свободным временем и календарём", consultation: "заявка с отправкой в мессенджер", stay: "бронирование номера по датам", lesson: "запись на пробное занятие", callback: "форма вопроса" },
    gallery: "галерея на весь экран", map: "карта, часы работы и «открыто сейчас»",
    samples: (fields) => `**Перед публикацией замените** ${fields} — сейчас там примеры. Все контакты собраны в одном месте: \`window.SITE_CONFIG\` в конце файла.`,
    fields: { phone: "телефон", email: "почту", address: "адрес" },
    photosCurated: "Фото подобраны по теме из бесплатной библиотеки Unsplash (можно использовать в коммерческих проектах).", photosFound: "Фото найдены по теме; авторы и лицензии указаны внизу сайта.", photosNone: "Фото подставить не удалось — на их местах аккуратные цветные плитки, их можно заменить своими снимками.",
    next: "Можно попросить: «сделай темнее», «добавь в меню раф за 1800», «поменяй название на …».",
    fallback: "Тексты взяты из шаблона Malik для этой отрасли: модель сейчас не ответила. Напишите «перепиши тексты под мою кофейню», когда захотите обновить.",
    pageNames: { home: "Главная", catalog: "", about: "О нас", gallery: "Галерея", booking: "", contacts: "Контакты" },
  },
  kk: {
    ready: (name, count, pages) => `**«${name}» сайты дайын** — ${count} бет: ${pages}.`,
    updated: (name) => `**«${name}» сайты жаңартылды.** Өзгерістер енгізілді, қалғаны сол күйінде.`,
    works: "Не жұмыс істейді", order: "себет және WhatsApp, Telegram немесе поштаға тапсырыс", catalog: "каталогта іздеу, сүзгілер және сұрыптау", menu: "телефонға арналған мәзір",
    booking: { table: "уақыт таңдап үстел брондау және күнтізбеге қосу", appointment: "бос уақытқа жазылу және күнтізбе", consultation: "мессенджерге өтінім", stay: "күндер бойынша нөмір брондау", lesson: "сынақ сабаққа жазылу", callback: "сұрақ формасы" },
    gallery: "толық экранды галерея", map: "карта, жұмыс уақыты және «қазір ашық»",
    samples: (fields) => `**Жарияламас бұрын ауыстырыңыз:** ${fields} — қазір онда мысалдар. Барлық байланыс бір жерде: файлдың соңындағы \`window.SITE_CONFIG\`.`,
    fields: { phone: "телефон", email: "пошта", address: "мекенжай" },
    photosCurated: "Фотолар тақырып бойынша Unsplash тегін кітапханасынан алынды.", photosFound: "Фотолар тақырып бойынша табылды; авторлары сайттың төменгі жағында көрсетілген.", photosNone: "Фото қою мүмкін болмады — орнында түсті плиткалар тұр, өз суреттеріңізбен ауыстыруға болады.",
    next: "Сұрауға болады: «қараңғырақ қыл», «мәзірге раф қос», «атауын … деп өзгерт».",
    fallback: "Мәтіндер Malik үлгісінен алынды: модель қазір жауап бермеді.",
    pageNames: { home: "Басты бет", catalog: "", about: "Біз туралы", gallery: "Галерея", booking: "", contacts: "Байланыс" },
  },
  en: {
    ready: (name, count, pages) => `**${name} is ready** — ${count} pages: ${pages}.`,
    updated: (name) => `**${name} is updated.** The change is in; everything else stayed as it was.`,
    works: "Already working", order: "a basket that sends orders to WhatsApp, Telegram or email", catalog: "search, filters and sorting in the catalogue", menu: "a phone menu",
    booking: { table: "table booking with time slots and add-to-calendar", appointment: "appointments with free times and calendar", consultation: "an enquiry form sent to messengers", stay: "room booking by dates", lesson: "free trial booking", callback: "a question form" },
    gallery: "a full-screen gallery", map: "a map, opening hours and an «open now» badge",
    samples: (fields) => `**Before publishing, replace** the ${fields} — they are examples. All contacts live in one place: \`window.SITE_CONFIG\` at the end of the file.`,
    fields: { phone: "phone", email: "email", address: "address" },
    photosCurated: "Photos are on-topic picks from the free Unsplash library (commercial use allowed).", photosFound: "Photos were found for the topic; authors and licences are credited in the footer.", photosNone: "No photos could be placed — calm colour tiles hold their spots; swap in your own pictures.",
    next: "Try next: «make it darker», «add a flat white for $5 to the menu», «rename it to …».",
    fallback: "The copy comes from Malik's template for this business: the model did not answer just now. Ask «rewrite the copy for my business» later.",
    pageNames: { home: "Home", catalog: "", about: "About", gallery: "Gallery", booking: "", contacts: "Contact" },
  },
}

/** The chat answer: what was made, what works, what to replace, and the file itself. */
export function forgeChatMessage(result: ForgeResult, mode: "new" | "edit") {
  const plan = result.plan
  const copy = COPY[plan.locale]
  const names = result.pages.map((page) => copy.pageNames[page] || (page === "catalog" ? plan.catalog.title : page === "booking" ? plan.booking.title : page))
  const works = [plan.order ? copy.order : "", copy.booking[plan.booking.kind], copy.catalog, copy.menu, copy.gallery, copy.map].filter(Boolean)
  const fields = plan.samples.map((field) => copy.fields[field]).filter(Boolean)
  const photos = Object.values(result.photos).filter(Boolean)
  const photoLine = !photos.length ? copy.photosNone : photos.some((photo) => photo?.credit) ? copy.photosFound : copy.photosCurated
  return [
    mode === "edit" ? copy.updated(plan.brand.name) : copy.ready(plan.brand.name, result.pages.length, names.join(", ")),
    "",
    `${copy.works}: ${works.join(", ")}.`,
    "",
    "```html filename=index.html",
    result.html,
    "```",
    "",
    ...(fields.length ? [copy.samples(fields.join(", ")), ""] : []),
    photoLine,
    ...(result.planner.used ? [] : ["", copy.fallback]),
    "",
    copy.next,
  ].join("\n")
}

/**
 * A finished site is ~100 KB of HTML. The model never needs it again in full:
 * edits go through the plan. In history it becomes one line.
 */
export function compactForgeHistory<T extends Message>(messages: T[]): T[] {
  if (!Array.isArray(messages)) return messages
  return messages.map((message) => {
    if (message?.role !== "assistant" || typeof message.content !== "string" || !message.content.includes('id="malik-site"')) return message
    const site = readForgeSite(message.content)
    const summary = site
      ? `[Malik Site Forge: сайт «${site.plan.brand.name}» (${site.plan.blueprint}, ${site.plan.catalog.items.length} позиций, 6 страниц) показан пользователю целиком; правки вносятся через его план.]`
      : "[Malik Site Forge: сайт показан пользователю целиком.]"
    return { ...message, content: message.content.replace(/```html[^\n]*\n[\s\S]*?\n```/u, summary) }
  })
}

export function forgeLocaleOf(prompt: string) {
  return forgeLocale(prompt)
}
