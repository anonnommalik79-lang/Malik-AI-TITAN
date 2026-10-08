"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react"
import { ArrowLeft, Code2, Download, ExternalLink, Globe2, Loader2, Monitor, Plus, RotateCcw, Search, Smartphone, Trash2, Upload } from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { buildTemplateSite } from "@/lib/website/site-template-builder"
import { OverlayPortal } from "@/components/sovereign/OverlayPortal"

export type WebsiteGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type Site = { id: string; title: string; prompt: string; html: string; createdAt: string; previousVersions?: string[] }
type Template = { id: string; title: string; subtitle: string; category: string; prompt: string; index: number }

const ENDPOINT = "/api/generate/website"
const STORAGE_KEY = "malik-sites-v6"
const DEFAULT_PROMPT = "Создай современный премиальный сайт мирового уровня: сильный hero, чистая типографика, адаптивная сетка, продукт в центре, доверие, CTA, FAQ и цельная визуальная система."

/**
 * The previous gallery: thirty photographs, each opening a page built by the
 * shared site builder. It is hidden from the Sites section in favour of the
 * premium library below, but kept intact (seeds, photographs and builder) so it
 * can come back without being rebuilt.
 */
const SEEDS = [
  ["aurelia-jewelry", "Aurelia Jewelry", "Ювелирный дом", "Люкс", "luxury jewelry, black and gold, diamonds, cinematic editorial"],
  ["porsche-911", "Porsche 911", "Automotive flagship", "Авто", "cinematic premium sports car, night, precision, red accents"],
  ["nike-performance", "Nike Performance", "Sport & e-commerce", "Бренды", "performance sports ecommerce, dark campaign, strong product hero"],
  ["rolex-heritage", "Rolex Heritage", "Часы и наследие", "Люкс", "emerald and gold luxury watch heritage, precision, premium editorial"],
  ["oud-kalon", "Oud Kalon", "Нишевая парфюмерия", "Аромат", "dark amber niche fragrance, fire, luxury, tactile materials"],
  ["apple-experience", "Apple Experience", "Технологичный продукт", "Технологии", "ultra clean premium technology product, minimal cinematic presentation"],
  ["zara-modern", "Zara Modern", "Fashion editorial", "Одежда", "minimal fashion editorial, monochrome collection, magazine typography"],
  ["tesla-tomorrow", "Tesla Tomorrow", "EV & clean energy", "Технологии", "electric vehicle, architecture, clean energy, future lifestyle"],
  ["lamborghini-noir", "Lamborghini Noir", "Supercar performance", "Авто", "black and red hypercar, premium performance, dramatic lighting"],
  ["aura-jewelry", "Aura Fine Jewelry", "High jewelry campaign", "Люкс", "fine jewelry campaign, warm bokeh, diamonds, museum-level luxury"],
  ["alpha-camera", "Alpha Camera Studio", "Creator hardware", "Технологии", "professional camera product, creator hardware, black studio lighting"],
  ["electric-residence", "Electric Residence", "EV + smart home", "Технологии", "smart home and electric mobility ecosystem, architecture, premium future"],
  ["dreamline-car", "Dreamline Sports Car", "Automotive editorial", "Авто", "premium sports car editorial, cinematic road, bold typography"],
  ["maison-elegance", "Maison Elegance", "Luxury couture", "Одежда", "luxury couture, elegant editorial, refined fashion campaign"],
  ["skyline-residence", "Skyline Residence", "Prime real estate", "Недвижимость", "premium skyline real estate, modern architecture, luxury residence"],
  ["health-performance", "Health Performance", "Fitness & wellness", "Здоровье", "premium fitness wellness, athletic editorial, clean performance system"],
  ["nexus-academy", "Nexus Academy", "Premium education", "Образование", "premium academy, modern education, library, confident editorial layout"],
  ["lumiere-dining", "Lumière Dining", "Fine dining", "Еда", "fine dining, cinematic cuisine, dark restaurant, reservation-first design"],
  ["terra-expedition", "Terra Expedition", "Mountain travel", "Путешествия", "mountain expedition, premium travel, cinematic landscape"],
  ["aurelia-signature", "Aurelia Signature", "Diamond collection", "Люкс", "signature diamond collection, black gold editorial luxury"],
  ["vanta-audio", "Vanta Reference Audio", "High-end audio", "Технологии", "high-end audio, headphones, dark product studio, precision"],
  ["solstice-resorts", "Solstice Resorts", "Ultra luxury hospitality", "Путешествия", "ocean resort, infinity pool, warm sunset, ultra luxury hospitality"],
  ["altitude-one", "Altitude One", "Private aviation", "Путешествия", "private jet charter, sunset, discreet executive luxury"],
  ["lumora-skincare", "Lumora Skincare", "Beauty & skincare", "Красота", "premium skincare, clean beauty, tactile materials, editorial photography"],
  ["atlas-capital", "Atlas Capital", "Private wealth", "Финансы", "private wealth, premium finance, restrained institutional luxury"],
  ["haven-atelier", "Haven Atelier", "Interior & furniture", "Интерьер", "luxury interior, furniture atelier, warm architectural editorial"],
  ["summit-terrain", "Summit Terrain", "Outdoor gear", "Спорт", "premium outdoor gear, mountains, performance equipment, cinematic expedition"],
  ["velora-coffee", "Velora Coffee House", "Coffee & chocolate", "Еда", "artisan coffee and chocolate, dark warm premium food editorial"],
  ["civitas-studio", "Civitas Studio", "Sustainable architecture", "Архитектура", "sustainable architecture, smart home, clean future, premium studio"],
  ["aegean-escape", "Aegean Escape", "Island travel", "Путешествия", "mediterranean island, white architecture, sea, premium travel editorial"],
] as const

/**
 * Every template here opens as a working website, not as a photograph.
 *
 * The card image is a mock-up of a homepage; on its own it is a picture and
 * nothing more. Each category carries a colour and a voice, and those turn the
 * shared site builder into thirty real, responsive, standalone pages - the same
 * machinery the Library uses for its hundred.
 */
