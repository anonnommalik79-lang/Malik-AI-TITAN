import type { ForgeLocale } from "./blueprints"
import type { ForgePlan } from "./plan"
import { selectSiteSkills } from "../skill-registry"

/**
 * Malik Site Forge — interface skills from open-source design systems.
 *
 * Each skill is a pattern a well-known GitHub project is known for (Magic UI's
 * bento grid, Swiper's snap carousel, GOV.UK's error summary, Cal.com's time
 * slots…), implemented in the forge's own HTML, CSS and JavaScript. No code is
 * copied from those repositories and nothing is loaded from them at runtime.
 *
 * A skill is reported only when the finished page really carries it: every
 * entry has a check that looks for its markup in the HTML. So the chat can
 * say exactly which skills a site uses, and never claims one it does not.
 */

export type SkillGroup = "layout" | "access" | "motion" | "business" | "theme"

export type ForgeSkill = {
  id: string
  name: string
  repo: string
  url: string
  group: SkillGroup
  does: Record<ForgeLocale, string>
  present: (html: string, plan: ForgePlan) => boolean
}

export type AppliedSkill = { id: string; name: string; repo: string; url: string; group: SkillGroup; does: string }

const has = (needle: string | RegExp) => (html: string) => (typeof needle === "string" ? html.includes(needle) : needle.test(html))

