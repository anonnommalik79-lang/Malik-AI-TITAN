import type { SiteSkill } from "./skill-registry"

export type WebsiteSectionType =
  | "logos"
  | "features"
  | "showcase"
  | "stats"
  | "steps"
  | "pricing"
  | "testimonials"
  | "gallery"
  | "faq"
  | "contact"
  | "cta"

export type WebsitePlanItem = {
  title: string
  body?: string
  meta?: string
  value?: string
  price?: string
  bullets?: string[]
}

export type WebsitePlanSection = {
  type: WebsiteSectionType
  id: string
  eyebrow?: string
  title: string
  body?: string
  items?: WebsitePlanItem[]
  cta?: { label: string; href: string }
}

export type WebsitePlan = {
  version: "malik-sites/v1"
  /** One sentence, in the user's language, stating what the planner understood. */
  understood?: string
  locale: "ru" | "kk" | "en"
  brand: {
    name: string
    eyebrow?: string
  }
  seo: {
    title: string
    description: string
  }
  design: {
    theme: "dark" | "light"
    accent: string
    style: "product" | "editorial" | "technical" | "luxury" | "playful"
    radius: "soft" | "medium" | "sharp"
    density: "airy" | "balanced" | "dense"
    heroLayout: "split" | "centered" | "editorial"
    motion: "subtle" | "expressive" | "none"
  }
  navigation: Array<{ label: string; href: string }>
  hero: {
    eyebrow?: string
    title: string
    subtitle: string
    primaryCta: { label: string; href: string }
    secondaryCta?: { label: string; href: string }
    proof?: string
  }
  sections: WebsitePlanSection[]
  footer: {
    tagline: string
    links: Array<{ label: string; href: string }>
  }
}

const SECTION_TYPES = new Set<WebsiteSectionType>([
  "logos",
  "features",
  "showcase",
  "stats",
  "steps",
  "pricing",
  "testimonials",
  "gallery",
  "faq",
  "contact",
  "cta",
])

function cleanText(value: unknown, fallback = "", max = 240) {
  const text = String(value ?? fallback).replace(/\s+/g, " ").trim()
  return (text || fallback).slice(0, max)
}