const GALLERY_STYLES: Record<string, { accent: string; headline: string; tagline: string }> = {
  "Люкс": { accent: "#e8c274", headline: "TIMELESS BY DESIGN.", tagline: "Precision, character and craftsmanship made to outlive trends." },
  "Авто": { accent: "#ffc107", headline: "BEYOND LIMITS.", tagline: "Performance engineered for a world that refuses to stand still." },
  "Бренды": { accent: "#ff5f4d", headline: "MADE TO MOVE.", tagline: "A brand built on performance, presence and the will to keep going." },
  "Аромат": { accent: "#d8a35f", headline: "A SIGNATURE IN THE AIR.", tagline: "A distinctive experience created with detail, depth and lasting presence." },
  "Технологии": { accent: "#7cc7ff", headline: "BUILT FOR TOMORROW.", tagline: "Intelligent technology, refined for the way the future should feel." },
  "Одежда": { accent: "#f1c6d9", headline: "ICONIC STYLE.", tagline: "A modern collection built around form, confidence and unmistakable identity." },
  "Недвижимость": { accent: "#d9ba7c", headline: "OWN THE HORIZON.", tagline: "Exceptional spaces, considered architecture and a new standard of living." },
  "Здоровье": { accent: "#7ce8b0", headline: "STRONGER, EVERY DAY.", tagline: "Training, recovery and nutrition built into one honest system." },
  "Образование": { accent: "#9caeff", headline: "LEARN LIKE IT MATTERS.", tagline: "Serious teaching, modern tools and a path that actually finishes." },
  "Еда": { accent: "#f0ad6a", headline: "TASTE, REIMAGINED.", tagline: "A cinematic dining experience where craft, atmosphere and flavour meet." },
  "Путешествия": { accent: "#83d4ff", headline: "GO BEYOND.", tagline: "Extraordinary destinations designed around effortless, memorable travel." },
  "Красота": { accent: "#e8a8c9", headline: "SKIN, HONESTLY.", tagline: "Formulated with restraint, tested properly and made to be used daily." },
  "Финансы": { accent: "#a9b7c9", headline: "QUIET CONFIDENCE.", tagline: "Considered decisions, long horizons and a standard that does not move." },
  "Интерьер": { accent: "#d7b48a", headline: "ROOMS THAT HOLD.", tagline: "Materials, light and proportion arranged so a space feels finished." },
  "Спорт": { accent: "#b6ff4e", headline: "MOVE WITHOUT LIMITS.", tagline: "Performance, precision and energy engineered for the next move." },
  "Архитектура": { accent: "#cfd6de", headline: "STRUCTURE AS INTENT.", tagline: "Sustainable building where every line answers to how people live." },
}

const FALLBACK_STYLE = { accent: "#e8c274", headline: "MAKE IT LEGENDARY.", tagline: "A premium interface system built around one clear idea." }

function galleryStyle(category: string) {
  return GALLERY_STYLES[category] || FALLBACK_STYLE
}

function templateSite(template: Template, origin: string) {
  const style = galleryStyle(template.category)
  return buildTemplateSite({
    name: template.title,
    category: template.category,
    subcategory: template.subtitle,
    preview: `/sites/gallery/${template.id}.webp`,
    accent: style.accent,
    headline: style.headline,
    tagline: style.tagline,
    number: String(template.index + 1).padStart(3, "0"),
  }, origin)
}

const TEMPLATES: Template[] = SEEDS.map(([id, title, subtitle, category, direction], index) => ({
  id,
  title,
  subtitle,
  category,
  index,
  prompt: `Создай оригинальный production-ready сайт в направлении: ${direction}. Используй сильный hero, мировую типографику, адаптивную сетку, реальные секции продукта, доверие и CTA. Не копируй чужие логотипы, тексты или фирменные элементы буквально.`,
}))

/**
 * Every template now has its own photograph.
 *
 * These thirty previews used to be one 42KB sprite sliced by CSS: a single
 * image blown up to 300%x1000% and shifted so that one tile showed through.
 * Thirty tiles inside 42KB is about 1.4KB each, which is why the cards looked
 * soft and grey - there was nothing there to show. They are now thirty separate
 * 1440x810 WebP files, 2.1MB for the whole gallery, and each card gets a real
 * picture at the size it is actually displayed.
 *
 * Loading is lazy and the intrinsic size is declared, so thirty photographs
 * cost nothing until they scroll into view and the grid never jumps while they
 * arrive.
 */
function TemplatePreview({ template, priority = false }: { template: Template; priority?: boolean }) {
  return (
    <span className="shotViewport" aria-hidden="true">
      <img
        className="shotImage"
        src={`/sites/gallery/${template.id}.webp`}
        alt=""
        width={1440}
        height={810}
        draggable={false}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
      />
    </span>
  )
}

/** The previous gallery, kept available but no longer shown in the section. */
export const LEGACY_TEMPLATES = TEMPLATES
export { TemplatePreview as LegacyTemplatePreview, templateSite as legacyTemplateSite }

/**
 * The premium library: complete, hand-built websites rather than one builder
 * dressed in thirty colours. Each is a standalone HTML file in
 * /public/sites/v2 with its own design language, typography, photography and
 * working interface - tabs, filters, carts, calculators, booking forms and
 * dialogs all run, on a phone as well as a desktop.
 */
type Premium = { id: string; title: string; subtitle: string; category: string; features: string; tone: string }