export const FORGE_SKILLS: ForgeSkill[] = [
  { id: "tailwind-layout", name: "Tailwind CSS", repo: "tailwindlabs/tailwindcss", url: "https://github.com/tailwindlabs/tailwindcss", group: "layout",
    does: { ru: "сетки mobile-first и одна шкала отступов", kk: "mobile-first торлары және бір шегіну шкаласы", en: "mobile-first grids and one spacing scale" },
    present: (html) => html.includes("@media (max-width:820px)") && html.includes(".wrap{") },
  { id: "shadcn-composition", name: "shadcn/ui", repo: "shadcn-ui/ui", url: "https://github.com/shadcn-ui/ui", group: "layout",
    does: { ru: "единый язык карточек, кнопок и бейджей", kk: "карточкалар мен батырмалардың бір стилі", en: "one language for cards, buttons and badges" },
    present: (html) => html.includes("--r:") && html.includes(".item{") && html.includes(".badge{") },
  { id: "magicui-bento", name: "Magic UI · Bento Grid", repo: "magicuidesign/magicui", url: "https://github.com/magicuidesign/magicui", group: "layout",
    does: { ru: "бенто-сетка преимуществ с фото", kk: "артықшылықтардың бенто-торы", en: "a bento grid of reasons with a photo" },
    present: has('class="bento') },
  { id: "magicui-marquee", name: "Magic UI · Marquee", repo: "magicuidesign/magicui", url: "https://github.com/magicuidesign/magicui", group: "motion",
    does: { ru: "бегущая лента разделов", kk: "бөлімдердің жүгіртпе таспасы", en: "a scrolling band of sections" },
    present: has('class="marquee"') },
  { id: "magicui-ticker", name: "Magic UI · Number Ticker", repo: "magicuidesign/magicui", url: "https://github.com/magicuidesign/magicui", group: "motion",
    does: { ru: "цифры, которые досчитываются при прокрутке", kk: "айналдырғанда санайтын сандар", en: "numbers that count up on scroll" },
    present: has("data-count=") },
  { id: "swiper-rail", name: "Swiper", repo: "nolimits4web/swiper", url: "https://github.com/nolimits4web/swiper", group: "layout",
    does: { ru: "карусель позиций со scroll-snap и стрелками", kk: "scroll-snap және көрсеткілері бар карусель", en: "a snap carousel with arrows" },
    present: has("data-rail") },
  { id: "radix-accessibility", name: "Radix Primitives", repo: "radix-ui/primitives", url: "https://github.com/radix-ui/primitives", group: "access",
    does: { ru: "меню, вопросы и окна управляются с клавиатуры", kk: "мәзір мен терезелер пернетақтамен басқарылады", en: "menus, FAQ and dialogs work from the keyboard" },
    present: (html) => html.includes("aria-expanded") && html.includes("<details") && html.includes('aria-modal="true"') },
  { id: "focus-trap", name: "focus-trap", repo: "focus-trap/focus-trap", url: "https://github.com/focus-trap/focus-trap", group: "access",
    does: { ru: "фокус не убегает из корзины и галереи", kk: "фокус себет пен галереядан шықпайды", en: "focus stays inside the basket and gallery" },
    present: has("data-trap") },
  { id: "wcag", name: "WCAG 2.2", repo: "w3c/wcag", url: "https://github.com/w3c/wcag", group: "access",
    does: { ru: "контраст акцента проверяется, кнопки от 44 px, переход к содержимому", kk: "акцент контрасты тексеріледі, 44 px батырмалар", en: "checked accent contrast, 44 px targets, skip link" },
    present: (html) => html.includes('class="skip"') && html.includes(":focus-visible") },
  { id: "govuk-forms", name: "GOV.UK Frontend", repo: "alphagov/govuk-frontend", url: "https://github.com/alphagov/govuk-frontend", group: "access",
    does: { ru: "сводка ошибок формы с переходом к полю", kk: "өрісті көрсететін қателер тізімі", en: "an error summary that jumps to each field" },
    present: has("data-errsum") },
  { id: "chakra-forms", name: "Chakra UI", repo: "chakra-ui/chakra-ui", url: "https://github.com/chakra-ui/chakra-ui", group: "access",
    does: { ru: "подпись и понятная ошибка у каждого поля", kk: "әр өрістің белгісі мен қатесі", en: "a label and a clear error on every field" },
    present: has("field__error") },
  { id: "motion-interactions", name: "Motion", repo: "motiondivision/motion", url: "https://github.com/motiondivision/motion", group: "motion",
    does: { ru: "микроанимации до 300 мс, выключаются по настройке «меньше движения»", kk: "300 мс-қа дейінгі анимация, «азырақ қозғалыс» құрметтеледі", en: "sub-300 ms micro-interactions that respect reduced motion" },
    present: has("prefers-reduced-motion") },
  { id: "aos-reveal", name: "AOS", repo: "michalsnik/aos", url: "https://github.com/michalsnik/aos", group: "motion",
    does: { ru: "секции мягко появляются при прокрутке", kk: "бөлімдер айналдырғанда пайда болады", en: "sections ease in as you scroll" },
    present: has("data-reveal") },
  { id: "photoswipe", name: "PhotoSwipe", repo: "dimsemenov/PhotoSwipe", url: "https://github.com/dimsemenov/PhotoSwipe", group: "motion",
    does: { ru: "галерея на весь экран: стрелки, свайп, счётчик", kk: "толық экранды галерея: көрсеткі, свайп, санауыш", en: "full-screen gallery with keys, swipe and a counter" },
    present: has("data-lb-count") },
  { id: "calcom-slots", name: "Cal.com", repo: "calcom/cal.com", url: "https://github.com/calcom/cal.com", group: "business",
    does: { ru: "свободное время кнопками — из часов работы", kk: "жұмыс уақытынан бос уақыт батырмалары", en: "free time slots from the opening hours" },
    present: has("data-slots") },
  { id: "ics-calendar", name: "ics", repo: "adamgibbons/ics", url: "https://github.com/adamgibbons/ics", group: "business",
    does: { ru: "бронь добавляется в календарь файлом .ics", kk: "брондау .ics күнтізбеге қосылады", en: "bookings go to the calendar as .ics" },
    present: has("data-ics") },
  { id: "polaris-cart", name: "Shopify Polaris", repo: "Shopify/polaris", url: "https://github.com/Shopify/polaris", group: "business",
    does: { ru: "корзина: количество, суммы, пустое состояние, оформление", kk: "себет: саны, сомасы, рәсімдеу", en: "a basket with quantities, totals and checkout" },
    present: (html, plan) => plan.order && html.includes("data-checkout-form") },
  { id: "radix-colors", name: "Radix Colors", repo: "radix-ui/colors", url: "https://github.com/radix-ui/colors", group: "theme",
    does: { ru: "шкала оттенков из одного акцентного цвета", kk: "бір акценттен реңктер шкаласы", en: "a tint scale from one accent colour" },
    present: has("--accent-3:") },
  { id: "open-props", name: "Open Props", repo: "argyleink/open-props", url: "https://github.com/argyleink/open-props", group: "theme",
    does: { ru: "токены теней и кривых анимации", kk: "көлеңке және анимация токендері", en: "shadow and easing tokens" },
    present: has("--ease-out:") },
  { id: "daisy-theme-system", name: "daisyUI", repo: "saadeghi/daisyui", url: "https://github.com/saadeghi/daisyui", group: "theme",
    does: { ru: "тема из токенов: один акцент — для действий", kk: "токендерден тақырып: акцент тек әрекетке", en: "a token theme with one action accent" },
    present: (html) => html.includes("--accent:") && html.includes("--accent-ink:") },
  { id: "inter-numerals", name: "Inter", repo: "rsms/inter", url: "https://github.com/rsms/inter", group: "theme",
    does: { ru: "ровные табличные цифры в ценах и суммах", kk: "бағалардағы тегіс кестелік сандар", en: "tabular figures in prices and totals" },
    present: has("tabular-nums") },
  { id: "lucide-iconography", name: "Lucide", repo: "lucide-icons/lucide", url: "https://github.com/lucide-icons/lucide", group: "theme",
    does: { ru: "иконки одной толщины в сетке 24×24, всегда с подписью", kk: "24×24 бір қалыңдықтағы белгішелер", en: "one-stroke 24×24 icons, always with a label" },
    present: has('<symbol id="i-') },
  { id: "flowbite-marketing", name: "Flowbite", repo: "themesberg/flowbite", url: "https://github.com/themesberg/flowbite", group: "layout",
    does: { ru: "порядок секций: обещание → доказательство → действие", kk: "бөлімдер реті: уәде → дәлел → әрекет", en: "section order: promise → proof → action" },
    present: (html) => html.includes('class="cta') && html.includes('class="faq') },
  { id: "schema-org", name: "Schema.org", repo: "schemaorg/schemaorg", url: "https://github.com/schemaorg/schemaorg", group: "theme",
    does: { ru: "разметка для поисковиков: адрес, часы, цены", kk: "іздеу жүйелеріне белгілеу: мекенжай, уақыт, баға", en: "search markup: address, hours, prices" },
    present: has("openingHoursSpecification") },
  { id: "h5bp", name: "HTML5 Boilerplate", repo: "h5bp/html5-boilerplate", url: "https://github.com/h5bp/html5-boilerplate", group: "theme",
    does: { ru: "мета-теги, значок вкладки и превью для соцсетей", kk: "мета-тегтер, бет белгісі, әлеуметтік желі превьюі", en: "meta tags, a tab icon and social previews" },
    present: (html) => html.includes('rel="icon"') && html.includes('property="og:title"') },
  { id: "web-vitals", name: "web-vitals", repo: "GoogleChrome/web-vitals", url: "https://github.com/GoogleChrome/web-vitals", group: "theme",
    does: { ru: "главное фото грузится первым, остальные — по мере прокрутки", kk: "басты фото алдымен, қалғаны кейін жүктеледі", en: "the hero photo loads first, the rest lazily" },
    present: (html) => html.includes('fetchpriority="high"') && html.includes('loading="lazy"') },
]

