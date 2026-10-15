import { blueprintById, type ForgeLocale } from "./blueprints"
import { icon, iconSprite, inlineIcon } from "./icons"
import type { ForgePlan } from "./plan"
import { SITE_RUNTIME, imageGuardScript } from "./runtime"
import { fontLink, resolveAccent, siteCss } from "./styles"

/**
 * Malik Site Forge — plan + photographs → one self-contained index.html.
 *
 * Six real pages (home, catalogue, about, gallery, booking, contacts) plus a
 * not-found page, a basket with checkout, a phone menu and a lightbox. All
 * text is escaped; links are built from validated values only. The plan is
 * embedded so the site can be edited at the plan level later.
 */

export type SitePhoto = { url: string; alt: string; credit?: string; link?: string; alts?: string[] }
export type PhotoMap = Record<string, SitePhoto | undefined>

type Ui = Record<string, string>

const UI: Record<ForgeLocale, Ui> = {
  ru: {
    home: "Главная", about: "О нас", gallery: "Галерея", contacts: "Контакты", notFound: "Такой страницы нет", notFoundText: "Возможно, ссылка устарела. Вернитесь на главную — там всё самое важное.", toHome: "На главную",
    skip: "Перейти к содержимому", openMenu: "Открыть меню", closeMenu: "Закрыть меню", cart: "Корзина", addToCart: "В корзину", book: "Записаться", all: "Все",
    search: "Найти", sortDefault: "По порядку", sortAsc: "Сначала дешевле", sortDesc: "Сначала дороже", nothing: "Ничего не нашлось. Попробуйте другое слово или категорию.", resetFilters: "Сбросить фильтры",
    seeAll: "Смотреть всё", why: "Почему к нам приходят", howItWorks: "Как это работает", moreAbout: "Подробнее о нас", photos: "Фотографии", questions: "Частые вопросы", visit: "Как нас найти",
    hours: "Часы работы", address: "Адрес", phone: "Телефон", email: "Почта", write: "Написать", copyAddress: "Скопировать адрес", openIn: "Открыть в", route: "Маршрут",
    yourName: "Ваше имя", yourPhone: "Телефон", date: "Дата", time: "Время", guests: "Гостей", service: "Что бронируем", comment: "Комментарий", optional: "необязательно",
    checkin: "Заезд", checkoutLabel: "Выезд", sendRequest: "Отправить заявку", bookingDone: "Заявка готова", bookingDoneText: "Отправьте её нам удобным способом — мы подтвердим в ответном сообщении.", sendWhatsApp: "Отправить в WhatsApp", sendTelegram: "Открыть Telegram",
    sendEmail: "Отправить письмо", copyText: "Скопировать текст", addCalendar: "Добавить в календарь", bookAgain: "Новая заявка", nextSteps: "Что будет дальше",
    nextStep1: "Вы отправляете заявку в мессенджер или на почту.", nextStep2: "Мы проверяем время и отвечаем.", nextStep3: "Приходите — всё будет готово.",
    cartEmpty: "В корзине пока пусто.", toCatalog: "Открыть", total: "Итого", checkout: "Оформить заказ", backToCart: "Назад к корзине", delivery: "Доставка", pickup: "Самовывоз",
    deliveryAddress: "Адрес доставки", when: "Ко времени", asap: "как можно скорее", placeOrder: "Подготовить заказ", orderDone: "Заказ собран", orderDoneText: "Отправьте его нам — мы подтвердим и начнём готовить.", newOrder: "Новый заказ",
    remove: "Убрать", quantity: "Количество", less: "Меньше", more: "Больше", added: "в корзине", copied: "Скопировано", copiedForTelegram: "Текст скопирован — вставьте его в чат", copyFailed: "Не удалось скопировать",
    errName: "Как к вам обращаться?", errPhone: "Нужен номер телефона, минимум 10 цифр", errAddress: "Укажите адрес доставки", errDate: "Выберите сегодняшнюю или будущую дату", errTime: "Выберите время", errCheckout: "Дата выезда должна быть позже заезда",
    orderTitle: "Заказ", bookingTitle: "Бронирование", howGet: "Получение", name: "Имя", openUntil: "Открыто до", openAllDay: "Открыто круглосуточно", closedNow: "Сейчас закрыто", opensAt: "откроется", tomorrow: "завтра",
    noSlotsToday: "На сегодня мест нет — выберите другой день", closedThatDay: "В этот день мы не работаем", downloadBlocked: "Скачивание недоступно в предпросмотре — откройте сайт в браузере", madeWith: "Сайт создан в Malik AI",
    photoCredits: "Фото", rights: "Все права защищены", check: "Проверить даты", facts: "Коротко о нас", items: "позиций", categories: "разделов", daysOpen: "дней в неделю", findUs: "Мы на карте",
    hoursWeek: "часов в неделю мы открыты", prev: "Назад", next: "Дальше", faqLead: "Не нашли ответ? Напишите нам — ответим в рабочее время.", errSummary: "Проверьте форму", toTop: "Наверх", noSlots: "Свободного времени нет",
  },
  kk: {
    home: "Басты бет", about: "Біз туралы", gallery: "Галерея", contacts: "Байланыс", notFound: "Мұндай бет жоқ", notFoundText: "Сілтеме ескірген болуы мүмкін. Басты бетке оралыңыз.", toHome: "Басты бетке",
    skip: "Мазмұнға өту", openMenu: "Мәзірді ашу", closeMenu: "Мәзірді жабу", cart: "Себет", addToCart: "Себетке", book: "Жазылу", all: "Барлығы",
    search: "Іздеу", sortDefault: "Ретімен", sortAsc: "Алдымен арзаны", sortDesc: "Алдымен қымбаты", nothing: "Ештеңе табылмады. Басқа сөзді немесе санатты таңдаңыз.", resetFilters: "Сүзгілерді тазалау",
    seeAll: "Барлығын көру", why: "Неге бізге келеді", howItWorks: "Қалай жұмыс істейді", moreAbout: "Біз туралы толығырақ", photos: "Фотосуреттер", questions: "Жиі қойылатын сұрақтар", visit: "Бізді қалай табуға болады",
    hours: "Жұмыс уақыты", address: "Мекенжай", phone: "Телефон", email: "Пошта", write: "Жазу", copyAddress: "Мекенжайды көшіру", openIn: "Ашу:", route: "Бағыт",
    yourName: "Атыңыз", yourPhone: "Телефон", date: "Күні", time: "Уақыты", guests: "Қонақтар", service: "Не брондаймыз", comment: "Түсініктеме", optional: "міндетті емес",
    checkin: "Келу", checkoutLabel: "Кету", sendRequest: "Өтінім жіберу", bookingDone: "Өтінім дайын", bookingDoneText: "Оны бізге ыңғайлы тәсілмен жіберіңіз — біз жауап хатта растаймыз.", sendWhatsApp: "WhatsApp-қа жіберу", sendTelegram: "Telegram ашу",
    sendEmail: "Хат жіберу", copyText: "Мәтінді көшіру", addCalendar: "Күнтізбеге қосу", bookAgain: "Жаңа өтінім", nextSteps: "Әрі қарай не болады",
    nextStep1: "Өтінімді мессенджерге немесе поштаға жібересіз.", nextStep2: "Біз уақытты тексеріп, жауап береміз.", nextStep3: "Келіңіз — бәрі дайын болады.",
    cartEmpty: "Себет әзірге бос.", toCatalog: "Ашу", total: "Барлығы", checkout: "Тапсырыс беру", backToCart: "Себетке оралу", delivery: "Жеткізу", pickup: "Өзім алып кетемін",
    deliveryAddress: "Жеткізу мекенжайы", when: "Уақытына", asap: "мүмкіндігінше тез", placeOrder: "Тапсырысты дайындау", orderDone: "Тапсырыс дайын", orderDoneText: "Оны бізге жіберіңіз — біз растап, дайындауды бастаймыз.", newOrder: "Жаңа тапсырыс",
    remove: "Алып тастау", quantity: "Саны", less: "Азырақ", more: "Көбірек", added: "себетте", copied: "Көшірілді", copiedForTelegram: "Мәтін көшірілді — чатқа қойыңыз", copyFailed: "Көшіру мүмкін болмады",
    errName: "Сізге қалай жүгінейік?", errPhone: "Телефон нөмірі керек, кемінде 10 сан", errAddress: "Жеткізу мекенжайын жазыңыз", errDate: "Бүгінгі немесе келесі күнді таңдаңыз", errTime: "Уақытты таңдаңыз", errCheckout: "Кету күні келу күнінен кейін болуы керек",
    orderTitle: "Тапсырыс", bookingTitle: "Брондау", howGet: "Алу тәсілі", name: "Аты", openUntil: "Ашық, жабылуы", openAllDay: "Тәулік бойы ашық", closedNow: "Қазір жабық", opensAt: "ашылады", tomorrow: "ертең",
    noSlotsToday: "Бүгінге орын жоқ — басқа күнді таңдаңыз", closedThatDay: "Бұл күні жұмыс істемейміз", downloadBlocked: "Алдын ала қарауда жүктеу мүмкін емес — сайтты браузерде ашыңыз", madeWith: "Сайт Malik AI-да жасалған",
    photoCredits: "Фото", rights: "Барлық құқықтар қорғалған", check: "Күндерді тексеру", facts: "Біз туралы қысқаша", items: "позиция", categories: "бөлім", daysOpen: "күн аптасына", findUs: "Біз картада",
    hoursWeek: "сағат аптасына ашықпыз", prev: "Артқа", next: "Әрі қарай", faqLead: "Жауап таппадыңыз ба? Бізге жазыңыз — жұмыс уақытында жауап береміз.", errSummary: "Форманы тексеріңіз", toTop: "Жоғары", noSlots: "Бос уақыт жоқ",
  },
  en: {
    home: "Home", about: "About", gallery: "Gallery", contacts: "Contact", notFound: "This page doesn't exist", notFoundText: "The link may be out of date. The home page has everything important.", toHome: "Go to home page",
    skip: "Skip to content", openMenu: "Open menu", closeMenu: "Close menu", cart: "Basket", addToCart: "Add", book: "Book", all: "All",
    search: "Search", sortDefault: "Default order", sortAsc: "Price: low to high", sortDesc: "Price: high to low", nothing: "Nothing found. Try another word or category.", resetFilters: "Reset filters",
    seeAll: "See all", why: "Why people come back", howItWorks: "How it works", moreAbout: "More about us", photos: "Photos", questions: "Questions", visit: "Find us",
    hours: "Opening hours", address: "Address", phone: "Phone", email: "Email", write: "Message us", copyAddress: "Copy address", openIn: "Open in", route: "Directions",
    yourName: "Your name", yourPhone: "Phone", date: "Date", time: "Time", guests: "Guests", service: "What to book", comment: "Comment", optional: "optional",
    checkin: "Check-in", checkoutLabel: "Check-out", sendRequest: "Send request", bookingDone: "Your request is ready", bookingDoneText: "Send it to us any way you like — we confirm in reply.", sendWhatsApp: "Send on WhatsApp", sendTelegram: "Open Telegram",
    sendEmail: "Send by email", copyText: "Copy text", addCalendar: "Add to calendar", bookAgain: "New request", nextSteps: "What happens next",
    nextStep1: "You send the request by message or email.", nextStep2: "We check the time and reply.", nextStep3: "Come in — everything will be ready.",
    cartEmpty: "Your basket is empty.", toCatalog: "Browse", total: "Total", checkout: "Checkout", backToCart: "Back to basket", delivery: "Delivery", pickup: "Pickup",
    deliveryAddress: "Delivery address", when: "For", asap: "as soon as possible", placeOrder: "Prepare order", orderDone: "Your order is ready", orderDoneText: "Send it to us — we confirm and start preparing.", newOrder: "New order",
    remove: "Remove", quantity: "Quantity", less: "Fewer", more: "More", added: "added", copied: "Copied", copiedForTelegram: "Text copied — paste it into the chat", copyFailed: "Couldn't copy",
    errName: "What should we call you?", errPhone: "Enter a phone number, at least 10 digits", errAddress: "Enter a delivery address", errDate: "Choose today or a later date", errTime: "Choose a time", errCheckout: "Check-out must be after check-in",
    orderTitle: "Order", bookingTitle: "Booking", howGet: "Fulfilment", name: "Name", openUntil: "Open until", openAllDay: "Open 24 hours", closedNow: "Closed now", opensAt: "opens", tomorrow: "tomorrow",
    noSlotsToday: "No times left today — choose another day", closedThatDay: "We're closed that day", downloadBlocked: "Downloads are blocked in the preview — open the site in a browser", madeWith: "Made with Malik AI",
    photoCredits: "Photos", rights: "All rights reserved", check: "Check dates", facts: "At a glance", items: "items", categories: "sections", daysOpen: "days a week", findUs: "On the map",
    hoursWeek: "hours a week we're open", prev: "Previous", next: "Next", faqLead: "Didn't find the answer? Message us — we reply during working hours.", errSummary: "Please check the form", toTop: "Back to top", noSlots: "No free times",
  },
}

