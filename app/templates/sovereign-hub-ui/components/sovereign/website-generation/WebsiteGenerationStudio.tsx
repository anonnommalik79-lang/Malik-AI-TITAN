"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Code2,
  ExternalLink,
  Globe2,
  LayoutGrid,
  Loader2,
  MonitorUp,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"

export type WebsiteGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type SkillSource = { id: string; name: string; category: string; source: string; repo: string; url: string; role: string }
type SavedSite = { id: string; title: string; prompt: string; html: string; createdAt: string; skills?: SkillSource[] }
type InspirationSite = { name: string; domain: string; url: string; category: string; note: string }
type WebsiteTemplate = { title: string; category: string; preview: string; inspiration: InspirationSite; prompt: string }

const ENDPOINT = "/api/generate/website"
const STORAGE_KEY = "malik-sites-v3"
const DEFAULT_PROMPT = "Создай современный премиальный сайт для моего проекта. Сделай сильную структуру, чистую типографику, адаптивный интерфейс, hero, преимущества, доказательства, CTA, FAQ и рабочие интерактивные состояния."

const INSPIRATION: InspirationSite[] = [
  { name: "Linear", domain: "linear.app", url: "https://linear.app", category: "SaaS", note: "Точный dark UI, сильная иерархия и продуктовый ритм" },
  { name: "Vercel", domain: "vercel.com", url: "https://vercel.com", category: "Developer", note: "Минимализм, инженерная подача и строгая сетка" },
  { name: "Stripe", domain: "stripe.com", url: "https://stripe.com", category: "Fintech", note: "Сильная композиция, ясные блоки и техническая глубина" },
  { name: "Notion", domain: "notion.com", url: "https://www.notion.com", category: "Productivity", note: "Чистая структура, простая навигация и понятные сценарии" },
  { name: "Framer", domain: "framer.com", url: "https://www.framer.com", category: "Design", note: "Выразительная типографика и визуальный storytelling" },
  { name: "Webflow", domain: "webflow.com", url: "https://webflow.com", category: "Builder", note: "Редакционная сетка и насыщенная продуктовая подача" },
  { name: "Figma", domain: "figma.com", url: "https://www.figma.com", category: "Design", note: "Яркая система, ясные product demos и сильный бренд" },
  { name: "Shopify", domain: "shopify.com", url: "https://www.shopify.com", category: "Commerce", note: "Коммерческая ясность, trust blocks и удобные CTA" },
  { name: "Apple", domain: "apple.com", url: "https://www.apple.com", category: "Product", note: "Сильный фокус на продукте, крупный scale и чистый storytelling" },
]

const HOME_CATEGORIES = ["Популярные", "Бизнес", "Портфолио", "Спорт", "Лендинг", "Интернет-магазин", "Блог", "Креатив", "Технологии", "Образование", "Медицина", "Другое"]

const TEMPLATE_META: WebsiteTemplate[] = [
  { title: "Adidas Performance", category: "Спорт", preview: "/sites/template-previews-v2/adidas-v2.png", inspiration: INSPIRATION[7], prompt: "Создай мощный спортивный интернет-магазин: чёрно-белая editorial-подача, динамичная фотография атлетов, каталог обуви и одежды, коллекции, преимущества доставки, карточки товаров и сильные CTA. Сохрани спортивную энергию, но сделай оригинальный бренд и контент." },
  { title: "Apple Technology", category: "Технологии", preview: "/sites/template-previews-v2/apple-v2.png", inspiration: INSPIRATION[8], prompt: "Создай ультра-премиальный технологический сайт: глубокий чёрный фон, кинематографичная предметная съёмка устройств, точная белая типографика, продуктовые истории, характеристики, сравнение и покупка. Используй принципы Apple, но сделай оригинальный бренд и контент." },
  { title: "Creative Portfolio", category: "Портфолио", preview: "/sites/template-previews-v2/creative-portfolio-v2.png", inspiration: INSPIRATION[4], prompt: "Создай смелое редакционное портфолио креативной студии: крупная типографика, яркая magenta-палитра, проекты в журнальной сетке, кейсы, награды и понятная форма контакта." },
  { title: "E-commerce", category: "Интернет-магазин", preview: "/sites/template-previews-v2/ecommerce-v2.png", inspiration: INSPIRATION[7], prompt: "Создай премиальный интернет-магазин парфюмерии: дорогая предметная фотография, каталог, карточки товаров, преимущества, отзывы, корзина и чистая мобильная покупка." },
  { title: "Agency", category: "Бизнес", preview: "/sites/template-previews-v2/agency-v2.png", inspiration: INSPIRATION[1], prompt: "Создай строгий сайт архитектурного агентства в швейцарской сетке: монохромная палитра, сильная типографика, избранные проекты, услуги, команда, процесс и контактный CTA." },
  { title: "Blog / Magazine", category: "Блог", preview: "/sites/template-previews-v2/blog-v2.png", inspiration: INSPIRATION[3], prompt: "Создай современный editorial-блог о путешествиях: тёплая светлая палитра, большая обложка, рубрики, карточки статей, авторы, подписка и удобное чтение на телефоне." },
  { title: "Restaurant", category: "Другое", preview: "/sites/template-previews-v2/restaurant-v2.png", inspiration: INSPIRATION[7], prompt: "Создай атмосферный сайт fine-dining ресторана: выразительные фотографии блюд, меню, история шефа, интерьер, бронирование столика, адрес и часы работы." },
  { title: "Fitness / Health", category: "Медицина", preview: "/sites/template-previews-v2/fitness-v2.png", inspiration: INSPIRATION[8], prompt: "Создай энергичный сайт фитнес-клуба: контрастная чёрно-лаймовая палитра, тренировки, тренеры, расписание, результаты клиентов, тарифы и запись на пробное занятие." },
]