function safeHref(value: unknown, fallback = "#") {
  const href = cleanText(value, fallback, 180)
  if (/^(#|\/|https?:\/\/|mailto:|tel:)/i.test(href)) return href
  return fallback
}

function safeAccent(value: unknown) {
  const color = cleanText(value, "#7c5cff", 20)
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#7c5cff"
}

function uniqueId(value: unknown, index: number) {
  const base = cleanText(value, `section-${index + 1}`, 64)
    .toLowerCase()
    .replace(/[^a-z0-9а-яёқғүұөһі_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
  return base || `section-${index + 1}`
}

function toItems(value: unknown, fallback: WebsitePlanItem[] = []) {
  if (!Array.isArray(value)) return fallback
  return value.slice(0, 8).map((entry, index) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}
    return {
      title: cleanText(item.title, `Пункт ${index + 1}`, 90),
      body: cleanText(item.body, "", 220),
      meta: cleanText(item.meta, "", 80),
      value: cleanText(item.value, "", 60),
      price: cleanText(item.price, "", 60),
      bullets: Array.isArray(item.bullets)
        ? item.bullets.slice(0, 7).map((bullet) => cleanText(bullet, "", 100)).filter(Boolean)
        : undefined,
    }
  })
}

function detectLocale(prompt: string): WebsitePlan["locale"] {
  if (/[әіңғүұқөһ]/i.test(prompt)) return "kk"
  if (/[а-яё]/i.test(prompt)) return "ru"
  return "en"
}

function defaultCopy(locale: WebsitePlan["locale"]) {
  if (locale === "kk") {
    return {
      eyebrow: "Жаңа буын өнімі",
      hero: "Идеяңызды нақты өнімге айналдырыңыз",
      subtitle: "Түсінікті құрылым, мықты визуал және кез келген экранға бейімделген тәжірибе.",
      primary: "Бастау",
      secondary: "Толығырақ",
      features: "Неге бұл өнім жұмыс істейді",
      cta: "Келесі қадамды бүгін бастаңыз",
    }
  }
  if (locale === "en") {
    return {
      eyebrow: "Built for what is next",
      hero: "Turn your idea into a product people remember",
      subtitle: "A clear story, strong visual hierarchy and a responsive experience across every screen.",
      primary: "Get started",
      secondary: "Learn more",
      features: "Why this product works",
      cta: "Start the next step today",
    }
  }
  return {
    eyebrow: "Продукт нового поколения",
    hero: "Превратите идею в продукт, который запоминают",
    subtitle: "Понятная структура, сильная визуальная иерархия и адаптивный опыт на любом экране.",
    primary: "Начать",
    secondary: "Подробнее",
    features: "Почему этот продукт работает",
    cta: "Сделайте следующий шаг сегодня",
  }
}

export function fallbackWebsitePlan(prompt: string, template = ""): WebsitePlan {
  const locale = detectLocale(prompt)
  const copy = defaultCopy(locale)
  const lower = `${prompt} ${template}`.toLowerCase()
  const light = /(бел|светл|light|white|minimal)/i.test(lower) && !/(черн|dark|black)/i.test(lower)
  const enterprise = /(enterprise|b2b|корпорат|crm|erp|admin|dashboard|панел)/i.test(lower)
  const commerce = /(магаз|shop|store|товар|product|fashion|одежд|catalog)/i.test(lower)
  const luxury = /(luxury|люкс|premium|премиум|fashion|ювелир|hotel|отел)/i.test(lower)
  const brand = cleanText(
    prompt
      .replace(/^(создай|сделай|сгенерируй|create|build|make)\s+/i, "")
      .split(/[,.!?:;\n]/)[0],
    "Malik Project",
    54,
  )

  const features: WebsitePlanItem[] = enterprise
    ? [
        { title: "Единая система", body: "Ключевые процессы и данные собраны в одном понятном рабочем пространстве." },
        { title: "Контроль", body: "Структура интерфейса помогает быстро видеть состояние, риски и следующие действия." },
        { title: "Масштабирование", body: "Компоненты и сценарии готовы расти вместе с продуктом и командой." },
      ]
    : commerce
      ? [
          { title: "Выбор без лишнего шума", body: "Каталог и карточки ведут пользователя к товару быстро и понятно." },
          { title: "Доверие к продукту", body: "Характеристики, преимущества и отзывы встроены в путь покупки." },
          { title: "Удобно на телефоне", body: "Все основные действия рассчитаны на мобильный экран и касание." },
        ]
      : [
          { title: "Ясная ценность", body: "Первый экран сразу объясняет, что это за продукт и зачем он нужен." },
          { title: "Сильная структура", body: "Контент собран в логичную историю без случайных секций и визуального мусора." },
          { title: "Готово к действию", body: "CTA, формы и интерактивные элементы имеют понятные состояния и цель." },
        ]

  return {
    version: "malik-sites/v1",
    locale,
    brand: { name: brand || "Malik Project", eyebrow: copy.eyebrow },
    seo: {
      title: brand || "Malik Project",
      description: cleanText(prompt, copy.subtitle, 160),
    },
    design: {
      theme: light ? "light" : "dark",
      accent: luxury ? "#d9b66f" : enterprise ? "#5b8cff" : commerce ? "#ff6b57" : "#7c5cff",
      style: luxury ? "luxury" : enterprise ? "technical" : "product",
      radius: luxury ? "medium" : "soft",
      density: enterprise ? "dense" : "balanced",
      heroLayout: enterprise ? "split" : luxury ? "editorial" : "centered",
      motion: "subtle",
    },
    navigation: [
      { label: locale === "en" ? "Product" : locale === "kk" ? "Өнім" : "Продукт", href: "#features" },
      { label: locale === "en" ? "How it works" : locale === "kk" ? "Қалай жұмыс істейді" : "Как работает", href: "#steps" },
      { label: locale === "en" ? "Contact" : locale === "kk" ? "Байланыс" : "Контакты", href: "#contact" },
    ],
    hero: {
      eyebrow: copy.eyebrow,
      title: copy.hero,
      subtitle: cleanText(prompt, copy.subtitle, 220),
      primaryCta: { label: copy.primary, href: "#contact" },
      secondaryCta: { label: copy.secondary, href: "#features" },
      proof: enterprise ? "Надёжная архитектура · понятные процессы · адаптивный интерфейс" : "Продуманная структура · адаптивный дизайн · рабочие состояния",
    },
    sections: [
      { type: "features", id: "features", eyebrow: copy.eyebrow, title: copy.features, items: features },
      {
        type: "steps",
        id: "steps",
        eyebrow: locale === "en" ? "Flow" : locale === "kk" ? "Процесс" : "Процесс",
        title: locale === "en" ? "A simple path from interest to action" : locale === "kk" ? "Қызығушылықтан әрекетке дейін" : "Понятный путь от интереса к действию",
        items: [
          { title: "01", body: locale === "en" ? "Understand the value immediately." : "Сразу понять ценность продукта." },
          { title: "02", body: locale === "en" ? "Explore proof and key capabilities." : "Увидеть доказательства и ключевые возможности." },
          { title: "03", body: locale === "en" ? "Take the next action with confidence." : "Уверенно перейти к следующему действию." },
        ],
      },
      {
        type: commerce ? "showcase" : "stats",
        id: "proof",
        eyebrow: locale === "en" ? "Proof" : "Доказательства",
        title: locale === "en" ? "Designed to make the important things obvious" : "Главное видно сразу",
        items: commerce
          ? [
              { title: "Коллекция", body: "Визуальная витрина с ясной иерархией товара и действий." },
              { title: "Карточка", body: "Цена, ценность и следующий шаг находятся там, где пользователь их ожидает." },
              { title: "Покупка", body: "Минимум трения между выбором и целевым действием." },
            ]
          : [
              { title: "Адаптивность", value: "100%", body: "Единая логика на телефоне, планшете и ПК." },
              { title: "Структура", value: "12 col", body: "Предсказуемая сетка и визуальный ритм." },
              { title: "Доступность", value: "A11y", body: "Фокус, контраст и понятные интерактивные состояния." },
            ],
      },
      { type: "cta", id: "contact", title: copy.cta, body: cleanText(prompt, copy.subtitle, 180), cta: { label: copy.primary, href: "#" } },
    ],
    footer: {
      tagline: cleanText(prompt, copy.subtitle, 120),
      links: [
        { label: locale === "en" ? "Product" : "Продукт", href: "#features" },
        { label: locale === "en" ? "Contact" : "Контакты", href: "#contact" },
      ],
    },
  }
}

export function buildPlannerPrompt(prompt: string, template: string, skills: SiteSkill[]) {
  // Names and capability lists tell a model nothing it can act on. The rules do,
  // so they go in verbatim and become the standard the plan is judged against.
  const skillText = skills
    .map((skill, index) => [
      `${index + 1}. ${skill.name} [${skill.source}]`,
      `ROLE: ${skill.role}`,
      ...(skill.rules?.length ? skill.rules.map((rule) => `RULE: ${rule}`) : []),
    ].join("\n"))
    .join("\n\n")

  return `You are Malik Sites Planner. You are NOT the renderer and you MUST NOT write HTML, CSS, JSX, React or Markdown.
Your only job is to convert the user's request into ONE strict JSON WebsitePlan. Malik AI will render the site deterministically from the selected skill system.

FIRST, UNDERSTAND THE REQUEST.
The user may write in Russian, Kazakh, English or a mix, with typos, slang and missing accents. Read past the spelling and work out the real business, audience and purpose. Put that reading in the "understood" field, one sentence, in the user's own language. Everything else in the plan follows from it.

NON-NEGOTIABLE RULES:
- Preserve the user's actual business, product, language, requested sections, colors, tone and functions.
- Do not turn every request into a generic AI/SaaS landing page.
- Do not invent fake awards, fake customers, fake revenue, fake security certifications or fake testimonials presented as facts.
- Prefer concrete copy derived from the request. If information is missing, use neutral useful copy rather than placeholders.
- No lorem ipsum, TODO, "replace this", "your company here", or template filler.
- Design choices must be coherent: one theme, one accent, one spacing rhythm, one component language.
- Use 4-8 meaningful sections; do not add sections that have no job in the user journey.
- Output JSON ONLY. No code fences. No explanation.

WRITE COPY LIKE A PRODUCT WRITER, NOT A TEMPLATE:
- The hero title names what this specific thing is and who it is for. Never "Добро пожаловать", "Наш продукт", "Welcome".
- The hero subtitle is one sentence a real customer would care about: the concrete benefit, not adjectives.
- Every feature title is 2-5 words, and its body says something only this product could say.
- Specifics from the request — numbers, prices, menu items, city names, hours, names — must survive into the plan.
- Section titles are statements, not labels.

DESIGN IS PART OF THE PLAN:
- Pick theme and accent from the subject, not from habit. A coffee shop, a law firm and a crypto dashboard do not share a palette.
- accent must be a hex colour that suits the business and stays readable on the chosen theme.
- style, density and heroLayout must agree: luxury with airy and editorial, technical with dense and split.

SELECTED GITHUB REFERENCE SKILLS:
${skillText}

EXACT JSON SHAPE:
{
  "version":"malik-sites/v1",
  "understood":"one sentence in the user's language stating what they asked for",
  "locale":"ru|kk|en",
  "brand":{"name":"string","eyebrow":"string"},
  "seo":{"title":"string","description":"string"},
  "design":{"theme":"dark|light","accent":"#RRGGBB","style":"product|editorial|technical|luxury|playful","radius":"soft|medium|sharp","density":"airy|balanced|dense","heroLayout":"split|centered|editorial","motion":"subtle|expressive|none"},
  "navigation":[{"label":"string","href":"#section-id"}],
  "hero":{"eyebrow":"string","title":"string","subtitle":"string","primaryCta":{"label":"string","href":"#section-id"},"secondaryCta":{"label":"string","href":"#section-id"},"proof":"string"},
  "sections":[{"type":"logos|features|showcase|stats|steps|pricing|testimonials|gallery|faq|contact|cta","id":"string","eyebrow":"string","title":"string","body":"string","items":[{"title":"string","body":"string","meta":"string","value":"string","price":"string","bullets":["string"]}],"cta":{"label":"string","href":"#section-id"}}],
  "footer":{"tagline":"string","links":[{"label":"string","href":"#section-id"}]}
}

TEMPLATE HINT: ${template || "adaptive"}
USER REQUEST (authoritative):
${prompt}`
}

function jsonCandidate(raw: string) {
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const text = fenced || clean
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  return start >= 0 && end > start ? text.slice(start, end + 1) : ""
}

export function parseWebsitePlan(raw: unknown, prompt: string, template = ""): WebsitePlan {
  const fallback = fallbackWebsitePlan(prompt, template)
  const candidate = jsonCandidate(String(raw || ""))
  if (!candidate) return fallback

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(candidate) as Record<string, unknown>
  } catch {
    return fallback
  }

  const brand = parsed.brand && typeof parsed.brand === "object" ? parsed.brand as Record<string, unknown> : {}
  const seo = parsed.seo && typeof parsed.seo === "object" ? parsed.seo as Record<string, unknown> : {}
  const design = parsed.design && typeof parsed.design === "object" ? parsed.design as Record<string, unknown> : {}
  const hero = parsed.hero && typeof parsed.hero === "object" ? parsed.hero as Record<string, unknown> : {}
  const primary = hero.primaryCta && typeof hero.primaryCta === "object" ? hero.primaryCta as Record<string, unknown> : {}
  const secondary = hero.secondaryCta && typeof hero.secondaryCta === "object" ? hero.secondaryCta as Record<string, unknown> : {}
  const footer = parsed.footer && typeof parsed.footer === "object" ? parsed.footer as Record<string, unknown> : {}

  const locale = parsed.locale === "kk" || parsed.locale === "en" || parsed.locale === "ru" ? parsed.locale : fallback.locale
  const theme = design.theme === "light" ? "light" : design.theme === "dark" ? "dark" : fallback.design.theme
  const style = ["product", "editorial", "technical", "luxury", "playful"].includes(String(design.style))
    ? design.style as WebsitePlan["design"]["style"]
    : fallback.design.style
  const radius = ["soft", "medium", "sharp"].includes(String(design.radius))
    ? design.radius as WebsitePlan["design"]["radius"]
    : fallback.design.radius
  const density = ["airy", "balanced", "dense"].includes(String(design.density))
    ? design.density as WebsitePlan["design"]["density"]
    : fallback.design.density
  const heroLayout = ["split", "centered", "editorial"].includes(String(design.heroLayout))
    ? design.heroLayout as WebsitePlan["design"]["heroLayout"]
    : fallback.design.heroLayout
  const motion = ["subtle", "expressive", "none"].includes(String(design.motion))
    ? design.motion as WebsitePlan["design"]["motion"]
    : fallback.design.motion

  const navigation = Array.isArray(parsed.navigation)
    ? parsed.navigation.slice(0, 7).map((entry) => {
        const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}
        return { label: cleanText(item.label, "Раздел", 44), href: safeHref(item.href, "#") }
      })
    : fallback.navigation

  const sections: WebsitePlanSection[] = Array.isArray(parsed.sections)
    ? parsed.sections.slice(0, 9).map((entry, index) => {
        const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}
        const rawType = String(item.type || "features") as WebsiteSectionType
        const type = SECTION_TYPES.has(rawType) ? rawType : "features"
        const cta = item.cta && typeof item.cta === "object" ? item.cta as Record<string, unknown> : null
        return {
          type,
          id: uniqueId(item.id, index),
          eyebrow: cleanText(item.eyebrow, "", 60),
          title: cleanText(item.title, fallback.sections[index % fallback.sections.length]?.title || "Раздел", 110),
          body: cleanText(item.body, "", 260),
          items: toItems(item.items),
          cta: cta ? { label: cleanText(cta.label, "Подробнее", 48), href: safeHref(cta.href, "#") } : undefined,
        }
      })
    : fallback.sections

  const footerLinks = Array.isArray(footer.links)
    ? footer.links.slice(0, 8).map((entry) => {
        const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}
        return { label: cleanText(item.label, "Ссылка", 44), href: safeHref(item.href, "#") }
      })
    : fallback.footer.links

  return {
    version: "malik-sites/v1",
    understood: cleanText((parsed as Record<string, unknown>).understood, "", 400) || undefined,
    locale,
    brand: {
      name: cleanText(brand.name, fallback.brand.name, 64),
      eyebrow: cleanText(brand.eyebrow, fallback.brand.eyebrow || "", 80),
    },
    seo: {
      title: cleanText(seo.title, fallback.seo.title, 78),
      description: cleanText(seo.description, fallback.seo.description, 170),
    },
    design: {
      theme,
      accent: safeAccent(design.accent),
      style,
      radius,
      density,
      heroLayout,
      motion,
    },
    navigation,
    hero: {
      eyebrow: cleanText(hero.eyebrow, fallback.hero.eyebrow || "", 80),
      title: cleanText(hero.title, fallback.hero.title, 130),
      subtitle: cleanText(hero.subtitle, fallback.hero.subtitle, 280),
      primaryCta: {
        label: cleanText(primary.label, fallback.hero.primaryCta.label, 48),
        href: safeHref(primary.href, fallback.hero.primaryCta.href),
      },
      secondaryCta: Object.keys(secondary).length
        ? { label: cleanText(secondary.label, fallback.hero.secondaryCta?.label || "Подробнее", 48), href: safeHref(secondary.href, fallback.hero.secondaryCta?.href || "#") }
        : fallback.hero.secondaryCta,
      proof: cleanText(hero.proof, fallback.hero.proof || "", 150),
    },
    sections: sections.length ? sections : fallback.sections,
    footer: {
      tagline: cleanText(footer.tagline, fallback.footer.tagline, 150),
      links: footerLinks,
    },
  }
}

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char] || char))
}