const DAY_NAMES: Record<ForgeLocale, string[]> = {
  ru: ["в воскресенье", "в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу"],
  kk: ["жексенбіде", "дүйсенбіде", "сейсенбіде", "сәрсенбіде", "бейсенбіде", "жұмада", "сенбіде"],
  en: ["on Sunday", "on Monday", "on Tuesday", "on Wednesday", "on Thursday", "on Friday", "on Saturday"],
}
const NUMBER_LOCALE: Record<ForgeLocale, string> = { ru: "ru-RU", kk: "kk-KZ", en: "en-US" }

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string)
}
const e = escapeHtml

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] as string)
}

export function siteSlug(name: string) {
  const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i" }
  return String(name || "site").toLowerCase().split("").map((char) => map[char] ?? char).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "site"
}

function price(plan: ForgePlan, value: number, from = false) {
  const before = plan.catalog.currency === "$" || plan.catalog.currency === "€"
  const text = new Intl.NumberFormat(NUMBER_LOCALE[plan.locale], { maximumFractionDigits: value % 1 ? 2 : 0 }).format(value).replace(/\u00a0|\u202f/g, " ")
  const amount = before ? `${plan.catalog.currency}${text}` : `${text} ${plan.catalog.currency}`
  if (value === 0) return plan.locale === "en" ? "Free" : plan.locale === "kk" ? "Тегін" : "Бесплатно"
  return from ? `${plan.locale === "en" ? "from" : plan.locale === "kk" ? "бастап" : "от"} ${amount}` : amount
}