function escapeHtmlText(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char))
}

function fallbackSite(prompt: string) {
  const safe = escapeHtmlText(prompt.slice(0, 360))
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Malik Site</title><style>*{box-sizing:border-box}body{margin:0;background:#000;color:#fff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}.wrap{width:min(1160px,calc(100% - 36px));margin:auto}.nav{height:76px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #222}.brand{font-weight:800}.hero{min-height:72vh;display:grid;grid-template-columns:1.08fr .92fr;gap:54px;align-items:center}.eyebrow{font-size:11px;letter-spacing:.17em;text-transform:uppercase;color:#888}h1{font-size:clamp(48px,7vw,92px);line-height:.93;letter-spacing:-.065em;margin:16px 0 20px}p{color:#9b9b9f;line-height:1.65;font-size:17px}.cta{display:inline-flex;margin-top:22px;padding:14px 18px;border-radius:12px;background:#fff;color:#000;text-decoration:none;font-weight:760}.visual{height:430px;border:1px solid #292929;border-radius:26px;background:#0d0d0d;padding:18px}.window{height:100%;border:1px solid #242424;border-radius:19px;padding:22px}.line{height:12px;border-radius:999px;background:#202020;margin-bottom:12px}.line:nth-child(2){width:70%}.line:nth-child(3){width:48%}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:70px 0}.card{border:1px solid #262626;border-radius:20px;background:#0b0b0b;padding:24px}@media(max-width:800px){.hero{grid-template-columns:1fr;padding:68px 0}.visual{height:300px}.cards{grid-template-columns:1fr}}</style></head><body><div class="wrap"><nav class="nav"><span class="brand">Malik Site</span><span>Made with Malik AI</span></nav><section class="hero"><div><span class="eyebrow">Malik AI Website Engine</span><h1>Сайт без визуального шума</h1><p>${safe}</p><a class="cta" href="#features">Продолжить</a></div><div class="visual"><div class="window"><div class="line"></div><div class="line"></div><div class="line"></div></div></div></section><section id="features" class="cards"><article class="card"><strong>Система</strong><p>Цельная композиция и единый визуальный язык.</p></article><article class="card"><strong>Адаптивность</strong><p>Нормально работает на телефоне и десктопе.</p></article><article class="card"><strong>Интерактивность</strong><p>Рабочие состояния, кнопки и логика интерфейса.</p></article></section></div></body></html>`
}

function titleFromPrompt(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim()
  return compact ? (compact.length > 50 ? `${compact.slice(0, 49)}…` : compact) : "Новый сайт"
}

function shot(url: string) {
  return `https://image.thum.io/get/width/1200/crop/720/noanimate/${url}`
}

export function WebsiteGenerationStudio({ onOpenCodex, onOpenCanvas }: WebsiteGenerationStudioProps) {
  const [sites, setSites] = useState<SavedSite[]>([])
  const [query, setQuery] = useState("")
  const [builderOpen, setBuilderOpen] = useState(false)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [html, setHtml] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspirationQuery, setInspirationQuery] = useState("")
  const [category, setCategory] = useState("Все")
  const [homeCategory, setHomeCategory] = useState("Популярные")
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem("malik-sites-v2")
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) setSites(parsed.slice(0, 24))
    } catch {}
  }, [])

  const persist = (next: SavedSite[]) => {
    setSites(next)
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 24))) } catch {}
  }

  const filteredSites = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return sites
    return sites.filter((site) => `${site.title} ${site.prompt}`.toLowerCase().includes(needle))
  }, [query, sites])

  const categories = useMemo(() => ["Все", ...Array.from(new Set(INSPIRATION.map((item) => item.category)))], [])
  const filteredInspiration = useMemo(() => {
    const needle = inspirationQuery.trim().toLowerCase()
    return INSPIRATION.filter((item) => (category === "Все" || item.category === category) && (!needle || `${item.name} ${item.domain} ${item.category}`.toLowerCase().includes(needle)))
  }, [inspirationQuery, category])

  const visibleTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return TEMPLATE_META.filter((item) => {
      const matchesCategory = homeCategory === "Популярные" || item.category === homeCategory
      const matchesQuery = !needle || `${item.title} ${item.category} ${item.prompt}`.toLowerCase().includes(needle)
      return matchesCategory && matchesQuery
    })
  }, [homeCategory, query])

  const openBuilder = () => {
    setSelectedId(null)
    setHtml("")
    setPrompt(DEFAULT_PROMPT)
    setError("")
    setBuilderOpen(true)
  }

  const openSite = (site: SavedSite) => {
    setSelectedId(site.id)
    setPrompt(site.prompt)
    setHtml(site.html)
    setError("")
    setBuilderOpen(true)
  }

  const removeSite = (id: string) => persist(sites.filter((site) => site.id !== id))

  const useInspiration = (site: InspirationSite) => {
    setPrompt(`Создай оригинальный сайт для моего проекта. Возьми только дизайн-принципы ${site.name} (${site.domain}): ${site.note}. Не копируй их тексты, бренд, изображения или точную верстку. Сделай уникальный Malik AI уровень.`)
    setBuilderOpen(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const useTemplate = (template: WebsiteTemplate) => {
    setSelectedId(null)
    setHtml("")
    setError("")
    setPrompt(template.prompt)
    setBuilderOpen(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const importWebsite = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const importedHtml = await file.text()
    if (!importedHtml.trim()) return
    const site: SavedSite = {
      id: crypto.randomUUID(),
      title: file.name.replace(/\.html?$/i, "") || "Импортированный сайт",
      prompt: `Импортирован из файла ${file.name}`,
      html: importedHtml,
      createdAt: new Date().toISOString(),
    }
    persist([site, ...sites].slice(0, 24))
    setSelectedId(site.id)
    setPrompt(site.prompt)
    setHtml(site.html)
    setError("")
    setBuilderOpen(true)
  }

  const generate = async () => {
    const userPrompt = prompt.trim()
    if (!userPrompt) return setError("Сначала опишите сайт")
    setLoading(true)
    setError("")
    try {
      const response = await clientFetchWithTimeout(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, template: "adaptive-skill-first", style: "world-class-minimal", quality: "production" }),
      }, 150_000)
      const data = await response.json().catch(() => ({}))
      const generated = String(data.html || data.code || data.content || "").trim()
      const finalHtml = /<html[\s>]/i.test(generated) ? generated : fallbackSite(userPrompt)
      const site: SavedSite = { id: selectedId || crypto.randomUUID(), title: titleFromPrompt(userPrompt), prompt: userPrompt, html: finalHtml, createdAt: new Date().toISOString() }
      persist([site, ...sites.filter((item) => item.id !== site.id)].slice(0, 24))
      setSelectedId(site.id)
      setHtml(finalHtml)
    } catch {
      const finalHtml = fallbackSite(userPrompt)
      const site: SavedSite = { id: selectedId || crypto.randomUUID(), title: titleFromPrompt(userPrompt), prompt: userPrompt, html: finalHtml, createdAt: new Date().toISOString() }
      persist([site, ...sites.filter((item) => item.id !== site.id)].slice(0, 24))
      setSelectedId(site.id)
      setHtml(finalHtml)
      setError("Сервер не ответил, поэтому показана локальная резервная версия.")
    } finally {
      setLoading(false)
    }
  }

  const openPreview = () => {
    if (!html) return
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  if (builderOpen) {
    return (
      <main className="sites-world" data-view="website-generation">
        <div className="sites-world__builder">
          <header className="builder-head">
            <button type="button" className="icon-btn" onClick={() => setBuilderOpen(false)} aria-label="Назад"><ArrowLeft size={18}/></button>
            <div><span>Сайты</span><h1>{selectedId ? "Редактировать сайт" : "Создать сайт"}</h1><p>Опишите идею или выберите мировой сайт только как источник дизайн-принципов.</p></div>
          </header>

          <section className="builder-panel">
            <div className="step-title"><span>1</span><div><strong>Описание сайта</strong><small>Чем точнее задача, тем сильнее результат.</small></div></div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={loading} placeholder="Опишите сайт, продукт, аудиторию, стиль и нужные разделы..."/>
            {error ? <p className="error">{error}</p> : null}
          </section>

          <section className="builder-panel inspiration-panel">
            <div className="step-title"><span>2</span><div><strong>Вдохновение из реальных сайтов</strong><small>Используем принципы, а не копируем пиксели.</small></div></div>
            <div className="insp-search"><Search size={16}/><input value={inspirationQuery} onChange={(e) => setInspirationQuery(e.target.value)} placeholder="Поиск сайтов: Linear, Stripe, Vercel..."/></div>
            <div className="chips">{categories.map((item) => <button key={item} type="button" className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="inspiration-grid">
              {filteredInspiration.map((site) => <article key={site.domain} className="inspiration-card">
                <div className="live-preview"><img src={shot(site.url)} alt={`Превью ${site.name}`} loading="lazy"/></div>
                <div className="inspiration-copy"><div><strong>{site.name}</strong><span>{site.domain}</span></div><em>{site.category}</em></div>
                <p>{site.note}</p>
                <div className="inspiration-actions"><button type="button" onClick={() => useInspiration(site)}>Использовать стиль</button><a href={site.url} target="_blank" rel="noreferrer" aria-label={`Открыть ${site.name}`}><ExternalLink size={15}/></a></div>
              </article>)}
            </div>
          </section>

          <section className="builder-panel">
            <div className="step-title"><span>3</span><div><strong>Создание</strong><small>Malik AI соберёт оригинальный адаптивный сайт.</small></div></div>
            <div className="builder-actions">
              <button className="primary" type="button" onClick={generate} disabled={loading}>{loading ? <Loader2 className="spin" size={17}/> : <Sparkles size={17}/>} {loading ? "Собираю сайт…" : selectedId ? "Пересобрать сайт" : "Создать сайт"}</button>
              <button className="secondary" type="button" onClick={openPreview} disabled={!html}><ExternalLink size={16}/> Открыть превью</button>
              <button className="secondary" type="button" onClick={() => html && onOpenCanvas?.(html)} disabled={!html}><MonitorUp size={16}/> Редактор</button>
              <button className="secondary" type="button" onClick={onOpenCodex}><Code2 size={16}/> Код</button>
            </div>
            {html ? <div className="generated"><div className="browser"><span/><span/><span/><small>malik-site.preview</small></div><iframe title="Предпросмотр созданного сайта" srcDoc={html} sandbox="allow-scripts"/></div> : null}
          </section>
        </div>
        <Styles/>
      </main>
    )
  }

  return (
    <main className="sites-world" data-view="website-generation">
      <div className="sites-world__home">
        <section className="sites-hero">
          <div className="sites-hero-copy">
            <span className="sites-eyebrow">WEBSITE BUILDER</span>
            <h1>Сайты</h1>
            <p>Создавайте, управляйте и масштабируйте потрясающие сайты с помощью ИИ.</p>
          </div>
          <div className="sites-hero-art" aria-hidden="true">
            <img className="sites-hero-image" src="/sites/sites-hero-v2.png" alt=""/>
            <span className="sites-hero-shine"/>
          </div>
          <button className="primary create-top" type="button" onClick={openBuilder}><Plus size={18}/> Создать сайт</button>
        </section>

        <section className="metrics">
          <Metric icon={<Globe2/>} label="Всего сайтов" value={String(sites.length)} note={sites.length ? "+ активные проекты" : "пока нет"}/>
          <Metric icon={<MonitorUp/>} label="Опубликовано" value={String(sites.length)} note="готовы к просмотру"/>
          <Metric icon={<Users/>} label="Проекты" value={String(sites.length)} note="в разработке"/>
          <Metric icon={<Settings2/>} label="Среда" value="Live" note="production workspace"/>
        </section>

        <div className="toolbar"><div className="site-search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск сайтов и шаблонов..."/></div><div className="category-control"><button type="button" aria-expanded={categoryMenuOpen} onClick={() => setCategoryMenuOpen((open) => !open)}><LayoutGrid size={16}/> Все категории <ArrowRight size={14}/></button>{categoryMenuOpen ? <div className="category-menu" role="menu">{HOME_CATEGORIES.map((item) => <button type="button" role="menuitem" key={item} className={homeCategory === item ? "active" : ""} onClick={() => { setHomeCategory(item); setCategoryMenuOpen(false) }}>{item}<ArrowRight size={13}/></button>)}</div> : null}</div></div>

        <div className="home-chips">{HOME_CATEGORIES.map((item) => <button type="button" key={item} className={homeCategory === item ? "active" : ""} onClick={() => setHomeCategory(item)}>{item}</button>)}</div>

        <section className="template-section">
          <div className="section-head"><div><h2>Премиальные шаблоны</h2><p>Готовые визуальные направления для быстрого старта.</p></div><button type="button" onClick={() => setHomeCategory("Популярные")}>Показать все <ArrowRight size={14}/></button></div>
          <div className="template-grid">
            {visibleTemplates.map((template) => <button type="button" className="template-card" key={template.title} onClick={() => useTemplate(template)}>
              <div className="template-image"><img src={template.preview} alt={`Превью шаблона ${template.title}`} loading="lazy"/><span className="template-glow"/><span className="template-action">Использовать <ArrowRight size={13}/></span></div>
              <div className="template-info"><strong>{template.title}</strong><em>{template.category}</em></div>
            </button>)}
          </div>
          {!visibleTemplates.length ? <div className="template-empty"><Search size={18}/><strong>Шаблоны не найдены</strong><span>Измените запрос или выберите другую категорию.</span></div> : null}
        </section>

        {filteredSites.length ? <section className="saved-section"><div className="section-head"><div><h2>Ваши сайты</h2><p>Проекты, созданные внутри Malik AI.</p></div></div><div className="saved-list">{filteredSites.map((site) => <article className="saved-row" key={site.id}>
          <button className="saved-main" type="button" onClick={() => openSite(site)}>
            <div className="saved-preview"><iframe title={`Превью ${site.title}`} srcDoc={site.html} sandbox="" tabIndex={-1}/><span/></div>
            <div className="saved-copy"><strong>{site.title}</strong><span>malik-site · {new Date(site.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span><p>{site.prompt}</p><div className="tags"><em>Malik AI</em><em>Production</em></div></div>
          </button>
          <div className="saved-actions"><button type="button" onClick={() => openSite(site)}><ArrowRight size={16}/> Открыть</button><button type="button" onClick={() => onOpenCanvas?.(site.html)}><Settings2 size={16}/> Редактор</button><button type="button" onClick={() => removeSite(site.id)}><Trash2 size={16}/> Удалить</button></div>
        </article>)}</div></section> : null}

        <section className="quick-grid">
          <button type="button" onClick={openBuilder}><span className="quick-icon"><Plus/></span><strong>Создать с нуля</strong><span>Чистый проект с помощью ИИ</span><ArrowRight/></button>
          <button type="button" onClick={() => importInputRef.current?.click()}><span className="quick-icon"><Upload/></span><strong>Импортировать</strong><span>Загрузить готовый HTML-сайт</span><ArrowRight/></button>
          <button type="button" onClick={onOpenCodex}><span className="quick-icon"><Code2/></span><strong>Открыть код</strong><span>Редактирование кода сайта</span><ArrowRight/></button>
          <button type="button" onClick={() => setBuilderOpen(true)}><span className="quick-icon"><Settings2/></span><strong>Настройки проекта</strong><span>Домен, SEO и интеграции</span><ArrowRight/></button>
        </section>
        <input ref={importInputRef} className="sites-import-input" type="file" accept=".html,.htm,text/html" onChange={importWebsite}/>
      </div>
      <Styles/>
    </main>
  )
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <article className="metric"><div>{icon}<span>{label}</span></div><strong>{value}</strong><small>{note}</small></article>
}

function Styles() {
  return <style jsx global>{`
.sites-world{width:100%;height:100%;overflow:auto;background:#000;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;scrollbar-color:#2a2a2a #000}.sites-world *{box-sizing:border-box}.sites-world button,.sites-world input,.sites-world textarea{font:inherit}.sites-world__home,.sites-world__builder{width:min(1480px,calc(100% - 72px));margin:0 auto;padding:26px 0 72px}.sites-hero{position:relative;min-height:205px;border-bottom:1px solid rgba(255,255,255,.065);display:grid;grid-template-columns:minmax(360px,.84fr) 1.16fr auto;align-items:center;gap:34px;overflow:hidden}.sites-hero:before{content:"";position:absolute;left:31%;top:0;width:55%;height:100%;background:radial-gradient(circle at 48% 45%,rgba(58,83,255,.32),rgba(55,0,255,.08) 36%,transparent 67%);filter:blur(8px);pointer-events:none}.sites-hero-copy{position:relative;z-index:3;padding-left:6px}.sites-eyebrow{display:inline-flex;align-items:center;height:31px;padding:0 13px;border-radius:999px;background:linear-gradient(90deg,#303513,#566020);border:1px solid rgba(220,255,126,.18);box-shadow:0 0 36px rgba(182,255,65,.09);font-size:11px;font-weight:800;letter-spacing:.03em;color:#f7ffd9}.sites-hero h1{font-size:72px;line-height:.9;letter-spacing:-.065em;margin:14px 0 12px;font-weight:820}.sites-hero p{margin:0;max-width:600px;color:#c1c1c7;font-size:16px;line-height:1.45}.sites-hero-art{height:198px;position:relative;z-index:2;min-width:430px}.hero-window{position:absolute;border:1px solid rgba(147,157,255,.26);background:linear-gradient(145deg,rgba(47,25,91,.93),rgba(8,12,30,.96));box-shadow:0 0 48px rgba(64,67,255,.28),0 28px 70px rgba(0,0,0,.55);overflow:hidden}.hero-window:before{content:"";position:absolute;inset:0;background:linear-gradient(130deg,rgba(154,112,255,.45),transparent 36%,rgba(15,75,255,.38));opacity:.65}.hero-window strong{position:absolute;z-index:2;color:#fff;font-weight:760;letter-spacing:-.045em;line-height:.95}.hero-window span{position:absolute;z-index:2;left:12px;top:10px;width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:10px 0 0 rgba(255,255,255,.55),20px 0 0 rgba(255,255,255,.28)}.hero-window i{position:absolute;z-index:2;left:13px;right:13px;bottom:12px;height:13px;border-radius:5px;background:rgba(255,255,255,.12)}.hero-window-a{width:260px;height:158px;right:60px;top:18px;border-radius:15px;transform:rotate(-3deg)}.hero-window-a strong{font-size:25px;left:31px;top:43px}.hero-window-b{width:210px;height:132px;left:14px;top:44px;border-radius:14px;transform:rotate(7deg);filter:saturate(1.3)}.hero-window-b strong{font-size:22px;left:28px;top:43px}.hero-window-c{width:150px;height:104px;right:0;top:78px;border-radius:12px;transform:rotate(8deg)}.hero-window-c strong{font-size:18px;left:24px;top:42px}.create-top{position:relative;z-index:4;align-self:start;margin-top:43px;white-space:nowrap}.primary{border:0;border-radius:12px;background:#fff;color:#050505;min-height:44px;padding:0 18px;font-weight:780;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;box-shadow:0 8px 28px rgba(255,255,255,.08)}.primary:disabled,.secondary:disabled{opacity:.45;cursor:default}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin:18px 0}.metric{min-height:112px;border:1px solid #24262a;border-radius:15px;background:linear-gradient(180deg,#0a0b0d,#08090a);padding:15px 16px;display:flex;flex-direction:column;box-shadow:inset 0 1px rgba(255,255,255,.018)}.metric>div{display:flex;align-items:center;gap:9px;color:#b8bac2;font-size:11px}.metric svg{width:16px;height:16px;color:#e4e5e9}.metric>strong{margin-top:14px;font-size:29px;line-height:1;letter-spacing:-.045em}.metric>small{margin-top:8px;color:#737680;font-size:10px}.toolbar{display:flex;gap:12px;justify-content:space-between;margin:16px 0 11px}.site-search,.insp-search{height:42px;border:1px solid #25272c;border-radius:10px;background:#0b0c0f;display:flex;align-items:center;gap:10px;padding:0 13px;color:#777}.site-search{flex:1}.site-search input,.insp-search input{width:100%;border:0;outline:0;background:transparent;color:#eee;font-size:12px}.toolbar>button{height:42px;min-width:170px;border:1px solid #25272c;border-radius:10px;background:#0b0c0f;color:#d8d8db;padding:0 13px;display:flex;gap:8px;align-items:center;justify-content:center;cursor:pointer}.home-chips{display:flex;gap:8px;overflow-x:auto;padding:2px 0 18px;scrollbar-width:none}.home-chips::-webkit-scrollbar{display:none}.home-chips button{border:1px solid #1d1f23;border-radius:999px;background:#0b0c0e;color:#b7b8be;padding:7px 13px;white-space:nowrap;font-size:11px;cursor:pointer}.home-chips button.active{background:#fff;color:#050505;border-color:#fff;font-weight:760}.template-section{padding:0 0 9px}.section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin:1px 0 13px}.section-head h2{font-size:18px;letter-spacing:-.028em;margin:0}.section-head p{font-size:11px;color:#7b7d85;margin:4px 0 0}.section-head>button{border:0;background:transparent;color:#d1d2d5;display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer}.template-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.template-card{border:1px solid #22242a;border-radius:13px;background:#08090b;color:#fff;padding:0;overflow:hidden;text-align:left;cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.template-card:hover{transform:translateY(-3px);border-color:#393d49;box-shadow:0 18px 42px rgba(0,0,0,.4)}.template-image{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,#101117,#17102e);overflow:hidden}.template-image img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(1.28) contrast(1.05)}.template-image:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 52%,rgba(0,0,0,.36));pointer-events:none}.template-glow{position:absolute;inset:-35%;background:radial-gradient(circle at 30% 35%,rgba(94,77,255,.16),transparent 35%),radial-gradient(circle at 72% 40%,rgba(252,59,255,.08),transparent 34%);pointer-events:none}.template-info{height:39px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 10px}.template-info strong{font-size:11px}.template-info em{font-style:normal;font-size:9px;color:#c4c6cd;border:1px solid #2a2c32;background:#121318;border-radius:999px;padding:4px 7px}.saved-section{margin-top:25px;padding-top:20px;border-top:1px solid #191b1f}.saved-list{display:grid;gap:11px}.saved-row{display:grid;grid-template-columns:minmax(0,1fr) 140px;border:1px solid #23252a;border-radius:14px;background:#08090a;overflow:hidden}.saved-main{min-width:0;border:0;background:transparent;color:inherit;display:grid;grid-template-columns:150px minmax(0,1fr);align-items:stretch;text-align:left;padding:0;cursor:pointer}.saved-preview{position:relative;min-height:120px;overflow:hidden;border-right:1px solid #202228;background:#0f0f0f}.saved-preview iframe{position:absolute;inset:0;width:400%;height:400%;border:0;transform:scale(.25);transform-origin:0 0;pointer-events:none}.saved-preview span{position:absolute;inset:0}.saved-copy{padding:15px 17px;min-width:0}.saved-copy strong{display:block;font-size:14px}.saved-copy>span{display:block;margin-top:4px;color:#7c7f87;font-size:10px}.saved-copy p{margin:9px 0 0;color:#aaaeb6;font-size:11px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.tags{display:flex;gap:6px;margin-top:10px}.tags em{font-style:normal;font-size:9px;color:#aaa;border:1px solid #27292e;border-radius:999px;padding:4px 7px;background:#101114}.saved-actions{padding:10px;border-left:1px solid #202228;display:grid;align-content:center;gap:6px}.saved-actions button{height:32px;border:1px solid #292c31;border-radius:8px;background:#111216;color:#ddd;display:flex;align-items:center;gap:7px;padding:0 10px;cursor:pointer;font-size:10px}.quick-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-top:21px}.quick-grid button{min-height:84px;border:1px solid #23252a;border-radius:13px;background:linear-gradient(180deg,#0b0d10,#090a0c);color:#fff;text-align:left;padding:13px;display:grid;grid-template-columns:36px 1fr auto;grid-template-rows:auto auto;gap:3px 10px;align-items:center;cursor:pointer}.quick-icon{grid-row:1/3;width:36px;height:36px;border-radius:10px;background:#171a20;border:1px solid #242833;display:grid;place-items:center}.quick-icon svg{width:18px;height:18px}.quick-grid strong{font-size:11px}.quick-grid>button>span:not(.quick-icon){grid-column:2;color:#747780;font-size:9px}.quick-grid button>svg{grid-column:3;grid-row:1/3;width:15px;color:#6f727a}.builder-head{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:start;margin-bottom:22px}.builder-head>div>span{display:block;color:#777;font-size:12px;margin-bottom:8px}.builder-head h1{margin:0;color:#fff;font-size:38px;line-height:1;font-weight:760;letter-spacing:-.045em}.builder-head p{margin:9px 0 0;color:#8e8e96;font-size:14px}.icon-btn{width:40px;height:40px;border:1px solid #292929;border-radius:10px;background:#0d0d0d;color:#ddd;display:grid;place-items:center;cursor:pointer}.builder-panel{border:1px solid #252525;border-radius:18px;background:#090909;padding:20px;margin-bottom:14px}.step-title{display:flex;align-items:flex-start;gap:11px;margin-bottom:15px}.step-title>span{width:27px;height:27px;border-radius:999px;background:#fff;color:#000;font-size:12px;font-weight:800;display:grid;place-items:center;flex:0 0 auto}.step-title div{display:grid;gap:4px}.step-title strong{font-size:14px}.step-title small{color:#727279;font-size:11px}.builder-panel textarea{width:100%;min-height:142px;resize:vertical;border:1px solid #2c2c2c;border-radius:13px;background:#0d0d0d;color:#eee;padding:15px;font-size:13px;line-height:1.55;outline:0}.error{color:#d0d0d0;font-size:12px}.insp-search{width:100%;margin-bottom:12px}.chips{display:flex;gap:7px;overflow:auto;padding-bottom:11px}.chips button{border:1px solid #292929;border-radius:999px;background:#101010;color:#9a9aa1;padding:7px 11px;font-size:11px;cursor:pointer}.chips button.active{background:#fff;color:#000;border-color:#fff}.inspiration-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.inspiration-card{border:1px solid #262626;border-radius:15px;background:#0b0b0b;overflow:hidden}.live-preview{aspect-ratio:16/10;background:#111;border-bottom:1px solid #222;overflow:hidden}.live-preview img{width:100%;height:100%;object-fit:cover;display:block}.inspiration-copy{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:13px 13px 0}.inspiration-copy div{display:grid;gap:3px}.inspiration-copy strong{font-size:13px}.inspiration-copy span{color:#777;font-size:10px}.inspiration-copy em{font-style:normal;color:#aaa;font-size:9px;border:1px solid #292929;border-radius:999px;padding:4px 7px}.inspiration-card p{padding:0 13px;margin:10px 0 13px;color:#828289;font-size:11px;line-height:1.45;min-height:32px}.inspiration-actions{display:grid;grid-template-columns:1fr 38px;gap:7px;padding:0 13px 13px}.inspiration-actions button,.inspiration-actions a{height:34px;border:1px solid #2a2a2a;border-radius:9px;background:#121212;color:#e5e5e5;display:flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer;font-size:11px}.builder-actions{display:flex;flex-wrap:wrap;gap:8px}.secondary{min-height:42px;padding:0 13px;border:1px solid #292929;border-radius:11px;background:#111;color:#ddd;display:inline-flex;align-items:center;gap:8px;font-weight:650;cursor:pointer}.generated{margin-top:18px;border:1px solid #292929;border-radius:14px;overflow:hidden;background:#000}.browser{height:34px;border-bottom:1px solid #222;display:flex;align-items:center;gap:5px;padding:0 10px}.browser>span{width:7px;height:7px;border-radius:50%;background:#3a3a3a}.browser small{margin-left:7px;color:#666}.generated iframe{width:100%;height:560px;border:0;background:#fff}.spin{animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1180px){.sites-world__home,.sites-world__builder{width:min(100% - 38px,1480px)}.sites-hero{grid-template-columns:minmax(300px,.9fr) 1.1fr auto}.sites-hero h1{font-size:62px}.sites-hero-art{min-width:340px}.template-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:920px){.sites-world__home,.sites-world__builder{width:min(100% - 28px,1480px)}.sites-hero{grid-template-columns:1fr auto;min-height:180px}.sites-hero-art{display:none}.sites-hero h1{font-size:54px}.metrics,.quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.template-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inspiration-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.saved-row{grid-template-columns:1fr}.saved-actions{grid-template-columns:repeat(3,1fr);border-left:0;border-top:1px solid #202228}}
@media(max-width:680px){.sites-world{height:100dvh;overflow:auto;padding-bottom:74px}.sites-world__home,.sites-world__builder{width:100%;padding:14px 13px 86px}.sites-hero{min-height:auto;display:flex;flex-direction:column;align-items:stretch;gap:14px;padding:12px 0 2px;border:0;overflow:visible}.sites-hero:before{display:none}.sites-hero-copy{padding:0}.sites-eyebrow{display:none}.sites-hero h1{font-size:34px;margin:0 0 7px;letter-spacing:-.055em}.sites-hero p{font-size:12px;line-height:1.45;color:#a9abb2;max-width:340px}.create-top{position:static;width:100%;margin:0;height:40px;min-height:40px;border-radius:9px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:13px 0}.metric{min-height:84px;padding:11px 12px;border-radius:10px}.metric>div{font-size:9px}.metric svg{width:14px;height:14px}.metric>strong{font-size:23px;margin-top:9px}.metric>small{font-size:8px;margin-top:4px}.toolbar{margin:11px 0 9px}.site-search{height:38px;border-radius:8px}.site-search input{font-size:11px}.toolbar>button{display:none}.home-chips{gap:6px;padding-bottom:14px}.home-chips button{font-size:9px;padding:6px 10px}.section-head{margin-bottom:9px;align-items:center}.section-head h2{font-size:15px}.section-head p{display:none}.section-head>button{font-size:9px}.template-grid{grid-template-columns:1fr;gap:9px}.template-card{border-radius:10px}.template-image{aspect-ratio:2.35/1}.template-info{height:34px}.template-info strong{font-size:10px}.template-info em{font-size:8px}.saved-section{margin-top:18px;padding-top:15px}.saved-main{display:block}.saved-preview{width:100%;min-height:150px;border-right:0;border-bottom:1px solid #202228}.saved-copy{padding:12px}.saved-actions{grid-template-columns:1fr}.quick-grid{grid-template-columns:1fr 1fr;gap:7px;margin-top:13px}.quick-grid button{min-height:78px;padding:10px;grid-template-columns:30px 1fr;grid-template-rows:auto auto auto}.quick-icon{width:30px;height:30px;border-radius:8px;grid-row:1/3}.quick-icon svg{width:15px;height:15px}.quick-grid strong{font-size:9px}.quick-grid>button>span:not(.quick-icon){font-size:8px}.quick-grid button>svg{display:none}.builder-head{grid-template-columns:38px 1fr;gap:10px;margin:4px 0 15px}.builder-head h1{font-size:27px}.builder-head p{font-size:11px;line-height:1.45}.icon-btn{width:36px;height:36px}.builder-panel{padding:13px;border-radius:13px;margin-bottom:10px}.builder-panel textarea{min-height:120px}.inspiration-grid{grid-template-columns:1fr}.builder-actions{display:grid;grid-template-columns:1fr 1fr}.builder-actions .primary{grid-column:1/3}.generated iframe{height:430px}}
`}</style>
}