const PREMIUM: Premium[] = [
  { id: "nova-ai", title: "Nova AI", subtitle: "ИИ-агенты для команд", category: "Технологии", features: "Живой промпт, тарифы месяц/год, FAQ, заявка на демо", tone: "#7c6cff" },
  { id: "lumen-bank", title: "Lumen", subtitle: "Цифровой банк и карта", category: "Технологии", features: "3D-карта, калькулятор кэшбэка, тарифы, заявка на карту", tone: "#2f5bff" },
  { id: "maison-oree", title: "Maison Orée", subtitle: "Ювелирный дом", category: "Мода и люкс", features: "Фильтр коллекций, избранное и корзина, запись на примерку", tone: "#c9a45c" },
  { id: "ember-dining", title: "Ember", subtitle: "Ресторан живого огня", category: "Еда", features: "Меню по вкладкам, дегустационный сет, бронь стола", tone: "#e0662f" },
  { id: "azure-resort", title: "Azure Cove", subtitle: "Курорт у моря", category: "Путешествия", features: "Поиск по датам, расчёт ночей и цены, виллы, спа", tone: "#2c8fa8" },
  { id: "skyline-estates", title: "Skyline Estates", subtitle: "Элитная недвижимость", category: "Недвижимость", features: "Поиск объектов, избранное, ипотечный калькулятор", tone: "#2f6b57" },
  { id: "noir-fashion", title: "NOIR", subtitle: "Магазин одежды", category: "Мода и люкс", features: "Фильтры, быстрый просмотр с размерами, лукбук, корзина", tone: "#3a3a3a" },
  { id: "forge-dev", title: "Forge", subtitle: "Платформа для разработчиков", category: "Технологии", features: "Терминал деплоя, вкладки кода, копирование команд, тарифы", tone: "#5b5bd6" },
  { id: "pulse-agency", title: "PULSE", subtitle: "Креативное агентство", category: "Креатив", features: "Кейсы, бегущая строка, бриф с выбором бюджета", tone: "#ff2e88" },
  { id: "ritm-app", title: "Ритм", subtitle: "Мобильное приложение", category: "Технологии", features: "Экраны телефона, карусель отзывов, тарифы, FAQ", tone: "#ff5a1f" },
  { id: "lumiere-skin", title: "Lumière", subtitle: "Уходовая косметика", category: "Мода и люкс", features: "Тест на тип кожи, ритуалы ухода, состав, корзина", tone: "#b9785b" },
  { id: "altitude-travel", title: "Altitude", subtitle: "Горные экспедиции", category: "Путешествия", features: "Отсчёт до старта, фильтр сложности, маршрут по дням", tone: "#ff5b14" },
  { id: "bloom-coffee", title: "Bloom", subtitle: "Кофейня и обжарка", category: "Еда", features: "Напитки с размерами, подписка со скидкой, кофейни", tone: "#b8743a" },
  { id: "form-architects", title: "FORM", subtitle: "Архитектурное бюро", category: "Недвижимость", features: "Швейцарская сетка, индекс проектов, заявка на проект", tone: "#ff3b1f" },
  { id: "alina-portfolio", title: "Алина Ким", subtitle: "Портфолио дизайнера", category: "Креатив", features: "Кейсы с метриками, живые часы, отзывы, контакт", tone: "#2f4bff" },
]

const premiumUrl = (id: string) => `/sites/v2/${id}.html`

/**
 * A card shows the site itself, running, rather than a picture of it.
 *
 * The page is rendered at a real desktop width (1440x810) and scaled down to
 * the card, so the typography and layout are exactly what opens. `?preview=1`
 * tells the template to show every section at once and hold its animations
 * still. The frame is only mounted when the card comes near the screen, and it
 * never takes the pointer - the card itself is the button.
 */
function LiveTemplate({ template, priority = false }: { template: Premium; priority?: boolean }) {
  const box = useRef<HTMLSpanElement>(null)
  const [scale, setScale] = useState(0)
  const [visible, setVisible] = useState(priority)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const element = box.current
    if (!element) return
    const measure = () => setScale(element.clientWidth / 1440)
    measure()
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    resize?.observe(element)
    let watch: IntersectionObserver | null = null
    if (!visible) {
      if (typeof IntersectionObserver === "undefined") setVisible(true)
      else {
        const root = element.closest(".malikSites")
        watch = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); watch?.disconnect() }
        }, { root, rootMargin: "500px 0px" })
        watch.observe(element)
      }
    }
    return () => { resize?.disconnect(); watch?.disconnect() }
  }, [visible])

  return (
    <span ref={box} className="liveViewport" aria-hidden="true" style={{ "--tone": template.tone } as CSSProperties}>
      <span className={`livePoster${ready ? " is-hidden" : ""}`}><b>{template.title}</b><small>{template.subtitle}</small><i /></span>
      {visible && scale > 0 && (
        <iframe
          className="liveFrame"
          src={`${premiumUrl(template.id)}?preview=1`}
          title={`Превью ${template.title}`}
          tabIndex={-1}
          width={1440}
          height={810}
          loading={priority ? "eager" : "lazy"}
          sandbox="allow-scripts"
          onLoad={() => setReady(true)}
          style={{ transform: `scale(${scale})` }}
        />
      )}
    </span>
  )
}

/**
 * Premium templates carry a shared runtime (interactions) and base stylesheet.
 * Neither is something a revision should touch, and together they are a large
 * share of the file, so they are taken out before the page goes to the model
 * and put back, byte for byte, when it returns.
 */
const RUNTIME_BLOCKS = [
  { marker: "<!--malik:base-->", pattern: /<style id="malik-base">[\s\S]*?<\/style>/, before: /<\/head>/i },
  { marker: "<!--malik:runtime-->", pattern: /<script id="malik-runtime">[\s\S]*?<\/script>/, before: /<\/body>/i },
]

function stripRuntime(source: string) {
  const kept: string[] = []
  let lean = source
  for (const block of RUNTIME_BLOCKS) {
    const found = lean.match(block.pattern)
    kept.push(found ? found[0] : "")
    if (found) lean = lean.replace(found[0], () => block.marker)
  }
  return { lean, kept }
}

function restoreRuntime(output: string, kept: string[]) {
  let result = output
  RUNTIME_BLOCKS.forEach((block, index) => {
    const original = kept[index]
    if (!original) return
    if (result.includes(block.marker)) result = result.replace(block.marker, () => original)
    else if (!block.pattern.test(result)) result = result.replace(block.before, (end) => `${original}\n${end}`)
  })
  return result
}