function img(photo: SitePhoto | undefined, alt: string, options: { eager?: boolean; sizes?: string } = {}) {
  if (!photo) return `<div class="art" role="img" aria-label="${e(alt)}">${icon("sparkle")}</div>`
  const fallbacks = (photo.alts || []).filter((url) => url !== photo.url).slice(0, 1)
  return `<img src="${e(photo.url)}" alt="${e(photo.alt || alt)}"${fallbacks.length ? ` data-alt="${e(fallbacks.join("|"))}"` : ""} ${options.eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"${options.sizes ? ` sizes="${options.sizes}"` : ""}>`
}

function minutesOf(hhmm: string) {
  const [h, m] = String(hhmm).split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

function mapQuery(plan: ForgePlan) {
  return [plan.contacts.address, plan.contacts.city].filter(Boolean).join(", ")
}

/** The catalogue as markup; the home page shows the first few. */
function itemsMarkup(plan: ForgePlan, photos: PhotoMap, ui: Ui, options: { limit?: number; board: boolean; withTitles: boolean }) {
  const items = options.limit ? plan.catalog.items.slice(0, options.limit) : plan.catalog.items
  let order = 0
  const card = (item: ForgePlan["catalog"]["items"][number]) => {
    const action = plan.order
      ? `<button type="button" class="add" data-add="${e(item.id)}" aria-label="${e(`${ui.addToCart}: ${item.name}`)}">${icon("plus")}${e(ui.addToCart)}</button>`
      : `<a class="add" href="#/booking" data-service="${e(item.name)}">${e(ui.book)}</a>`
    const search = `${item.name} ${item.description}`.toLowerCase()
    return `<article class="item" data-item data-id="${e(item.id)}" data-cat="${e(item.category)}" data-price="${item.price}" data-search="${e(search)}" data-order="${order++}">
<figure class="item__ph">${img(photos[`item:${item.id}`], item.name)}</figure>
<div class="item__body"><div class="item__top"><h3 class="item__name">${e(item.name)}</h3><span class="item__lead" aria-hidden="true"></span><span class="item__price">${e(price(plan, item.price, item.from))}</span></div>
${item.description ? `<p class="item__desc">${e(item.description)}</p>` : ""}
<div class="item__foot">${item.badge ? `<span class="badge">${e(item.badge)}</span>` : ""}${action}</div></div></article>`
  }
  if (!options.withTitles || !options.board) return items.map(card).join("\n")
  return plan.catalog.categories.map((category) => {
    const inCat = items.filter((item) => item.category === category.id)
    if (!inCat.length) return ""
    return `<h3 class="cat-title" data-cat="${e(category.id)}" data-order="${order++}">${e(category.name)}</h3>\n${inCat.map(card).join("\n")}`
  }).join("\n")
}

function hoursRows(plan: ForgePlan) {
  return plan.contacts.hours.map((hours) => `<tr data-day-row="${hours.days.join(",")}"><td>${e(hours.label)}</td><td>${hours.open === "00:00" && hours.close === "24:00" ? "24/7" : `${e(hours.open)}–${e(hours.close)}`}</td></tr>`).join("")
}

function contactList(plan: ForgePlan, ui: Ui) {
  const c = plan.contacts
  return `<ul class="contact-list">
<li>${icon("pin")}<div><span data-bind="address">${e([c.address, c.city].filter(Boolean).join(", "))}</span><small><button type="button" class="copy" data-copy="address">${e(ui.copyAddress)}</button></small></div></li>
<li>${icon("phone")}<div><a data-href="tel" href="tel:+${e(c.phone.replace(/\D/g, ""))}" data-bind="phone">${e(c.phone)}</a><small>${e(ui.phone)}</small></div></li>
<li>${icon("whatsapp")}<div><a data-href="wa" href="https://wa.me/${e(c.whatsapp.replace(/\D/g, ""))}" target="_blank" rel="noopener">WhatsApp</a><small>${e(ui.write)}</small></div></li>
<li>${icon("mail")}<div><a data-href="mail" href="mailto:${e(c.email)}" data-bind="email">${e(c.email)}</a><small>${e(ui.email)}</small></div></li>
</ul>`
}

function bookingForm(plan: ForgePlan, ui: Ui, maxGuests: number) {
  const stay = plan.booking.kind === "stay"
  const party = plan.booking.kind === "table" || stay
  const services = plan.booking.services.map((service) => `<option>${e(service)}</option>`).join("")
  const f = (name: string, label: string, input: string, required = true) => `<div class="field"><label for="b-${name}">${e(label)}${required ? "" : ` <span class="muted">(${e(ui.optional)})</span>`}</label>${input}<div class="field__error" aria-live="polite"></div></div>`
  const timeField = f("time", ui.time, `<select id="b-time" name="time" class="slots__select" required aria-hidden="true" tabindex="-1"></select><div class="slots" data-slots role="radiogroup" aria-labelledby="b-time-l" data-empty-text="${e(ui.noSlots)}"></div>`).replace('<label for="b-time">', '<label for="b-time" id="b-time-l">')
  return `<form class="form panel" data-booking novalidate>
<div class="errsum" data-errsum role="alert" tabindex="-1" hidden><b>${e(ui.errSummary)}</b><ul></ul></div>
${services && !stay ? f("service", ui.service, `<select id="b-service" name="service">${services}</select>`) : ""}
${stay ? `<div class="form__row">${f("date", ui.checkin, '<input id="b-date" name="date" type="date" required>')}${f("checkout", ui.checkoutLabel, '<input id="b-checkout" name="checkout" type="date" required>')}</div>${services ? f("service", ui.service, `<select id="b-service" name="service">${services}</select>`) : ""}`
    : `${f("date", ui.date, '<input id="b-date" name="date" type="date" required>')}${timeField}`}
${party ? `<div class="field"><span class="field__label" id="b-guests-l"><b>${e(ui.guests)}</b></span><div class="stepper" role="group" aria-labelledby="b-guests-l"><button type="button" data-step="-1" aria-label="${e(ui.less)}">−</button><output data-guests-out>2</output><button type="button" data-step="1" aria-label="${e(ui.more)}">+</button></div><input type="hidden" name="guests" value="2" data-max="${maxGuests}"></div>` : ""}
<div class="form__row">${f("name", ui.yourName, '<input id="b-name" name="name" autocomplete="name" required>')}${f("phone", ui.yourPhone, '<input id="b-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required>')}</div>
${f("comment", ui.comment, '<textarea id="b-comment" name="comment" rows="3"></textarea>', false)}
<button class="btn btn--accent btn--block" type="submit">${e(ui.sendRequest)}</button>
</form>
<div class="panel done" data-booking-done hidden aria-live="polite">
<div class="done__mark">${icon("check")}</div><h2>${e(ui.bookingDone)}</h2><p class="muted">${e(ui.bookingDoneText)}</p>
<pre class="summary" data-booking-text></pre>
<div class="send"><a class="btn btn--accent" data-send="wa" target="_blank" rel="noopener">${icon("whatsapp")}${e(ui.sendWhatsApp)}</a><a class="btn" data-send="tg" target="_blank" rel="noopener">${icon("telegram")}${e(ui.sendTelegram)}</a><a class="btn" data-send="mail">${icon("mail")}${e(ui.sendEmail)}</a><button type="button" class="btn" data-send="copy">${icon("copy")}${e(ui.copyText)}</button></div>
<div class="send"><button type="button" class="btn" data-ics>${icon("calendar")}${e(ui.addCalendar)}</button><button type="button" class="btn" data-booking-again>${e(ui.bookAgain)}</button></div>
</div>`
}

function cartDrawer(plan: ForgePlan, ui: Ui, delivery: boolean) {
  const f = (name: string, label: string, input: string, extra = "") => `<div class="field"${extra}><label for="c-${name}">${e(label)}</label>${input}<div class="field__error" aria-live="polite"></div></div>`
  return `<div class="drawer" data-cart data-trap hidden role="dialog" aria-modal="true" aria-label="${e(ui.cart)}"><div class="drawer__panel">
<div class="drawer__head"><h2 style="font-size:24px">${e(ui.cart)}</h2><button type="button" class="x" data-cart-close aria-label="${e(ui.closeMenu)}">${icon("close")}</button></div>
<div data-stage="cart" class="drawer__body"><div data-cart-empty class="empty">${e(ui.cartEmpty)} <a class="link" href="#/catalog" data-cart-close>${e(ui.toCatalog)}: ${e(plan.catalog.title)}</a></div><div data-lines></div></div>
<div data-stage="cart" class="drawer__foot" data-cart-foot hidden><div class="total"><span>${e(ui.total)}</span><span data-total></span></div><button type="button" class="btn btn--accent btn--block" data-checkout>${e(ui.checkout)}</button></div>
<form data-stage="checkout" class="drawer__body form" data-checkout-form novalidate hidden>
<button type="button" class="link" style="border:0;background:none;padding:0;cursor:pointer;justify-self:start" data-back-cart>← ${e(ui.backToCart)}</button>
<div class="errsum" data-errsum role="alert" tabindex="-1" hidden><b>${e(ui.errSummary)}</b><ul></ul></div>
${delivery ? `<div class="seg" role="group"><button type="button" data-mode="delivery" aria-pressed="true">${e(ui.delivery)}</button><button type="button" data-mode="pickup" aria-pressed="false">${e(ui.pickup)}</button></div>` : ""}
${f("name", ui.yourName, '<input id="c-name" name="name" autocomplete="name">')}
${f("phone", ui.yourPhone, '<input id="c-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel">')}
${delivery ? f("address", ui.deliveryAddress, '<input id="c-address" name="address" autocomplete="street-address">', " data-address-field") : '<input type="hidden" name="address" value="">'}
${f("when", ui.when, `<input id="c-when" name="when" type="time" aria-describedby="c-when-h"><small id="c-when-h" class="muted">${e(ui.asap)}</small>`)}
${f("comment", ui.comment, '<textarea id="c-comment" name="comment" rows="2"></textarea>')}
<div class="total"><span>${e(ui.total)}</span><span data-total></span></div>
<button class="btn btn--accent btn--block" type="submit">${e(ui.placeOrder)}</button>
</form>
<div data-stage="done" class="drawer__body done" hidden aria-live="polite"><div class="done__mark">${icon("check")}</div><h2 style="font-size:26px">${e(ui.orderDone)} <span data-order-number></span></h2><p class="muted">${e(ui.orderDoneText)}</p>
<pre class="summary" data-order-text></pre>
<div class="send"><a class="btn btn--accent" data-send="wa" target="_blank" rel="noopener">${icon("whatsapp")}${e(ui.sendWhatsApp)}</a><a class="btn" data-send="tg" target="_blank" rel="noopener">${icon("telegram")}${e(ui.sendTelegram)}</a><a class="btn" data-send="mail">${icon("mail")}${e(ui.sendEmail)}</a><button type="button" class="btn" data-send="copy">${icon("copy")}${e(ui.copyText)}</button></div>
<button type="button" class="btn btn--block" data-new-order>${e(ui.newOrder)}</button></div>
</div></div>`
}

export type RenderResult = { html: string; pages: string[] }

/** Indentation and whole-line comments removed; nothing inside a line is touched. */
function compactScript(source: string) {
  return source.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//") && !/^\/\*.*\*\/$/.test(line)).join("\n")
}

export function renderSite(plan: ForgePlan, photos: PhotoMap): RenderResult {
  const ui = UI[plan.locale]
  const blueprint = blueprintById(plan.blueprint)
  const board = plan.direction === "roastery"
  const slug = siteSlug(plan.brand.name)
  const catalogTitle = plan.catalog.title
  const bookingTitle = plan.booking.title
  const maxGuests = plan.booking.kind === "stay" ? 8 : plan.booking.kind === "table" ? 20 : 1
  const delivery = plan.order && blueprint?.id !== "coffee"
  const navPages: Array<[string, string]> = [["home", ui.home], ["catalog", catalogTitle], ["about", ui.about], ["gallery", ui.gallery], ["booking", bookingTitle], ["contacts", ui.contacts]]
  const nav = navPages.map(([id, label]) => `<a href="#/${id === "home" ? "" : id}" data-nav="${id}">${e(label)}</a>`).join("")
  const mnav = navPages.map(([id, label]) => `<a class="mnav__link" href="#/${id === "home" ? "" : id}" data-nav="${id}">${e(label)}</a>`).join("")
  const query = mapQuery(plan)
  const credits = Object.values(photos).filter((photo): photo is SitePhoto => Boolean(photo?.credit))
  const uniqueCredits = [...new Map(credits.map((photo) => [photo.credit, photo])).values()].slice(0, 12)
  const unsplash = Object.values(photos).some((photo) => photo?.url.includes("images.unsplash.com"))
  const pageTitle = (label: string) => `${label} — ${plan.brand.name}`
  const galleryFigures = plan.gallery.map((shot, index) => `<figure data-lb data-caption="${e(shot.caption)}">${img(photos[`gallery:${index}`], shot.caption || plan.brand.name)}${shot.caption ? `<figcaption>${e(shot.caption)}</figcaption>` : ""}</figure>`)
  const facts = [
    [String(plan.catalog.items.length), ui.items],
    [String(plan.catalog.categories.length), ui.categories],
    [String(new Set(plan.contacts.hours.flatMap((hours) => hours.days)).size), ui.daysOpen],
  ]
  const phoneHref = `tel:+${e(plan.contacts.phone.replace(/\D/g, ""))}`
  const waHref = `https://wa.me/${e(plan.contacts.whatsapp.replace(/\D/g, ""))}`
  const address = [plan.contacts.address, plan.contacts.city].filter(Boolean).join(", ")
  let kickerAt = 0
  const kicker = () => `<p class="kicker" aria-hidden="true">${String(++kickerAt).padStart(2, "0")}</p>`

  // Bento: one large photographed reason, the others as tiles, and the opening hours as a counted fact.
  const weekHours = Math.min(168, Math.round(plan.contacts.hours.reduce((sum, hours) => {
    const open = minutesOf(hours.open), close = minutesOf(hours.close === "00:00" ? "24:00" : hours.close)
    return sum + (close > open ? close - open : close + 1440 - open) * new Set(hours.days).size
  }, 0) / 60))
  const [lead, ...rest] = plan.highlights
  const bentoPhoto = plan.gallery.length >= 5 ? photos[`gallery:${plan.gallery.length - 1}`] : photos.about
  const tiles = [
    ...rest.map((item) => `<article class="tile" data-reveal>${icon(item.icon)}<h3>${e(item.title)}</h3><p>${e(item.text)}</p></article>`),
    `<article class="tile tile--stat" data-reveal><strong data-count="${weekHours}">${weekHours}</strong><span>${e(ui.hoursWeek)}</span><span class="status" data-open-status></span></article>`,
  ]
  const spans = tiles.length <= 3 ? tiles.map((_, index) => (index === tiles.length - 1 ? 4 - tiles.length + 1 : 1)) : tiles.map((_, index) => (index < 4 ? 1 : 4 / Math.max(1, tiles.length - 4)))
  const bento = `<div class="bento">
<article class="tile tile--photo" data-reveal>${img(bentoPhoto, lead.title)}<div class="tile__in">${icon(lead.icon)}<h3>${e(lead.title)}</h3><p>${e(lead.text)}</p></div></article>
${tiles.map((tile, index) => (spans[index] > 1 ? tile.replace('class="tile', `style="--span:${spans[index]}" class="tile`) : tile)).join("\n")}
</div>`

  // A band of what the place offers, moving slowly (still for reduced motion).
  const marqueeWords = [...plan.catalog.categories.map((category) => category.name), ...plan.highlights.map((item) => item.title)].slice(0, 9)
  const marqueeRun = marqueeWords.map((word) => `<span>${e(word)}</span><i>✦</i>`).join("")
  const marquee = marqueeWords.length >= 3 ? `<div class="marquee" aria-hidden="true"><div class="marquee__track">${marqueeRun}${marqueeRun}</div></div>` : ""

  const mosaicCount = plan.gallery.length >= 6 ? 5 : Math.min(4, plan.gallery.length)
  const featured = board
    ? `<div class="items items--board">${itemsMarkup(plan, photos, ui, { limit: 6, board, withTitles: false })}</div>`
    : `<div class="rail" data-rail><div class="rail__track" tabindex="0" role="region" aria-label="${e(catalogTitle)}">${itemsMarkup(plan, photos, ui, { limit: 8, board: false, withTitles: false })}</div>
<div class="rail__nav"><button type="button" class="rail__btn" data-rail-prev aria-label="${e(ui.prev)}">${icon("arrow")}</button><button type="button" class="rail__btn" data-rail-next aria-label="${e(ui.next)}">${icon("arrow")}</button></div></div>`
  const mapLinksFor = (query: string) => (query ? `<div class="map__links"><a href="https://2gis.kz/search/${encodeURIComponent(query)}" target="_blank" rel="noopener">2GIS</a><a href="https://yandex.ru/maps/?text=${encodeURIComponent(query)}" target="_blank" rel="noopener">Яндекс Карты</a><a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(query)}" target="_blank" rel="noopener">Google Maps</a></div>` : "")

  const home = `<section class="page" data-page="home" data-title="${e(plan.seo.title)}">
<section class="hero"><div class="wrap hero__grid">
<div class="hero__in">${plan.hero.eyebrow ? `<p class="eyebrow">${e(plan.hero.eyebrow)}</p>` : ""}<h1>${e(plan.hero.title)}</h1><p class="hero__sub">${e(plan.hero.subtitle)}</p>
<div class="hero__ctas"><a class="btn btn--accent" href="#/booking">${e(plan.hero.primaryCta)}</a><a class="btn btn--light" href="#/catalog">${e(plan.hero.secondaryCta)}</a></div>
<ul class="hero__facts">${plan.hero.badges.map((badge) => `<li>${icon(plan.highlights.find((item) => item.title === badge)?.icon || "check")}${e(badge)}</li>`).join("")}</ul></div>
<div class="hero__media">${img(photos.hero, plan.brand.name, { eager: true })}</div>
${plan.direction === "coast" ? "" : `<div class="hero__card"><span class="status" data-open-status></span><p data-bind="address">${e(address)}</p><a class="link" href="#/contacts">${e(ui.route)}</a></div>`}
</div></section>
${plan.direction === "coast" ? `<div class="wrap quickbook"><form data-quickbook aria-label="${e(bookingTitle)}"><div class="field"><label for="q-date">${e(ui.checkin)}</label><input id="q-date" name="date" type="date"></div><div class="field"><label for="q-out">${e(ui.checkoutLabel)}</label><input id="q-out" name="checkout" type="date"></div><div class="field"><label for="q-g">${e(ui.guests)}</label><select id="q-g" name="guests">${[1, 2, 3, 4, 5, 6].map((n) => `<option${n === 2 ? " selected" : ""}>${n}</option>`).join("")}</select></div><button class="btn btn--accent" type="submit">${e(ui.check)}</button></form></div>` : ""}
${marquee}
<section class="section"><div class="wrap"><div class="section__head" data-reveal><div>${kicker()}<h2>${e(ui.why)}</h2></div><p class="lead">${e(plan.brand.tagline)}</p></div>
${bento}</div></section>
<section class="section" style="padding-top:0"><div class="wrap"><div class="section__head" data-reveal><div>${kicker()}<h2>${e(catalogTitle)}</h2></div><a class="link" href="#/catalog">${e(ui.seeAll)}</a></div>
${featured}</div></section>
<section class="section section--dark"><div class="wrap split"><div class="split__media" data-reveal>${img(photos.about, plan.about.title)}</div>
<div class="split__text" data-reveal>${kicker()}<h2>${e(plan.about.title)}</h2>${plan.about.paragraphs.slice(0, 1).map((p) => `<p class="lead">${e(p)}</p>`).join("")}<a class="btn btn--light" href="#/about">${e(ui.moreAbout)}</a></div></div></section>
<section class="section"><div class="wrap"><div class="section__head" data-reveal><div>${kicker()}<h2>${e(ui.howItWorks)}</h2></div></div><ol class="steps steps--line">${plan.steps.map((step, index) => `<li data-reveal style="--i:${index}"><h3>${e(step.title)}</h3><p>${e(step.text)}</p></li>`).join("")}</ol></div></section>
<section class="section" style="padding-top:0"><div class="wrap"><div class="section__head" data-reveal><div>${kicker()}<h2>${e(ui.photos)}</h2></div><a class="link" href="#/gallery">${e(ui.seeAll)}</a></div><div class="mosaic mosaic--${mosaicCount}" data-reveal>${galleryFigures.slice(0, mosaicCount).join("")}</div></div></section>
<section class="section--tight"><div class="wrap"><div class="cta" data-reveal><div class="cta__media">${img(photos.booking, bookingTitle)}</div><div class="cta__in"><h2>${e(bookingTitle)}</h2><p>${e(plan.booking.subtitle)}</p><div class="cta__actions"><a class="btn btn--accent" href="#/booking">${e(plan.hero.primaryCta)}</a><a class="btn btn--light" data-href="tel" href="${phoneHref}">${icon("phone")}<span data-bind="phone">${e(plan.contacts.phone)}</span></a></div></div></div></div></section>
<section class="section"><div class="wrap visit"><div data-reveal>${kicker()}<h2>${e(ui.visit)}</h2><p style="margin:18px 0 24px"><span class="status" data-open-status></span></p>${contactList(plan, ui)}${mapLinksFor(query)}</div>
<div data-reveal><h3 style="margin-bottom:12px">${e(ui.hours)}</h3><table class="hours"><tbody>${hoursRows(plan)}</tbody></table></div></div></section>
<section class="section" style="padding-top:0"><div class="wrap faqwrap"><div data-reveal>${kicker()}<h2>${e(ui.questions)}</h2><p class="lead" style="margin:16px 0 24px">${e(ui.faqLead)}</p><a class="btn" data-href="wa" href="${waHref}" target="_blank" rel="noopener">${icon("whatsapp")}${e(ui.write)}</a></div>
<div class="faq" data-reveal>${plan.faq.slice(0, 6).map((item) => `<details><summary>${e(item.q)}</summary><p>${e(item.a)}</p></details>`).join("")}</div></div></section>
</section>`

  const catalog = `<section class="page" data-page="catalog" data-title="${e(pageTitle(catalogTitle))}" hidden><div data-catalog-page>
<div class="wrap pagehead"><h1>${e(catalogTitle)}</h1><p class="lead">${e(plan.catalog.subtitle)}</p></div>
<div class="wrap"><div class="toolbar"><label class="search">${icon("search")}<span class="sr" style="position:absolute;left:-9999px">${e(ui.search)}</span><input type="search" placeholder="${e(ui.search)}" data-search-input aria-label="${e(ui.search)}"></label>
<select class="select" data-sort aria-label="${e(ui.sortDefault)}"><option value="default">${e(ui.sortDefault)}</option><option value="asc">${e(ui.sortAsc)}</option><option value="desc">${e(ui.sortDesc)}</option></select>
<div class="chips" role="group" aria-label="${e(catalogTitle)}"><button type="button" class="chip" data-filter="all" aria-pressed="true">${e(ui.all)}</button>${plan.catalog.categories.map((category) => `<button type="button" class="chip" data-filter="${e(category.id)}" aria-pressed="false">${e(category.name)}</button>`).join("")}</div></div>
<div class="items${board ? " items--board" : ""}" data-items>${itemsMarkup(plan, photos, ui, { board, withTitles: true })}</div>
<div class="empty" data-empty hidden>${e(ui.nothing)} <button type="button" class="copy" data-reset>${e(ui.resetFilters)}</button></div>
</div><div class="section--tight"></div></div></section>`

  const about = `<section class="page" data-page="about" data-title="${e(pageTitle(ui.about))}" hidden>
<div class="wrap pagehead"><h1>${e(plan.about.title)}</h1><p class="lead">${e(plan.brand.description)}</p></div>
<section class="section--tight"><div class="wrap split"><div class="collage"><figure>${img(photos.about, plan.about.title)}</figure><figure>${img(photos["gallery:1"], plan.brand.name)}</figure><figure>${img(photos["gallery:2"], plan.brand.name)}</figure></div>
<div class="split__text">${plan.about.paragraphs.map((p) => `<p>${e(p)}</p>`).join("")}<ul class="values">${plan.about.values.map((value) => `<li>${icon("check")}<div><b>${e(value.title)}</b><br><span class="muted">${e(value.text)}</span></div></li>`).join("")}</ul></div></div></section>
<section class="section"><div class="wrap"><h2>${e(ui.facts)}</h2><ul class="facts">${facts.map(([value, label]) => `<li data-reveal><strong data-count="${e(value)}">${e(value)}</strong><span class="muted">${e(label)}</span></li>`).join("")}</ul></div></section>
<section class="section section--dark"><div class="wrap"><div class="section__head"><h2>${e(ui.howItWorks)}</h2></div><ol class="steps">${plan.steps.map((step) => `<li><h3>${e(step.title)}</h3><p>${e(step.text)}</p></li>`).join("")}</ol></div></section>
</section>`

  const gallery = `<section class="page" data-page="gallery" data-title="${e(pageTitle(ui.gallery))}" hidden>
<div class="wrap pagehead"><h1>${e(ui.gallery)}</h1><p class="lead">${e(plan.brand.tagline)}</p></div>
<div class="wrap"><div class="masonry">${galleryFigures.join("")}</div></div><div class="section--tight"></div></section>`

  const booking = `<section class="page" data-page="booking" data-title="${e(pageTitle(bookingTitle))}" hidden>
<div class="wrap pagehead"><h1>${e(bookingTitle)}</h1><p class="lead">${e(plan.booking.subtitle)}</p></div>
<div class="wrap booking"><div>${bookingForm(plan, ui, maxGuests)}</div>
<aside class="aside"><div class="aside__ph">${img(photos.booking, bookingTitle)}</div><div class="panel"><h3 style="margin-bottom:14px">${e(ui.nextSteps)}</h3><ol class="steps" style="grid-template-columns:1fr;gap:14px"><li><p>${e(ui.nextStep1)}</p></li><li><p>${e(ui.nextStep2)}</p></li><li><p>${e(ui.nextStep3)}</p></li></ol></div>
<div class="panel"><h3 style="margin-bottom:10px">${e(ui.hours)}</h3><p><span class="status" data-open-status></span></p><table class="hours"><tbody>${hoursRows(plan)}</tbody></table></div></aside></div>
<div class="section--tight"></div></section>`

  const mapLinks = mapLinksFor(query)
  const contacts = `<section class="page" data-page="contacts" data-title="${e(pageTitle(ui.contacts))}" hidden>
<div class="wrap pagehead"><h1>${e(ui.contacts)}</h1><p class="lead"><span class="status" data-open-status></span></p></div>
<div class="wrap visit"><div>${contactList(plan, ui)}<div class="socials" style="margin-top:28px"><a data-href="ig" href="#" target="_blank" rel="noopener" aria-label="Instagram" style="border-color:var(--line)">${icon("instagram")}</a><a data-href="tg" href="#" target="_blank" rel="noopener" aria-label="Telegram" style="border-color:var(--line)">${icon("telegram")}</a><a data-href="wa" href="#" target="_blank" rel="noopener" aria-label="WhatsApp" style="border-color:var(--line)">${icon("whatsapp")}</a></div>
<h3 style="margin:36px 0 12px">${e(ui.hours)}</h3><table class="hours"><tbody>${hoursRows(plan)}</tbody></table></div>
<div>${query ? `<div class="map"><iframe title="${e(ui.findUs)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(query)}&amp;z=15&amp;output=embed"></iframe></div>${mapLinks}` : ""}</div></div>
<section class="section"><div class="wrap"><h2 style="margin-bottom:24px">${e(ui.questions)}</h2><div class="faq">${plan.faq.map((item) => `<details><summary>${e(item.q)}</summary><p>${e(item.a)}</p></details>`).join("")}</div></div></section>
</section>`

  const notFound = `<section class="page" data-page="404" data-title="${e(pageTitle(ui.notFound))}" hidden><div class="wrap notfound"><div><h1>${e(ui.notFound)}</h1><p class="lead">${e(ui.notFoundText)}</p><a class="btn btn--accent" href="#/">${e(ui.toHome)}</a></div></div></section>`

  const footer = `<footer class="ftr"><div class="wrap"><div class="ftr__grid">
<div><a class="logo" href="#/"><span class="logo__mark">${e(plan.brand.name.slice(0, 1).toUpperCase())}</span>${e(plan.brand.name)}</a><p>${e(plan.brand.tagline)}</p><div class="socials"><a data-href="ig" href="#" target="_blank" rel="noopener" aria-label="Instagram">${icon("instagram")}</a><a data-href="tg" href="#" target="_blank" rel="noopener" aria-label="Telegram">${icon("telegram")}</a><a data-href="wa" href="#" target="_blank" rel="noopener" aria-label="WhatsApp">${icon("whatsapp")}</a></div></div>
<div><h3>${e(ui.home)}</h3><ul>${navPages.slice(1).map(([id, label]) => `<li><a href="#/${id}">${e(label)}</a></li>`).join("")}</ul></div>
<div><h3>${e(ui.contacts)}</h3><ul><li><a data-href="tel" href="tel:+${e(plan.contacts.phone.replace(/\D/g, ""))}" data-bind="phone">${e(plan.contacts.phone)}</a></li><li><a data-href="mail" href="mailto:${e(plan.contacts.email)}" data-bind="email">${e(plan.contacts.email)}</a></li><li data-bind="address">${e([plan.contacts.address, plan.contacts.city].filter(Boolean).join(", "))}</li></ul></div>
<div><h3>${e(ui.hours)}</h3><ul>${plan.contacts.hours.map((hours) => `<li>${e(hours.label)}: ${hours.open === "00:00" && hours.close === "24:00" ? "24/7" : `${e(hours.open)}–${e(hours.close)}`}</li>`).join("")}</ul></div>
</div>
<div class="ftr__bottom"><span>© <span data-year></span> ${e(plan.brand.name)}. ${e(ui.rights)}.</span><span>${unsplash ? `${e(ui.photoCredits)}: Unsplash${uniqueCredits.length ? "; " : ""}` : uniqueCredits.length ? `${e(ui.photoCredits)}: ` : ""}${uniqueCredits.map((photo) => (photo.link ? `<a href="${e(photo.link)}" target="_blank" rel="noopener">${e(photo.credit!.replace(/^Фото:\s*/u, ""))}</a>` : e(photo.credit!.replace(/^Фото:\s*/u, "")))).join("; ")}</span><a href="https://malikaiworld.world" target="_blank" rel="noopener">${e(ui.madeWith)}</a></div>
</div><div class="ftr__word" aria-hidden="true" style="font-size:clamp(32px,${Math.min(17, Math.round(1200 / Math.max(5, plan.brand.name.length)) / 10)}vw,240px)">${e(plan.brand.name)}</div></footer>
<button type="button" class="totop" data-top hidden aria-label="${e(ui.toTop)}">${icon("arrow")}</button>`

  const data = {
    brand: plan.brand.name, title: plan.seo.title, slug, currency: plan.catalog.currency, currencyBefore: plan.catalog.currency === "$" || plan.catalog.currency === "€",
    numberLocale: NUMBER_LOCALE[plan.locale], delivery, hours: plan.contacts.hours, maxGuests, slotStep: plan.booking.kind === "table" ? 30 : 60, slotLength: plan.booking.kind === "table" ? 60 : 60,
    dayNames: DAY_NAMES[plan.locale], artIcon: inlineIcon("sparkle"),
    items: plan.catalog.items.map((item) => ({ id: item.id, name: item.name, price: item.price, photo: photos[`item:${item.id}`]?.url || "" })),
    ui: {
      openMenu: ui.openMenu, closeMenu: ui.closeMenu, added: ui.added, remove: ui.remove, quantity: ui.quantity, less: ui.less, more: ui.more, copied: ui.copied, copiedForTelegram: ui.copiedForTelegram, copyFailed: ui.copyFailed,
      errName: ui.errName, errPhone: ui.errPhone, errAddress: ui.errAddress, errDate: ui.errDate, errTime: ui.errTime, errCheckout: ui.errCheckout, orderTitle: ui.orderTitle, bookingTitle: ui.bookingTitle,
      total: ui.total, howGet: ui.howGet, delivery: ui.delivery, pickup: ui.pickup, when: ui.when, name: ui.name, phone: ui.phone, comment: ui.comment, service: ui.service, date: ui.date, checkin: ui.checkin, checkoutLabel: ui.checkoutLabel,
      guests: ui.guests, openUntil: ui.openUntil, openAllDay: ui.openAllDay, closedNow: ui.closedNow, opensAt: ui.opensAt, tomorrow: ui.tomorrow, noSlotsToday: ui.noSlotsToday, closedThatDay: ui.closedThatDay, downloadBlocked: ui.downloadBlocked,
    },
  }
  const config = { phone: plan.contacts.phone, whatsapp: plan.contacts.whatsapp.replace(/\D/g, ""), email: plan.contacts.email, telegram: plan.contacts.telegram, instagram: plan.contacts.instagram, address: [plan.contacts.address, plan.contacts.city].filter(Boolean).join(", ") }
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c")
  const description = plan.seo.description
  const editNote = plan.locale === "en" ? "Your contacts: change them here and the whole site updates." : plan.locale === "kk" ? "Байланыс деректері: осында өзгертсеңіз, бүкіл сайт жаңарады." : "Ваши контакты: поменяйте их здесь — обновится весь сайт."

  const colors = resolveAccent(plan.direction, plan.accent)
  const letter = escapeXml(plan.brand.name.slice(0, 1).toUpperCase() || "M")
  const favicon = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${colors.accent}"/><text x="32" y="43" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700" text-anchor="middle" fill="${colors.accentInk}">${letter}</text></svg>`)}`
  const currencyCode: Record<string, string> = { "₸": "KZT", "₽": "RUB", "$": "USD", "€": "EUR", "сом": "KGS", "сум": "UZS" }
  const dayCodes = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const schemaType = blueprint?.id === "coffee" ? "CafeOrCoffeeShop" : blueprint?.id === "restaurant" ? "Restaurant" : blueprint?.id === "hotel" ? "Hotel" : blueprint?.id === "clinic" ? "Dentist" : blueprint?.id === "barber" ? "HairSalon" : blueprint?.id === "beauty" ? "BeautySalon" : blueprint?.id === "fitness" ? "HealthClub" : blueprint?.id === "shop" ? "Store" : "LocalBusiness"
  const structured = {
    "@context": "https://schema.org",
    "@type": schemaType === "Dentist" && !/стомат|dent|тіс/iu.test(`${plan.brand.name} ${plan.brand.description} ${plan.catalog.items.map((item) => item.name).join(" ")}`) ? "MedicalClinic" : schemaType,
    name: plan.brand.name,
    description: plan.seo.description,
    // Example contacts are left out: search engines must never learn a placeholder phone.
    ...(plan.samples.includes("phone") ? {} : { telephone: plan.contacts.phone }),
    address: { "@type": "PostalAddress", ...(plan.samples.includes("address") ? {} : { streetAddress: plan.contacts.address }), addressLocality: plan.contacts.city },
    openingHoursSpecification: plan.contacts.hours.map((hours) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: hours.days.map((day) => dayCodes[day]), opens: hours.open, closes: hours.close === "24:00" ? "23:59" : hours.close })),
    ...(photos.hero ? { image: photos.hero.url } : {}),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: plan.catalog.title,
      itemListElement: plan.catalog.items.slice(0, 24).map((item) => ({ "@type": "Offer", name: item.name, ...(item.price > 0 ? { price: item.price, priceCurrency: currencyCode[plan.catalog.currency] || undefined } : {}) })),
    },
  }
  const ogLocale = plan.locale === "en" ? "en_US" : plan.locale === "kk" ? "kk_KZ" : "ru_RU"

  const body = [home, catalog, about, gallery, booking, contacts, notFound, footer, plan.order ? cartDrawer(plan, ui, delivery) : "", icon("close"), icon("phone"), icon("cart")].join("")
  const html = `<!doctype html>
<html lang="${plan.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${e(plan.seo.title)}</title>
<meta name="description" content="${e(description)}">
<meta name="generator" content="Malik Site Forge">
<link rel="icon" href="${e(favicon)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${ogLocale}">
<meta property="og:title" content="${e(plan.seo.title)}">
<meta property="og:description" content="${e(description)}">
${photos.hero ? `<meta property="og:image" content="${e(photos.hero.url)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<meta name="theme-color" content="${plan.direction === "edge" ? "#16171A" : "#FFFFFF"}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontLink(plan.direction)}">
${photos.hero ? `<link rel="preload" as="image" href="${e(photos.hero.url)}">` : ""}
<style>${siteCss(plan.direction, plan.accent)}</style>
<script>document.documentElement.classList.add("js");setTimeout(function(){if(!document.documentElement.hasAttribute("data-ready"))document.documentElement.classList.remove("js")},4000);${imageGuardScript(inlineIcon("sparkle"))}</script>
<script type="application/ld+json">${json(structured)}</script>
</head>
<body class="d-${plan.direction}">
${iconSprite(body.match(/#i-[a-z]+/g)?.map((ref) => ref.slice(3)) || [])}
<a class="skip" href="#main">${e(ui.skip)}</a>
<header class="hdr"><div class="wrap hdr__in">
<a class="logo" href="#/" aria-label="${e(plan.brand.name)}"><span class="logo__mark" aria-hidden="true">${e(plan.brand.name.slice(0, 1).toUpperCase())}</span><span>${e(plan.brand.name)}</span></a>
<nav class="nav" aria-label="${e(ui.home)}">${nav}</nav>
<div class="hdr__actions"><a class="hdr__phone" data-href="tel" href="tel:+${e(plan.contacts.phone.replace(/\D/g, ""))}" data-bind="phone">${e(plan.contacts.phone)}</a>
${plan.order ? `<button type="button" class="cartbtn" data-cart-open aria-label="${e(ui.cart)}">${icon("cart")}<span class="count" data-cart-count data-zero>0</span></button>` : ""}
<a class="btn btn--accent hdr__cta" href="#/booking">${e(plan.hero.primaryCta)}</a>
<button type="button" class="burger" data-menu-toggle aria-expanded="false" aria-controls="mnav" aria-label="${e(ui.openMenu)}"><span></span></button></div>
</div></header>
<nav class="mnav" id="mnav" hidden aria-label="${e(ui.home)}">${mnav}<div class="mnav__foot"><a class="btn btn--accent btn--block" href="#/booking">${e(plan.hero.primaryCta)}</a><a class="btn btn--block" data-href="tel" href="tel:+${e(plan.contacts.phone.replace(/\D/g, ""))}">${icon("phone")}<span data-bind="phone">${e(plan.contacts.phone)}</span></a></div></nav>
<main id="main">
${home}
${catalog}
${about}
${gallery}
${booking}
${contacts}
${notFound}
</main>
${footer}
<div class="sticky-cta">${plan.order ? `<button type="button" class="btn" style="background:var(--surface)" data-cart-open>${icon("cart")}<span data-cart-count data-zero>0</span></button>` : ""}<a class="btn btn--accent" href="#/booking">${e(plan.hero.primaryCta)}</a></div>
${plan.order ? cartDrawer(plan, ui, delivery) : ""}
<div class="lightbox" data-lightbox-root data-trap hidden role="dialog" aria-modal="true" aria-label="${e(ui.gallery)}"><span class="lb-count" data-lb-count aria-live="polite"></span><button type="button" class="x" aria-label="${e(ui.closeMenu)}">${icon("close")}</button><button type="button" class="lb-nav lb-prev" aria-label="←">‹</button><figure style="margin:0"><img alt=""><figcaption></figcaption></figure><button type="button" class="lb-nav lb-next" aria-label="→">›</button></div>
<div class="toasts" aria-live="polite"></div>
<script id="malik-site" type="application/json">${json({ version: plan.version, plan, photos: Object.fromEntries(Object.entries(photos).filter(([, photo]) => photo).map(([key, photo]) => [key, { url: photo!.url, alt: photo!.alt, ...(photo!.credit ? { credit: photo!.credit, link: photo!.link } : {}) }])) })}</script>
<script id="malik-data" type="application/json">${json(data)}</script>
<script>
/* ${editNote} */
window.SITE_CONFIG = ${json(config)};
</script>
<script>${compactScript(SITE_RUNTIME)}</script>
</body>
</html>`
  return { html, pages: navPages.map(([id]) => id) }
}