/** The skills the finished page really carries, in a stable order. */
export function appliedSkills(html: string, plan: ForgePlan): AppliedSkill[] {
  return FORGE_SKILLS.filter((skill) => {
    try { return skill.present(html, plan) } catch { return false }
  }).map((skill) => ({ id: skill.id, name: skill.name, repo: skill.repo, url: skill.url, group: skill.group, does: skill.does[plan.locale] || skill.does.en }))
}

/**
 * Copy rules for the planner from the shared site-skill registry: only the
 * skills that govern words (honest copy, section logic, pricing clarity) —
 * the visual skills are applied by the renderer, not described to the model.
 */
export function plannerSkillRules(prompt: string, blueprintId: string): string[] {
  const chosen = selectSiteSkills(prompt, blueprintId).filter((skill) => skill.category === "content")
  const lines: string[] = []
  for (const skill of chosen) for (const rule of skill.rules) lines.push(`- ${rule} (${skill.source})`)
  return [...new Set(lines)].slice(0, 10)
}

const GROUP_LABEL: Record<ForgeLocale, Record<SkillGroup, string>> = {
  ru: { layout: "Сетка и компоненты", access: "Доступность и формы", motion: "Движение и фото", business: "Бизнес-логика", theme: "Тема, SEO и скорость" },
  kk: { layout: "Тор және компоненттер", access: "Қолжетімділік және формалар", motion: "Қозғалыс және фото", business: "Бизнес-логика", theme: "Тақырып, SEO және жылдамдық" },
  en: { layout: "Layout and components", access: "Accessibility and forms", motion: "Motion and photos", business: "Business logic", theme: "Theme, SEO and speed" },
}

/** Markdown lines for the chat: what each skill did, grouped, with links to the projects. */
export function skillLines(skills: AppliedSkill[], locale: ForgeLocale): string[] {
  const order: SkillGroup[] = ["layout", "access", "motion", "business", "theme"]
  return order.map((group) => {
    const inGroup = skills.filter((skill) => skill.group === group)
    if (!inGroup.length) return ""
    return `- **${GROUP_LABEL[locale][group]}:** ${inGroup.map((skill) => `[${skill.name}](${skill.url}) — ${skill.does}`).join("; ")}`
  }).filter(Boolean)
}