function radiusValue(radius: WebsitePlan["design"]["radius"]) {
  if (radius === "sharp") return "8px"
  if (radius === "medium") return "18px"
  return "28px"
}

function sectionHeading(section: WebsitePlanSection) {
  return `<div class="section-head reveal">${section.eyebrow ? `<span class="eyebrow">${esc(section.eyebrow)}</span>` : ""}<h2>${esc(section.title)}</h2>${section.body ? `<p>${esc(section.body)}</p>` : ""}</div>`
}

function iconSvg(index: number) {
  const icons = [
    `<path d="M4 12h16M12 4v16"/>`,
    `<path d="M5 17 10 12l4 4 5-8"/><path d="M19 8v5h-5"/>`,
    `<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8M8 13h5"/>`,
    `<path d="m12 3 2.4 4.8L20 9l-4 3.9.9 5.6L12 16l-4.9 2.5.9-5.6L4 9l5.6-1.2L12 3Z"/>`,
    `<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>`,
  ]
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[index % icons.length]}</svg>`
}

function cards(items: WebsitePlanItem[], className = "cards") {
  return `<div class="${className}">${items.map((item, index) => `<article class="card reveal"><div class="icon">${iconSvg(index)}</div>${item.meta ? `<span class="card-meta">${esc(item.meta)}</span>` : ""}${item.value ? `<strong class="metric">${esc(item.value)}</strong>` : ""}<h3>${esc(item.title)}</h3>${item.body ? `<p>${esc(item.body)}</p>` : ""}${item.bullets?.length ? `<ul>${item.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join("")}</ul>` : ""}</article>`).join("")}</div>`
}

function renderSection(section: WebsitePlanSection) {
  const items = section.items || []
  if (section.type === "logos") {
    return `<section id="${esc(section.id)}" class="section logos-section">${sectionHeading(section)}<div class="logo-row">${items.map((item) => `<span class="logo-pill reveal">${esc(item.title)}</span>`).join("")}</div></section>`
  }
  if (section.type === "features") {
    return `<section id="${esc(section.id)}" class="section">${sectionHeading(section)}${cards(items)}</section>`
  }
  if (section.type === "showcase" || section.type === "gallery") {
    return `<section id="${esc(section.id)}" class="section">${sectionHeading(section)}<div class="showcase-grid">${items.map((item, index) => `<article class="showcase reveal"><div class="showcase-art art-${index % 3}"><span>${String(index + 1).padStart(2, "0")}</span></div><div><h3>${esc(item.title)}</h3>${item.body ? `<p>${esc(item.body)}</p>` : ""}</div></article>`).join("")}</div></section>`
  }
  if (section.type === "stats") {
    return `<section id="${esc(section.id)}" class="section">${sectionHeading(section)}<div class="stats">${items.map((item) => `<article class="stat reveal"><strong>${esc(item.value || item.title)}</strong><span>${esc(item.value ? item.title : item.body || "")}</span>${item.value && item.body ? `<p>${esc(item.body)}</p>` : ""}</article>`).join("")}</div></section>`
  }
  if (section.type === "steps") {
    return `<section id="${esc(section.id)}" class="section">${sectionHeading(section)}<div class="steps">${items.map((item, index) => `<article class="step reveal"><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${esc(item.title)}</h3>${item.body ? `<p>${esc(item.body)}</p>` : ""}</div></article>`).join("")}</div></section>`
  }
  if (section.type === "pricing") {
    return `<section id="${esc(section.id)}" class="section">${sectionHeading(section)}<div class="pricing">${items.map((item, index) => `<article class="price-card reveal ${index === 1 ? "featured" : ""}"><span class="card-meta">${esc(item.meta || "План")}</span><h3>${esc(item.title)}</h3><strong class="price">${esc(item.price || item.value || "По запросу")}</strong>${item.body ? `<p>${esc(item.body)}</p>` : ""}${item.bullets?.length ? `<ul>${item.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join("")}</ul>` : ""}<a class="button ghost" href="${esc(section.cta?.href || "#contact")}">${esc(section.cta?.label || "Выбрать")}</a></article>`).join("")}</div></section>`
  }
  if (section.type === "testimonials") {
    return `<section id="${esc(section.id)}" class="section">${sectionHeading(section)}<div class="quotes">${items.map((item) => `<figure class="quote reveal"><blockquote>“${esc(item.body || item.title)}”</blockquote><figcaption><strong>${esc(item.title)}</strong>${item.meta ? `<span>${esc(item.meta)}</span>` : ""}</figcaption></figure>`).join("")}</div></section>`
  }
  if (section.type === "faq") {
    return `<section id="${esc(section.id)}" class="section faq">${sectionHeading(section)}<div class="faq-list">${items.map((item, index) => `<details class="reveal" ${index === 0 ? "open" : ""}><summary>${esc(item.title)}<span>+</span></summary><p>${esc(item.body || "")}</p></details>`).join("")}</div></section>`
  }
  if (section.type === "contact") {
    return `<section id="${esc(section.id)}" class="section contact">${sectionHeading(section)}<form class="contact-form reveal" onsubmit="event.preventDefault();this.querySelector('button').textContent='Готово';"><label><span>Имя</span><input required name="name" autocomplete="name" /></label><label><span>Email</span><input required type="email" name="email" autocomplete="email" /></label><label class="full"><span>Сообщение</span><textarea name="message" rows="4"></textarea></label><button class="button primary" type="submit">${esc(section.cta?.label || "Отправить")}</button></form></section>`
  }
  return `<section id="${esc(section.id)}" class="section cta-section reveal"><div><span class="eyebrow">${esc(section.eyebrow || "")}</span><h2>${esc(section.title)}</h2>${section.body ? `<p>${esc(section.body)}</p>` : ""}</div><a class="button primary" href="${esc(section.cta?.href || "#")}">${esc(section.cta?.label || "Начать")}</a></section>`
}

