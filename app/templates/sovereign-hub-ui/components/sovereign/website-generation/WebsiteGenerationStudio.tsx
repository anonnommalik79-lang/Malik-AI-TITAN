"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react"
import { ArrowLeft, Code2, ExternalLink, Globe2, Loader2, Plus, Search, Trash2, Upload } from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"

export type WebsiteGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type Site = { id: string; title: string; prompt: string; html: string; createdAt: string }
type Template = { id: string; title: string; subtitle: string; category: string; prompt: string; index: number }

const ENDPOINT = "/api/generate/website"
const STORAGE_KEY = "malik-sites-v5"
const SPRITE = "/sites/legendary-gallery/templates-sprite.jpg"
const DEFAULT_PROMPT = "Создай современный премиальный сайт мирового уровня: сильный hero, чистая типографика, адаптивная сетка, продукт в центре, доверие, CTA, FAQ и цельная визуальная система."

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

const TEMPLATES: Template[] = SEEDS.map(([id, title, subtitle, category, direction], index) => ({
  id,
  title,
  subtitle,
  category,
  index,
  prompt: `Создай оригинальный production-ready сайт в направлении: ${direction}. Используй сильный hero, мировую типографику, адаптивную сетку, реальные секции продукта, доверие и CTA. Не копируй чужие логотипы, тексты или фирменные элементы буквально.`,
}))