function normalizeHtml(value: string) {
  return value.trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim()
}

export function WebsiteGenerationStudio({ onOpenCodex, onOpenCanvas }: WebsiteGenerationStudioProps) {
  const [sites, setSites] = useState<Site[]>([])
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("Все")
  const [builder, setBuilder] = useState(false)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [html, setHtml] = useState("")
  const [siteId, setSiteId] = useState<string | null>(null)
  const [editInstruction, setEditInstruction] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [zoomed, setZoomed] = useState<Premium | null>(null)
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [opening, setOpening] = useState<string | null>(null)
  const [openCard, setOpenCard] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /**
   * On a phone the caption used to be painted over every photograph all the
   * time, because there is no hover to reveal it with. That covered the bottom
   * third of every picture in a gallery whose entire job is showing pictures.
   *
   * So the photograph is now shown clean, and the caption is something the
   * person asks for: the first tap reveals it, the second opens the picture
   * full size. On a mouse, hover still reveals it and a click still opens it -
   * nothing to learn, because pointing at a thing already showed you the
   * caption.
   */
  const [touchOnly, setTouchOnly] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const query = window.matchMedia("(hover: none)")
    const sync = () => setTouchOnly(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  // Escape closes the enlarged photo, and the page behind it must not scroll
  // while it is open - on a phone that is the difference between a lightbox and
  // a trap.
  useEffect(() => {
    if (!zoomed) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setZoomed(null) }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKey)
    }
  }, [zoomed])

  useEffect(() => {
    let storedSites: Site[] = []
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
      if (Array.isArray(stored)) {
        storedSites = stored.filter((item): item is Site => Boolean(item && typeof item.id === "string" && typeof item.html === "string")).slice(0, 24)
        setSites(storedSites)
      }
    } catch {}
    try {
      const savedId = window.sessionStorage.getItem("malik-site-open-id-v1")
      if (savedId) {
        window.sessionStorage.removeItem("malik-site-open-id-v1")
        const saved = storedSites.find((site) => site.id === savedId)
        if (saved) {
          window.sessionStorage.removeItem("malik-site-template-prompt-v1")
          setPrompt(saved.prompt)
          setHtml(saved.html)
          setSiteId(saved.id)
          setBuilder(true)
          return
        }
      }
      const templatePrompt = window.sessionStorage.getItem("malik-site-template-prompt-v1")
      if (templatePrompt) {
        window.sessionStorage.removeItem("malik-site-template-prompt-v1")
        setPrompt(templatePrompt)
        setHtml("")
        setSiteId(null)
        setBuilder(true)
      }
    } catch {}
  }, [])

  const saveSites = (next: Site[]) => {
    setSites(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 24)))
      window.dispatchEvent(new Event("malik-sites-updated"))
    } catch { setError("Сайт создан, но память браузера заполнена. Скачайте HTML, чтобы не потерять работу.") }
  }

  const categories = useMemo(() => ["Все", ...Array.from(new Set(PREMIUM.map((item) => item.category)))], [])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return PREMIUM.filter((item) =>
      (category === "Все" || item.category === category) &&
      (!q || `${item.title} ${item.subtitle} ${item.category} ${item.features}`.toLowerCase().includes(q)),
    )
  }, [query, category])

  const openZoomed = (template: Premium) => {
    setDevice("desktop")
    setZoomed(template)
  }

  const openTemplateInTab = () => {
    if (!zoomed) return
    window.open(premiumUrl(zoomed.id), "_blank", "noopener,noreferrer")
  }

  const downloadTemplate = () => {
    if (!zoomed) return
    const link = document.createElement("a")
    link.href = premiumUrl(zoomed.id)
    link.download = `${zoomed.id}.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  /**
   * "Use" loads the real template into the builder: it becomes one of the
   * person's sites straight away, with the live preview, download, and AI edits
   * ("сделай тёмную тему", "замени меню") working on the actual page.
   */
  async function openTemplate(template: Premium) {
    if (opening) return
    setOpening(template.id)
    setError("")
    try {
      const response = await fetch(premiumUrl(template.id))
      if (!response.ok) throw new Error(String(response.status))
      const source = await response.text()
      if (!/<html[\s>]/i.test(source)) throw new Error("not html")
      const id = crypto.randomUUID()
      const sitePrompt = `Сайт по шаблону «${template.title}» — ${template.subtitle}. ${template.features}.`
      setPrompt(sitePrompt)
      setHtml(source)
      setSiteId(id)
      setEditInstruction("")
      setZoomed(null)
      setBuilder(true)
      saveSites([{ id, title: template.title, prompt: sitePrompt, html: source, createdAt: new Date().toISOString() }, ...sites].slice(0, 24))
    } catch {
      setError("Не удалось открыть шаблон. Проверьте соединение и попробуйте ещё раз.")
    } finally {
      setOpening(null)
    }
  }

  async function generate(revise = false) {
    const instruction = revise ? editInstruction.trim() : prompt.trim()
    if (!instruction || loading || (revise && !html)) return
    setLoading(true)
    setError("")
    try {
      const { lean, kept } = revise ? stripRuntime(html) : { lean: "", kept: [] as string[] }
      const response = await clientFetchWithTimeout(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: instruction, ...(revise ? { previousHtml: lean } : {}) }),
      }, 180000)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : `Ошибка генерации (${response.status})`)
      const raw = normalizeHtml(typeof data?.html === "string" ? data.html : typeof data?.content === "string" ? data.content : "")
      const output = revise && raw ? restoreRuntime(raw, kept) : raw
      if (!output) throw new Error("Генератор вернул пустой HTML")
      setHtml(output)
      if (revise && siteId) {
        const previous = sites.find((item) => item.id === siteId)
        if (previous) {
          saveSites(sites.map((item) => item.id === siteId ? {
            ...item,
            html: output,
            previousVersions: [...(item.previousVersions || []), html].slice(-3),
          } : item))
        }
        setEditInstruction("")
      } else {
        const id = crypto.randomUUID()
        const site: Site = { id, title: prompt.slice(0, 52) || "Новый сайт", prompt, html: output, createdAt: new Date().toISOString() }
        setSiteId(id)
        saveSites([site, ...sites.filter((item) => item.html !== output)].slice(0, 24))
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Ошибка генерации")
    } finally {
      setLoading(false)
    }
  }

  const importHtml = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 300_000) {
      setError("HTML-файл больше 300 КБ. Уменьшите его перед импортом.")
      event.target.value = ""
      return
    }
    const output = await file.text()
    if (!/<html[\s>]/i.test(output) || !/<body[\s>]/i.test(output)) {
      setError("Выберите полноценный HTML-файл сайта")
      event.target.value = ""
      return
    }
    setHtml(output)
    const importedPrompt = `Импортированный сайт: ${file.name}`
    setPrompt(importedPrompt)
    const id = crypto.randomUUID()
    setSiteId(id)
    setError("")
    saveSites([{ id, title: file.name, prompt: importedPrompt, html: output, createdAt: new Date().toISOString() }, ...sites].slice(0, 24))
    setBuilder(true)
    event.target.value = ""
  }

  const openInNewTab = () => {
    if (!html) return
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
    window.open(url, "_blank", "noopener,noreferrer")
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  const downloadHtml = () => {
    if (!html) return
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${siteId ? sites.find((site) => site.id === siteId)?.title.replace(/[^\p{L}\p{N}-]+/gu, "-").toLowerCase() || "malik-site" : "malik-site"}.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const undoRevision = () => {
    const site = sites.find((item) => item.id === siteId)
    if (!site?.previousVersions?.length) return
    const previousVersions = [...site.previousVersions]
    const restored = previousVersions.pop()!
    setHtml(restored)
    saveSites(sites.map((item) => item.id === siteId ? { ...item, html: restored, previousVersions } : item))
  }

  if (builder) {
    return (
      <main className="malikSites">
        <div className="sitesWorkspace sitesBuilder">
          <header className="builderHero">
            <div className="builderTitle">
              <button className="backButton" onClick={() => setBuilder(false)} aria-label="Назад"><ArrowLeft /></button>
              <div><span>Сайты · Malik AI Website Studio</span><h1>Создать сайт</h1><p>Опишите результат или выберите направление. Malik AI соберёт HTML, CSS и JS и сразу покажет живой предпросмотр.</p></div>
            </div>
          </header>

          <section className="builderPanel">
            <div className="stepTitle"><b>1</b><div><strong>Описание сайта</strong><small>Цель, аудитория, структура, продукт и настроение.</small></div></div>
            <textarea className="promptBox" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Опишите сайт, который хотите создать…" />
            {error && <p className="siteError">{error}</p>}
          </section>

          {html && <section className="builderPanel">
            <div className="stepTitle"><b>3</b><div><strong>Изменить готовый сайт</strong><small>Опишите только правку. Остальная страница сохранится; предыдущую версию можно вернуть.</small></div></div>
            <textarea className="promptBox" value={editInstruction} onChange={(event) => setEditInstruction(event.target.value)} placeholder="Например: добавь раздел с ценами, а остальные блоки оставь без изменений…" />
            <div className="builderActions"><button className="primaryButton" disabled={loading || !editInstruction.trim()} onClick={() => void generate(true)}>{loading ? <Loader2 className="spin" /> : <Globe2 />}{loading ? "Применяем…" : "Применить правку"}</button>
              <button className="secondaryButton" disabled={!sites.find((site) => site.id === siteId)?.previousVersions?.length || loading} onClick={undoRevision}><RotateCcw /> Отменить правку</button></div>
          </section>}

          <section className="builderPanel">
            <div className="stepTitle"><b>2</b><div><strong>Начать с готового сайта</strong><small>Откроется настоящий шаблон из галереи — дальше меняйте его словами в шаге 3.</small></div></div>
            <div className="quickGrid">
              {PREMIUM.slice(0, 6).map((template) => (
                <div className="quickTile" key={template.id}>
                  <LiveTemplate template={template} />
                  <button disabled={Boolean(opening)} onClick={() => void openTemplate(template)} aria-label={`Открыть шаблон ${template.title}`}>
                    <span>{opening === template.id ? "Открываем…" : template.title}</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="builderActions">
            <button className="primaryButton" disabled={loading || !prompt.trim()} onClick={() => void generate(false)}>{loading ? <Loader2 className="spin" /> : <Globe2 />}{loading ? "Генерация…" : html ? "Сгенерировать заново" : "Сгенерировать сайт"}</button>
            <button className="secondaryButton" onClick={() => fileRef.current?.click()}><Upload /> Импорт HTML</button>
            <button className="secondaryButton" onClick={onOpenCodex}><Code2 /> Код</button>
            {onOpenCanvas && <button className="secondaryButton" disabled={!html} onClick={() => onOpenCanvas(html)}>Canvas</button>}
            <button className="secondaryButton" disabled={!html} onClick={openInNewTab}><ExternalLink /> Открыть</button>
            <button className="secondaryButton" disabled={!html} onClick={downloadHtml}><Download /> Скачать HTML</button>
          </div>

          {html && <section className="livePreview"><div className="browserBar"><i /><i /><i /><span>Live preview</span></div><iframe title="Generated website" srcDoc={html} sandbox="allow-scripts allow-forms allow-modals allow-popups" /></section>}
          <input ref={fileRef} hidden type="file" accept=".html,.htm,text/html" onChange={importHtml} />
        </div>
        <SitesCss />
      </main>
    )
  }

  return (
    <main className="malikSites">
      <div className="sitesWorkspace">
        <header className="galleryHero">
          <div><span>Malik AI · Website Studio</span><h1>Сайты</h1><p>{PREMIUM.length} сайтов мирового уровня на разные темы. Каждая карточка — живой сайт: листается, а кнопки, формы, корзины, фильтры и калькуляторы работают. Откройте, скачайте HTML или доработайте с Malik AI.</p></div>
          <button className="primaryButton createButton" onClick={() => { setPrompt(DEFAULT_PROMPT); setHtml(""); setSiteId(null); setEditInstruction(""); setError(""); setBuilder(true) }}><Plus /> Создать сайт</button>
        </header>

        <section className="galleryTools">
          <label className="searchField"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск шаблонов…" /></label>
          <span className="templateCount">{shown.length} шаблонов</span>
        </section>

        <div className="categoryRow">{categories.map((item) => <button key={item} className={item === category ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <section className="galleryHeading"><div><h2>Премиальные шаблоны</h2><p>Это не картинки, а настоящие сайты. Нажмите на карточку, чтобы открыть сайт целиком — на компьютере или в виде телефона.</p></div></section>
        {error && <p className="siteError galleryError">{error}</p>}

        <section className="templateGrid">
          {shown.map((template, position) => (
            // The card opens the site large; the button under it takes the
            // template into the builder. Two intents, two targets.
            <article className={`templateCard${openCard === template.id ? " is-open" : ""}`} key={template.id}>
              <LiveTemplate template={template} priority={position < 3} />
              <button
                className="templateHit"
                onClick={() => {
                  // With a mouse the caption is already visible on hover, so the
                  // click can go straight to the full site. With a finger, the
                  // first tap is what reveals the caption.
                  if (!touchOnly || openCard === template.id) openZoomed(template)
                  else setOpenCard(template.id)
                }}
                aria-expanded={touchOnly ? openCard === template.id : undefined}
                aria-label={
                  touchOnly && openCard !== template.id
                    ? `Показать описание: ${template.title}`
                    : `Открыть сайт ${template.title}`
                }
              />
              <span className="templateShade" aria-hidden="true" />
              <span className="templateOverlay">
                <b>{template.title}</b><small>{template.subtitle}</small><em>{template.category}</em>
                <span className="templateActions">
                  <strong role="button" tabIndex={0}
                    onClick={() => openZoomed(template)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openZoomed(template) } }}
                  >Открыть сайт</strong>
                  <strong role="button" tabIndex={0} className="useTemplate"
                    onClick={() => void openTemplate(template)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openTemplate(template) } }}
                  >{opening === template.id ? "Открываем…" : "Использовать"}</strong>
                </span>
              </span>
            </article>
          ))}
          {shown.length === 0 && <p className="galleryEmpty">Ничего не нашлось. Попробуйте другое слово или категорию «Все».</p>}
        </section>

        {/* Portalled: the dashboard's <main> is its own stacking context, so an
            overlay rendered in place opened with its left quarter - the site
            title and the start of every headline - painted over by the sidebar. */}
        {zoomed && (
          <OverlayPortal>
            <div className="shotLightbox" role="dialog" aria-modal="true" aria-label={zoomed.title} onClick={() => setZoomed(null)}>
              <div className="shotLightboxBox" onClick={(event) => event.stopPropagation()}>
                <div className="shotLightboxHead">
                  <div><b>{zoomed.title}</b><small>{zoomed.subtitle} · {zoomed.features}</small></div>
                  <div className="shotLightboxActions">
                    <span className="deviceSwitch" role="group" aria-label="Размер экрана">
                      <button className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"} aria-label="Компьютер"><Monitor /></button>
                      <button className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"} aria-label="Телефон"><Smartphone /></button>
                    </span>
                    <button className="secondaryButton" onClick={openTemplateInTab}><ExternalLink /> В новой вкладке</button>
                    <button className="secondaryButton" onClick={downloadTemplate}><Download /> Скачать HTML</button>
                    <button className="primaryButton" disabled={Boolean(opening)} onClick={() => void openTemplate(zoomed)}>{opening === zoomed.id ? <Loader2 className="spin" /> : <Globe2 />} Использовать шаблон</button>
                    <button className="secondaryButton" onClick={() => setZoomed(null)} aria-label="Закрыть">Закрыть ✕</button>
                  </div>
                </div>
                {/* The real site, running: every button, form and dialog works. */}
                <div className={`shotStage is-${device}`}>
                  <iframe key={zoomed.id} title={`Сайт ${zoomed.title}`} src={premiumUrl(zoomed.id)} sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox" />
                </div>
              </div>
            </div>
          </OverlayPortal>
        )}

        {sites.length > 0 && <section className="savedSites"><h2>Мои сайты</h2>{sites.map((site) => <div className="savedRow" key={site.id}><button onClick={() => { setPrompt(site.prompt); setHtml(site.html); setSiteId(site.id); setEditInstruction(""); setError(""); setBuilder(true) }}><b>{site.title}</b><small>{new Date(site.createdAt).toLocaleString("ru-RU")}</small></button><button className="deleteSite" aria-label="Удалить сайт" onClick={() => saveSites(sites.filter((item) => item.id !== site.id))}><Trash2 /></button></div>)}</section>}
        <input ref={fileRef} hidden type="file" accept=".html,.htm,text/html" onChange={importHtml} />
      </div>
      <SitesCss />
    </main>
  )
}

function SitesCss() {
  return <style jsx global>{`
    .malikSites{width:100%;height:100%;overflow:auto;background:#000;color:#f7f7f8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.malikSites *{box-sizing:border-box}.malikSites button,.malikSites input,.malikSites textarea{font:inherit}.malikSites button{cursor:pointer}.sitesWorkspace{width:calc(100% - 30px);max-width:1760px;margin:0 auto;padding:20px 0 64px}.galleryHero,.builderHero{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:4px 2px 18px;border-bottom:1px solid #17191d}.galleryHero>div>span,.builderTitle>div>span{display:block;margin-bottom:6px;color:#747a84;font-size:10px}.galleryHero h1,.builderHero h1{margin:0;font-size:clamp(38px,4vw,54px);line-height:.95;letter-spacing:-.055em}.galleryHero p,.builderHero p{max-width:800px;margin:8px 0 0;color:#8d929b;font-size:12px;line-height:1.55}.primaryButton,.secondaryButton{min-height:40px;border-radius:11px;padding:0 15px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:800}.primaryButton{border:0;background:#fff;color:#000}.secondaryButton{border:1px solid #30343b;background:#0d0f12;color:#fff}.primaryButton svg,.secondaryButton svg{width:16px;height:16px}.primaryButton:disabled,.secondaryButton:disabled{opacity:.45;cursor:not-allowed}.galleryTools{display:flex;align-items:center;gap:9px;padding-top:14px}.searchField{height:40px;flex:1;display:flex;align-items:center;gap:9px;border:1px solid #2b2f36;background:#121417;border-radius:11px;padding:0 12px}.searchField svg{width:16px;color:#777d87}.searchField input{width:100%;border:0;outline:0;background:transparent;color:#fff}.templateCount{height:40px;display:inline-flex;align-items:center;border:1px solid #292d34;background:#0c0e10;border-radius:11px;padding:0 12px;color:#a9aeb7;font-size:10px;white-space:nowrap}.categoryRow{display:flex;gap:7px;overflow-x:auto;padding:10px 0 2px}.categoryRow button{height:31px;border:1px solid #292d33;background:#0c0e10;color:#aeb2ba;border-radius:999px;padding:0 11px;font-size:10px;white-space:nowrap}.categoryRow button.active{background:#fff;border-color:#fff;color:#000;font-weight:850}.galleryHeading{margin:16px 0 10px}.galleryHeading h2,.savedSites h2{margin:0;font-size:24px;letter-spacing:-.03em}.galleryHeading p{margin:4px 0 0;color:#747a84;font-size:10px}
    .templateGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;background:#000}.templateCard{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;padding:0;border:1px solid #15181c;border-radius:0;background:#0a0b0d;color:#fff;text-align:left;isolation:isolate}.templateHit{position:absolute;inset:0;z-index:1;width:100%;height:100%;padding:0;margin:0;border:0;background:transparent;cursor:zoom-in;display:block}.liveViewport{position:absolute;inset:0;display:block;overflow:hidden;background:#0a0b0d;transform:scale(1);transform-origin:50% 50%;transition:transform .5s cubic-bezier(.22,.61,.36,1)}.liveFrame{position:absolute;left:0;top:0;width:1440px!important;height:810px!important;max-width:none!important;max-height:none!important;margin:0!important;border:0;display:block;transform-origin:0 0;pointer-events:none;background:#fff}.livePoster{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;padding:16px;background:radial-gradient(120% 90% at 85% 0%,color-mix(in srgb,var(--tone) 70%,transparent),transparent 60%),linear-gradient(160deg,#111317,#050506);transition:opacity .45s ease}.livePoster b{font-size:clamp(18px,2.2vw,28px);letter-spacing:-.03em}.livePoster small{color:#c4c8cf;font-size:11px}.livePoster i{position:absolute;left:16px;right:16px;top:16px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);background-size:40% 100%;background-repeat:no-repeat;animation:posterLoad 1.3s ease-in-out infinite}@keyframes posterLoad{from{background-position:-60% 0}to{background-position:160% 0}}.livePoster.is-hidden{opacity:0;pointer-events:none}.livePoster.is-hidden i{animation:none}.templateCard:hover .liveViewport,.templateCard:focus-within .liveViewport{transform:scale(1.03)}.shotViewport{position:absolute;inset:0;display:block;overflow:hidden;background:#0a0b0d}.shotImage{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover;object-position:center;max-width:none!important;margin:0!important;padding:0!important;border:0!important;pointer-events:none;user-select:none;transform:scale(1);transition:transform .5s cubic-bezier(.22,.61,.36,1)}.templateCard:hover .shotImage,.templateCard:focus-within .shotImage{transform:scale(1.045)}.templateHit:focus-visible{outline:2px solid #fff;outline-offset:-2px}.templateShade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,0) 34%,rgba(0,0,0,.34) 56%,rgba(0,0,0,.8) 78%,rgba(0,0,0,.96) 100%);opacity:0;transition:opacity .16s ease}.templateOverlay{position:absolute;left:0;right:0;bottom:0;padding:44px 10px 9px;display:grid;grid-template-columns:1fr auto;gap:3px 8px;opacity:0;transform:translateY(8px);transition:opacity .16s ease,transform .16s ease}.templateOverlay b{font-size:12px}.templateOverlay small{grid-column:1;color:#d2d5da;font-size:8px}.templateOverlay em{grid-column:2;grid-row:1/3;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.55);border-radius:999px;padding:3px 6px;font-size:7px;font-style:normal}.templateActions{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:5px}.templateOverlay strong{height:30px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.96);color:#000;border-radius:7px;font-size:9px;font-weight:850;cursor:pointer;pointer-events:auto;transition:transform .14s ease}.templateOverlay strong:not(.useTemplate){background:rgba(10,11,13,.66);color:#fff;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}.templateOverlay strong:hover{transform:translateY(-1px)}.templateOverlay{z-index:2}.templateShade{z-index:2}.templateOverlay strong:focus-visible{outline:2px solid #fff;outline-offset:2px}.templateOverlay{pointer-events:none}.templateCard:hover .templateShade,.templateCard:hover .templateOverlay,.templateCard:focus-within .templateShade,.templateCard:focus-within .templateOverlay,.templateCard.is-open .templateShade,.templateCard.is-open .templateOverlay{opacity:1;transform:none}.shotLightbox{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.93);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:shotFade .16s ease}@keyframes shotFade{from{opacity:0}to{opacity:1}}.shotLightboxBox{width:min(1400px,97vw);height:min(92vh,980px);display:flex;flex-direction:column;overflow:hidden;background:#08090a;border:1px solid #2b2f36;border-radius:16px;padding:0}.shotStage{flex:1;min-height:0;display:flex;justify-content:center;background:#050506}.shotStage iframe{width:100%;height:100%;border:0;display:block;background:#fff}.shotStage.is-mobile{padding:14px 0;background:radial-gradient(circle at 50% 30%,#1a1c21,#050506 70%)}.shotStage.is-mobile iframe{width:390px;max-width:calc(100% - 16px);border-radius:26px;border:6px solid #1d2026;box-shadow:0 30px 80px rgba(0,0,0,.6)}.deviceSwitch{display:inline-flex;padding:3px;gap:3px;border:1px solid #30343b;background:#0d0f12;border-radius:11px}.deviceSwitch button{width:34px;height:32px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:#9aa0a9}.deviceSwitch button svg{width:16px;height:16px}.deviceSwitch button.active{background:#fff;color:#000}.galleryError{margin:0 0 10px}.galleryEmpty{grid-column:1/-1;margin:0;padding:40px 12px;text-align:center;color:#8d929b;font-size:12px;border:1px dashed #23262c}.shotLightboxHead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border-bottom:1px solid #1e2229;flex-wrap:wrap}.shotLightboxHead b{display:block;font-size:15px;letter-spacing:-.02em}.shotLightboxHead small{display:block;margin-top:2px;color:#828892;font-size:10px}.shotLightboxActions{display:flex;gap:8px;flex-wrap:wrap}.savedSites{margin-top:28px}.savedRow{display:grid;grid-template-columns:1fr auto;border-top:1px solid #1b1e23;padding:8px 0}.savedRow button{border:0;background:transparent;color:#fff;text-align:left}.savedRow small{display:block;margin-top:3px;color:#6f7580;font-size:9px}.deleteSite svg{width:16px}
    .builderTitle{display:flex;gap:12px;align-items:flex-start}.backButton{width:40px;height:40px;flex:0 0 auto;display:grid;place-items:center;border-radius:11px;border:1px solid #292d34;background:#0d0f12;color:#fff}.backButton svg{width:17px}.builderPanel{margin-top:12px;border:1px solid #1d2025;background:linear-gradient(180deg,#070708,#040404);border-radius:16px;padding:14px}.stepTitle{display:flex;align-items:flex-start;gap:10px;margin-bottom:11px}.stepTitle>b{width:26px;height:26px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;background:#fff;color:#000;font-size:11px}.stepTitle strong{display:block;font-size:14px}.stepTitle small{display:block;margin-top:3px;color:#737985;font-size:10px}.promptBox{width:100%;min-height:105px;resize:vertical;border:1px solid #30343c;background:#15171a;color:#fff;border-radius:11px;padding:13px;outline:none}.promptBox:focus{border-color:#4c515c}.siteError{margin:9px 0 0;color:#ff7b7b;font-size:10px}.quickGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.quickTile{position:relative;aspect-ratio:16/9;overflow:hidden;border:1px solid #15181c;background:#000}.quickTile>button{position:absolute;inset:0;z-index:2;display:flex;align-items:flex-end;border:0;background:transparent;border-radius:0;padding:0;color:#fff}.quickTile>button:disabled{cursor:progress}.quickTile>button>span{width:100%;padding:28px 9px 8px;background:linear-gradient(transparent,rgba(0,0,0,.92));text-align:left;font-size:11px;font-weight:800}.quickTile:hover .liveViewport{transform:scale(1.03)}.builderActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}.livePreview{margin-top:13px;overflow:hidden;border:1px solid #242830;border-radius:14px}.browserBar{height:36px;display:flex;align-items:center;gap:6px;padding:0 10px;border-bottom:1px solid #24272d;background:#101216}.browserBar i{width:7px;height:7px;border-radius:50%;background:#4b5058}.browserBar span{margin-left:6px;color:#777d87;font-size:9px}.livePreview iframe{width:100%;height:650px;display:block;border:0;background:#fff}.spin{animation:siteSpin 1s linear infinite}@keyframes siteSpin{to{transform:rotate(360deg)}}
    @media(max-width:1120px){.templateGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.sitesWorkspace{width:calc(100% - 16px);padding-top:12px}.galleryHero{display:block;padding-bottom:14px}.galleryHero h1,.builderHero h1{font-size:34px}.createButton{display:inline-flex;width:100%;margin-top:12px;height:44px}.templateCard{border-radius:12px;border-color:#1b1f24}.templateGrid{gap:10px}.templateOverlay{padding:64px 12px 12px}.templateOverlay b{font-size:15px;text-shadow:0 1px 10px rgba(0,0,0,.85)}.templateOverlay small{font-size:10.5px;color:#e6e8ec;text-shadow:0 1px 8px rgba(0,0,0,.85)}.templateOverlay em{font-size:8.5px;background:rgba(0,0,0,.68);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}.templateOverlay strong{height:38px;font-size:11.5px}.shotLightboxBox{width:100%;height:94vh;border-radius:14px}.shotLightboxActions{width:100%}.shotLightboxActions .primaryButton{flex:1}.galleryTools{display:block}.templateCount{margin-top:8px;height:31px}.templateGrid{grid-template-columns:1fr;gap:6px}.templateShade{background:linear-gradient(180deg,rgba(0,0,0,0) 22%,rgba(0,0,0,.42) 48%,rgba(0,0,0,.82) 74%,rgba(0,0,0,.96) 100%)}.templateCard{border-radius:12px}.templateGrid{gap:10px}.templateHit::after{content:"";position:absolute;right:10px;bottom:10px;width:30px;height:30px;border-radius:50%;background:rgba(8,9,11,.62) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='M20 20l-3.2-3.2M11 8v6M8 11h6'/%3E%3C/svg%3E") center/16px no-repeat;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.16);opacity:.92;transition:opacity .16s ease}.templateCard.is-open .templateHit::after{opacity:0}.quickGrid{grid-template-columns:1fr;gap:6px}.builderActions .primaryButton,.builderActions .secondaryButton{flex:1 1 145px}.livePreview iframe{height:480px}}
  `}</style>
}