export function renderWebsiteFromPlan(plan: WebsitePlan, skills: SiteSkill[]) {
  const dark = plan.design.theme === "dark"
  const bg = dark ? "#070708" : "#f7f7f4"
  const surface = dark ? "#101012" : "#ffffff"
  const surface2 = dark ? "#17171a" : "#efefeb"
  const text = dark ? "#f5f5f3" : "#111112"
  const muted = dark ? "#a3a3a7" : "#626268"
  const border = dark ? "rgba(255,255,255,.10)" : "rgba(17,17,18,.12)"
  const accent = plan.design.accent
  const radius = radiusValue(plan.design.radius)
  const maxWidth = plan.design.density === "airy" ? "1180px" : plan.design.density === "dense" ? "1080px" : "1140px"
  const sectionPad = plan.design.density === "airy" ? "112px" : plan.design.density === "dense" ? "72px" : "92px"
  const heroClass = `hero hero-${plan.design.heroLayout}`
  const motion = plan.design.motion !== "none"

  const nav = plan.navigation.map((item) => `<a href="${esc(item.href)}">${esc(item.label)}</a>`).join("")
  const sections = plan.sections.map(renderSection).join("\n")
  const skillComment = skills.map((skill) => `${skill.name} (${skill.repo})`).join(" | ")

  return `<!doctype html>
<html lang="${esc(plan.locale)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="description" content="${esc(plan.seo.description)}" />
<title>${esc(plan.seo.title)}</title>
<style>
:root{--bg:${bg};--surface:${surface};--surface-2:${surface2};--text:${text};--muted:${muted};--border:${border};--accent:${accent};--radius:${radius};--max:${maxWidth};--section:${sectionPad};color-scheme:${dark ? "dark" : "light"}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit}button,input,textarea{font:inherit}.shell{width:min(var(--max),calc(100% - 40px));margin:auto}.nav{position:sticky;top:0;z-index:50;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(18px)}.nav-inner{min-height:72px;display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{font-weight:850;letter-spacing:-.04em;text-decoration:none;font-size:18px}.nav-links{display:flex;align-items:center;gap:24px}.nav-links a{font-size:13px;color:var(--muted);text-decoration:none}.nav-links a:hover{color:var(--text)}.menu{display:none;border:1px solid var(--border);background:var(--surface);color:var(--text);width:42px;height:42px;border-radius:12px}.hero{min-height:min(860px,88vh);padding:96px 0 80px;display:grid;align-items:center;gap:54px}.hero-centered{text-align:center;justify-items:center}.hero-centered .hero-copy{max-width:920px}.hero-split{grid-template-columns:minmax(0,1.05fr) minmax(340px,.95fr)}.hero-editorial{grid-template-columns:minmax(0,1.3fr) minmax(260px,.7fr);align-items:end}.eyebrow{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:color-mix(in srgb,var(--accent) 78%,var(--text));margin-bottom:16px}.hero h1{font-size:clamp(52px,8.5vw,104px);line-height:.93;letter-spacing:-.072em;margin:0;max-width:1050px}.hero p{font-size:clamp(17px,2vw,21px);line-height:1.6;color:var(--muted);max-width:760px;margin:24px 0 0}.hero-centered p{margin-left:auto;margin-right:auto}.hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:32px}.hero-centered .hero-actions{justify-content:center}.button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:999px;text-decoration:none;font-weight:750;border:1px solid var(--border);transition:transform .18s ease,background .18s ease,color .18s ease}.button:hover{transform:translateY(-2px)}.button.primary{background:var(--text);color:var(--bg);border-color:transparent}.button.ghost{background:var(--surface);color:var(--text)}.proof{margin-top:24px;color:var(--muted);font-size:12px}.hero-visual{position:relative;min-height:430px;border:1px solid var(--border);border-radius:calc(var(--radius) + 8px);background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 16%,var(--surface)),var(--surface));overflow:hidden;padding:18px;box-shadow:0 35px 90px rgba(0,0,0,.18)}.visual-window{height:100%;min-height:392px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);overflow:hidden}.visual-top{height:48px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;padding:0 14px}.visual-top i{width:7px;height:7px;border-radius:50%;background:var(--muted);opacity:.55}.visual-body{padding:20px;display:grid;grid-template-columns:1.15fr .85fr;gap:12px}.visual-panel{min-height:118px;border:1px solid var(--border);border-radius:calc(var(--radius) - 5px);background:var(--surface);padding:16px}.visual-panel.big{grid-row:span 2;min-height:260px;background:linear-gradient(150deg,color-mix(in srgb,var(--accent) 21%,var(--surface)),var(--surface))}.visual-line{height:9px;border-radius:999px;background:var(--surface-2);margin-bottom:9px}.visual-line.w70{width:70%}.visual-line.w45{width:45%}.section{padding:var(--section) 0;border-top:1px solid var(--border)}.section-head{max-width:760px;margin-bottom:38px}.section-head h2,.cta-section h2{font-size:clamp(36px,5vw,62px);line-height:1.02;letter-spacing:-.05em;margin:0}.section-head p,.cta-section p{color:var(--muted);font-size:17px;line-height:1.65;margin:16px 0 0}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.card{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);padding:24px;min-height:220px}.card .icon{width:42px;height:42px;display:grid;place-items:center;border:1px solid var(--border);border-radius:13px;color:var(--accent);margin-bottom:38px}.icon svg{width:20px;height:20px}.card h3,.showcase h3,.step h3,.price-card h3{font-size:20px;letter-spacing:-.025em;margin:0}.card p,.showcase p,.step p,.price-card p,.stat p{color:var(--muted);line-height:1.6;font-size:14px}.card-meta{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:10px}.metric{display:block;font-size:42px;letter-spacing:-.055em;margin-bottom:18px}.card ul,.price-card ul{list-style:none;padding:0;margin:20px 0;display:grid;gap:10px;color:var(--muted);font-size:14px}.card li:before,.price-card li:before{content:"✓";color:var(--accent);margin-right:9px}.logo-row{display:flex;flex-wrap:wrap;gap:10px}.logo-pill{border:1px solid var(--border);border-radius:999px;padding:13px 18px;color:var(--muted);font-weight:700}.showcase-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.showcase{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);overflow:hidden}.showcase>div:last-child{padding:22px}.showcase-art{min-height:280px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 24%,var(--surface)),var(--surface));display:flex;align-items:flex-end;padding:22px}.showcase-art.art-1{background:linear-gradient(25deg,var(--surface),color-mix(in srgb,var(--accent) 18%,var(--surface-2)))}.showcase-art.art-2{background:radial-gradient(circle at 70% 25%,color-mix(in srgb,var(--accent) 32%,transparent),transparent 42%),var(--surface-2)}.showcase-art span{font-size:72px;font-weight:850;letter-spacing:-.07em;color:color-mix(in srgb,var(--text) 18%,transparent)}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}.stat{padding:30px;background:var(--surface);border-right:1px solid var(--border)}.stat:last-child{border-right:0}.stat strong{display:block;font-size:clamp(38px,5vw,64px);letter-spacing:-.06em}.stat span{font-size:13px;color:var(--muted)}.steps{display:grid;gap:0;border-top:1px solid var(--border)}.step{display:grid;grid-template-columns:84px 1fr;gap:24px;padding:28px 0;border-bottom:1px solid var(--border)}.step>span{font-size:12px;color:var(--accent);font-weight:800}.pricing{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.price-card{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);padding:26px}.price-card.featured{border-color:color-mix(in srgb,var(--accent) 55%,var(--border));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 20%,transparent)}.price{display:block;font-size:42px;letter-spacing:-.05em;margin:18px 0}.quotes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.quote{margin:0;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);padding:28px}.quote blockquote{font-size:21px;line-height:1.5;letter-spacing:-.02em;margin:0 0 28px}.quote figcaption{display:flex;flex-direction:column;gap:4px}.quote figcaption span{color:var(--muted);font-size:12px}.faq-list{border-top:1px solid var(--border)}.faq details{border-bottom:1px solid var(--border);padding:20px 0}.faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px;font-weight:700}.faq summary::-webkit-details-marker{display:none}.faq details p{color:var(--muted);line-height:1.65;max-width:760px}.contact-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:820px}.contact-form label{display:grid;gap:8px;color:var(--muted);font-size:12px}.contact-form label.full{grid-column:1/-1}.contact-form input,.contact-form textarea{width:100%;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:14px;padding:14px;outline:none}.contact-form input:focus,.contact-form textarea:focus{border-color:color-mix(in srgb,var(--accent) 60%,var(--border))}.cta-section{display:flex;align-items:end;justify-content:space-between;gap:40px;border:1px solid var(--border);border-radius:calc(var(--radius) + 8px);padding:42px;background:linear-gradient(130deg,color-mix(in srgb,var(--accent) 14%,var(--surface)),var(--surface));margin:var(--section) 0}.cta-section>div{max-width:760px}.footer{border-top:1px solid var(--border);padding:44px 0}.footer-inner{display:flex;align-items:flex-end;justify-content:space-between;gap:32px}.footer p{max-width:520px;color:var(--muted);line-height:1.6}.footer-links{display:flex;gap:18px;flex-wrap:wrap}.footer-links a{color:var(--muted);font-size:13px;text-decoration:none}
${motion ? `.reveal{opacity:0;transform:translateY(14px);transition:opacity .55s ease,transform .55s ease}.reveal.in{opacity:1;transform:none}` : ".reveal{opacity:1}"}
@media(max-width:900px){.hero-split,.hero-editorial{grid-template-columns:1fr}.hero{min-height:auto;padding-top:72px}.cards,.pricing{grid-template-columns:1fr 1fr}.stats{grid-template-columns:1fr}.stat{border-right:0;border-bottom:1px solid var(--border)}.stat:last-child{border-bottom:0}.showcase-grid{grid-template-columns:1fr}.nav-links{display:none}.menu{display:grid;place-items:center}.nav.open .nav-links{display:flex;position:absolute;left:20px;right:20px;top:64px;flex-direction:column;align-items:stretch;padding:14px;border:1px solid var(--border);border-radius:16px;background:var(--surface)}.nav.open .nav-links a{padding:11px}.hero-visual{min-height:360px}.visual-window{min-height:320px}}
@media(max-width:640px){.shell{width:min(100% - 28px,var(--max))}.nav-inner{min-height:64px}.hero h1{font-size:clamp(44px,15vw,70px)}.cards,.pricing,.quotes{grid-template-columns:1fr}.section{padding:70px 0}.cta-section{margin:70px 0;padding:28px;align-items:flex-start;flex-direction:column}.contact-form{grid-template-columns:1fr}.contact-form label.full{grid-column:auto}.footer-inner{align-items:flex-start;flex-direction:column}.visual-body{grid-template-columns:1fr}.visual-panel.big{grid-row:auto}.showcase-art{min-height:220px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}.reveal{opacity:1!important;transform:none!important}}
</style>
</head>
<body>
<!-- Malik Skill Engine sources: ${esc(skillComment)} -->
<nav class="nav" id="siteNav"><div class="shell nav-inner"><a class="brand" href="#top">${esc(plan.brand.name)}</a><div class="nav-links">${nav}</div><button class="menu" id="menuButton" type="button" aria-label="Открыть меню" aria-expanded="false">${iconSvg(0)}</button></div></nav>
<main id="top">
<div class="shell">
<section class="${heroClass}">
  <div class="hero-copy reveal">${plan.hero.eyebrow ? `<span class="eyebrow">${esc(plan.hero.eyebrow)}</span>` : ""}<h1>${esc(plan.hero.title)}</h1><p>${esc(plan.hero.subtitle)}</p><div class="hero-actions"><a class="button primary" href="${esc(plan.hero.primaryCta.href)}">${esc(plan.hero.primaryCta.label)}</a>${plan.hero.secondaryCta ? `<a class="button ghost" href="${esc(plan.hero.secondaryCta.href)}">${esc(plan.hero.secondaryCta.label)}</a>` : ""}</div>${plan.hero.proof ? `<div class="proof">${esc(plan.hero.proof)}</div>` : ""}</div>
  ${plan.design.heroLayout === "centered" ? "" : `<div class="hero-visual reveal" aria-hidden="true"><div class="visual-window"><div class="visual-top"><i></i><i></i><i></i></div><div class="visual-body"><div class="visual-panel big"><div class="visual-line w45"></div><div class="visual-line w70"></div></div><div class="visual-panel"><div class="visual-line w70"></div><div class="visual-line w45"></div></div><div class="visual-panel"><div class="visual-line w45"></div><div class="visual-line w70"></div></div></div></div></div>`}
</section>
${sections}
</div>
</main>
<footer class="footer"><div class="shell footer-inner"><div><a class="brand" href="#top">${esc(plan.brand.name)}</a><p>${esc(plan.footer.tagline)}</p></div><div class="footer-links">${plan.footer.links.map((link) => `<a href="${esc(link.href)}">${esc(link.label)}</a>`).join("")}</div></div></footer>
<script>
(()=>{
  const nav=document.getElementById('siteNav');
  const button=document.getElementById('menuButton');
  button?.addEventListener('click',()=>{const open=nav.classList.toggle('open');button.setAttribute('aria-expanded',String(open));});
  document.querySelectorAll('.nav-links a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');button?.setAttribute('aria-expanded','false');}));
  ${motion ? `const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in');observer.unobserve(entry.target)}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));` : "document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));"}
})();
</script>
</body>
</html>`
}