function spriteStyle(index: number): CSSProperties {
  const column = index % 3
  const row = Math.floor(index / 3)
  return {
    backgroundImage: `url(${SPRITE})`,
    backgroundSize: "300% 1000%",
    backgroundPosition: `${column * 50}% ${(row / 9) * 100}%`,
    backgroundRepeat: "no-repeat",
  }
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
      if (Array.isArray(stored)) setSites(stored.slice(0, 24))
    } catch {}
  }, [])

  const saveSites = (next: Site[]) => {
    setSites(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 24))) } catch {}
  }

  const categories = useMemo(() => ["Все", ...Array.from(new Set(TEMPLATES.map((item) => item.category)))], [])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TEMPLATES.filter((item) =>
      (category === "Все" || item.category === category) &&
      (!q || `${item.title} ${item.subtitle} ${item.category}`.toLowerCase().includes(q)),
    )
  }, [query, category])

  const useTemplate = (template: Template) => {
    setPrompt(template.prompt)
    setHtml("")
    setError("")
    setBuilder(true)
  }

  async function generate() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError("")
    setHtml("")
    try {
      const response = await clientFetchWithTimeout(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      }, 120000)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : `Ошибка генерации (${response.status})`)
      const output = normalizeHtml(typeof data?.html === "string" ? data.html : typeof data?.content === "string" ? data.content : "")
      if (!output) throw new Error("Генератор вернул пустой HTML")
      setHtml(output)
      const site: Site = { id: crypto.randomUUID(), title: prompt.slice(0, 52) || "Новый сайт", prompt, html: output, createdAt: new Date().toISOString() }
      saveSites([site, ...sites.filter((item) => item.html !== output)].slice(0, 24))
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Ошибка генерации")
    } finally {
      setLoading(false)
    }
  }

  const importHtml = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const output = await file.text()
    setHtml(output)
    setPrompt(`Импортированный сайт: ${file.name}`)
    setError("")
    setBuilder(true)
    event.target.value = ""
  }

  const openInNewTab = () => {
    if (!html) return
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
    window.open(url, "_blank", "noopener,noreferrer")
    setTimeout(() => URL.revokeObjectURL(url), 60000)
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

          <section className="builderPanel">
            <div className="stepTitle"><b>2</b><div><strong>Быстрые направления</strong><small>Те же премиальные макеты, что и в главной галерее.</small></div></div>
            <div className="quickGrid">
              {TEMPLATES.slice(0, 6).map((template) => (
                <button key={template.id} onClick={() => setPrompt(template.prompt)} aria-label={template.title}>
                  <i className="spritePreview" style={spriteStyle(template.index)} />
                  <span>{template.title}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="builderActions">
            <button className="primaryButton" disabled={loading || !prompt.trim()} onClick={generate}>{loading ? <Loader2 className="spin" /> : <Globe2 />}{loading ? "Генерация…" : "Сгенерировать сайт"}</button>
            <button className="secondaryButton" onClick={() => fileRef.current?.click()}><Upload /> Импорт HTML</button>
            <button className="secondaryButton" onClick={onOpenCodex}><Code2 /> Код</button>
            {onOpenCanvas && <button className="secondaryButton" disabled={!html} onClick={() => onOpenCanvas(html)}>Canvas</button>}
            <button className="secondaryButton" disabled={!html} onClick={openInNewTab}><ExternalLink /> Открыть</button>
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
          <div><span>Malik AI · Website Studio</span><h1>Сайты</h1><p>30 премиальных широких макетов. Все превью локальные, одинакового размера и сразу ведут в рабочий генератор.</p></div>
          <button className="primaryButton createButton" onClick={() => { setPrompt(DEFAULT_PROMPT); setHtml(""); setError(""); setBuilder(true) }}><Plus /> Создать сайт</button>
        </header>

        <section className="galleryTools">
          <label className="searchField"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск шаблонов…" /></label>
          <span className="templateCount">{shown.length} шаблонов</span>
        </section>

        <div className="categoryRow">{categories.map((item) => <button key={item} className={item === category ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <section className="galleryHeading"><div><h2>Премиальные шаблоны</h2><p>Desktop — 3 одинаковых 16:9 карточки в ряд. Между ними только тонкая профессиональная чёрная линия.</p></div></section>

        <section className="templateGrid">
          {shown.map((template) => (
            <button className="templateCard" key={template.id} onClick={() => useTemplate(template)} aria-label={`Использовать ${template.title}`}>
              <i className="spritePreview" style={spriteStyle(template.index)} />
              <span className="templateShade" />
              <span className="templateOverlay">
                <b>{template.title}</b><small>{template.subtitle}</small><em>{template.category}</em><strong>Использовать стиль</strong>
              </span>
            </button>
          ))}
        </section>

        {sites.length > 0 && <section className="savedSites"><h2>Мои сайты</h2>{sites.map((site) => <div className="savedRow" key={site.id}><button onClick={() => { setPrompt(site.prompt); setHtml(site.html); setError(""); setBuilder(true) }}><b>{site.title}</b><small>{new Date(site.createdAt).toLocaleString("ru-RU")}</small></button><button className="deleteSite" aria-label="Удалить сайт" onClick={() => saveSites(sites.filter((item) => item.id !== site.id))}><Trash2 /></button></div>)}</section>}
        <input ref={fileRef} hidden type="file" accept=".html,.htm,text/html" onChange={importHtml} />
      </div>
      <SitesCss />
    </main>
  )
}

function SitesCss() {
  return <style jsx global>{`
    .malikSites{width:100%;height:100%;overflow:auto;background:#000;color:#f7f7f8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.malikSites *{box-sizing:border-box}.malikSites button,.malikSites input,.malikSites textarea{font:inherit}.malikSites button{cursor:pointer}.sitesWorkspace{width:calc(100% - 30px);max-width:1760px;margin:0 auto;padding:20px 0 64px}.galleryHero,.builderHero{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:4px 2px 18px;border-bottom:1px solid #17191d}.galleryHero>div>span,.builderTitle>div>span{display:block;margin-bottom:6px;color:#747a84;font-size:10px}.galleryHero h1,.builderHero h1{margin:0;font-size:clamp(38px,4vw,54px);line-height:.95;letter-spacing:-.055em}.galleryHero p,.builderHero p{max-width:800px;margin:8px 0 0;color:#8d929b;font-size:12px;line-height:1.55}.primaryButton,.secondaryButton{min-height:40px;border-radius:11px;padding:0 15px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:800}.primaryButton{border:0;background:#fff;color:#000}.secondaryButton{border:1px solid #30343b;background:#0d0f12;color:#fff}.primaryButton svg,.secondaryButton svg{width:16px;height:16px}.primaryButton:disabled,.secondaryButton:disabled{opacity:.45;cursor:not-allowed}.galleryTools{display:flex;align-items:center;gap:9px;padding-top:14px}.searchField{height:40px;flex:1;display:flex;align-items:center;gap:9px;border:1px solid #2b2f36;background:#121417;border-radius:11px;padding:0 12px}.searchField svg{width:16px;color:#777d87}.searchField input{width:100%;border:0;outline:0;background:transparent;color:#fff}.templateCount{height:40px;display:inline-flex;align-items:center;border:1px solid #292d34;background:#0c0e10;border-radius:11px;padding:0 12px;color:#a9aeb7;font-size:10px;white-space:nowrap}.categoryRow{display:flex;gap:7px;overflow-x:auto;padding:10px 0 2px}.categoryRow button{height:31px;border:1px solid #292d33;background:#0c0e10;color:#aeb2ba;border-radius:999px;padding:0 11px;font-size:10px;white-space:nowrap}.categoryRow button.active{background:#fff;border-color:#fff;color:#000;font-weight:850}.galleryHeading{margin:16px 0 10px}.galleryHeading h2,.savedSites h2{margin:0;font-size:24px;letter-spacing:-.03em}.galleryHeading p{margin:4px 0 0;color:#747a84;font-size:10px}
    .templateGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;background:#000}.templateCard{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;padding:0;border:1px solid #15181c;border-radius:0;background:#000;color:#fff;text-align:left}.spritePreview{position:absolute;inset:0;display:block}.templateShade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 48%,rgba(0,0,0,.18) 62%,rgba(0,0,0,.94));opacity:0;transition:opacity .16s ease}.templateOverlay{position:absolute;left:0;right:0;bottom:0;padding:44px 10px 9px;display:grid;grid-template-columns:1fr auto;gap:3px 8px;opacity:0;transform:translateY(8px);transition:opacity .16s ease,transform .16s ease}.templateOverlay b{font-size:12px}.templateOverlay small{grid-column:1;color:#d2d5da;font-size:8px}.templateOverlay em{grid-column:2;grid-row:1/3;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.55);border-radius:999px;padding:3px 6px;font-size:7px;font-style:normal}.templateOverlay strong{grid-column:1/-1;height:29px;margin-top:4px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.18);background:rgba(10,12,15,.92);font-size:9px}.templateCard:hover .templateShade,.templateCard:hover .templateOverlay,.templateCard:focus-visible .templateShade,.templateCard:focus-visible .templateOverlay{opacity:1;transform:none}.savedSites{margin-top:28px}.savedRow{display:grid;grid-template-columns:1fr auto;border-top:1px solid #1b1e23;padding:8px 0}.savedRow button{border:0;background:transparent;color:#fff;text-align:left}.savedRow small{display:block;margin-top:3px;color:#6f7580;font-size:9px}.deleteSite svg{width:16px}
    .builderTitle{display:flex;gap:12px;align-items:flex-start}.backButton{width:40px;height:40px;flex:0 0 auto;display:grid;place-items:center;border-radius:11px;border:1px solid #292d34;background:#0d0f12;color:#fff}.backButton svg{width:17px}.builderPanel{margin-top:12px;border:1px solid #1d2025;background:linear-gradient(180deg,#070708,#040404);border-radius:16px;padding:14px}.stepTitle{display:flex;align-items:flex-start;gap:10px;margin-bottom:11px}.stepTitle>b{width:26px;height:26px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;background:#fff;color:#000;font-size:11px}.stepTitle strong{display:block;font-size:14px}.stepTitle small{display:block;margin-top:3px;color:#737985;font-size:10px}.promptBox{width:100%;min-height:105px;resize:vertical;border:1px solid #30343c;background:#15171a;color:#fff;border-radius:11px;padding:13px;outline:none}.promptBox:focus{border-color:#4c515c}.siteError{margin:9px 0 0;color:#ff7b7b;font-size:10px}.quickGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.quickGrid button{position:relative;aspect-ratio:16/9;overflow:hidden;border:1px solid #15181c;background:#000;border-radius:0;padding:0;color:#fff}.quickGrid span{position:absolute;left:0;right:0;bottom:0;padding:28px 8px 7px;background:linear-gradient(transparent,rgba(0,0,0,.92));text-align:left;font-size:9px;font-weight:800}.builderActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}.livePreview{margin-top:13px;overflow:hidden;border:1px solid #242830;border-radius:14px}.browserBar{height:36px;display:flex;align-items:center;gap:6px;padding:0 10px;border-bottom:1px solid #24272d;background:#101216}.browserBar i{width:7px;height:7px;border-radius:50%;background:#4b5058}.browserBar span{margin-left:6px;color:#777d87;font-size:9px}.livePreview iframe{width:100%;height:650px;display:block;border:0;background:#fff}.spin{animation:siteSpin 1s linear infinite}@keyframes siteSpin{to{transform:rotate(360deg)}}
    @media(max-width:1120px){.templateGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.sitesWorkspace{width:calc(100% - 16px);padding-top:12px}.galleryHero h1,.builderHero h1{font-size:38px}.createButton{display:none}.galleryTools{display:block}.templateCount{margin-top:8px;height:31px}.templateGrid{grid-template-columns:1fr;gap:6px}.templateShade,.templateOverlay{opacity:1;transform:none}.quickGrid{grid-template-columns:1fr;gap:6px}.builderActions .primaryButton,.builderActions .secondaryButton{flex:1 1 145px}.livePreview iframe{height:480px}}
  `}</style>
}
