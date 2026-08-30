"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Code2,
  ExternalLink,
  Globe2,
  Loader2,
  MonitorUp,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
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
    window.scrollTo({ top: 0, behavior: "smooth" })
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
    } finally { setLoading(false) }
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
            <div><span>Сайты</span><h1>{selectedId ? "Редактировать сайт" : "Создать сайт"}</h1><p>Опишите идею или выберите реальный мировой сайт только как источник дизайн-принципов.</p></div>
          </header>

          <section className="builder-panel">
            <div className="step-title"><span>1</span><div><strong>Описание сайта</strong><small>Чем точнее задача, тем сильнее результат.</small></div></div>
            <textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} disabled={loading} placeholder="Опишите сайт, продукт, аудиторию, стиль и нужные разделы..."/>
            {error ? <p className="error">{error}</p> : null}
          </section>

          <section className="builder-panel inspiration-panel">
            <div className="step-title"><span>2</span><div><strong>Вдохновение из реальных сайтов</strong><small>Поиск по сильным мировым продуктам. Используем принципы, а не копируем пиксели.</small></div></div>
            <div className="insp-search"><Search size={16}/><input value={inspirationQuery} onChange={(e)=>setInspirationQuery(e.target.value)} placeholder="Поиск сайтов: Linear, Stripe, Vercel..."/></div>
            <div className="chips">{categories.map((item)=><button key={item} type="button" className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div>
            <div className="inspiration-grid">
              {filteredInspiration.map((site)=><article key={site.domain} className="inspiration-card">
                <div className="live-preview"><img src={`https://image.thum.io/get/width/900/crop/560/noanimate/${site.url}`} alt={`Превью ${site.name}`} loading="lazy"/></div>
                <div className="inspiration-copy"><div><strong>{site.name}</strong><span>{site.domain}</span></div><em>{site.category}</em></div>
                <p>{site.note}</p>
                <div className="inspiration-actions"><button type="button" onClick={()=>useInspiration(site)}>Использовать стиль</button><a href={site.url} target="_blank" rel="noreferrer" aria-label={`Открыть ${site.name}`}><ExternalLink size={15}/></a></div>
              </article>)}
            </div>
          </section>

          <section className="builder-panel">
            <div className="step-title"><span>3</span><div><strong>Создание</strong><small>Malik AI соберёт оригинальный адаптивный сайт.</small></div></div>
            <div className="builder-actions">
              <button className="primary" type="button" onClick={generate} disabled={loading}>{loading?<Loader2 className="spin" size={17}/>:<Sparkles size={17}/>} {loading?"Собираю сайт…":selectedId?"Пересобрать сайт":"Создать сайт"}</button>
              <button className="secondary" type="button" onClick={()=>onOpenCanvas?.(html)} disabled={!html}><MonitorUp size={16}/> Редактор</button>
              <button className="secondary" type="button" onClick={openPreview} disabled={!html}><ExternalLink size={16}/> Превью</button>
              <button className="secondary" type="button" onClick={onOpenCodex}><Code2 size={16}/> Код</button>
            </div>
            {html ? <div className="generated"><div className="browser"><span/><span/><span/><small>Malik AI Site</small></div><iframe title="Сгенерированный сайт" srcDoc={html} sandbox="allow-scripts allow-forms allow-modals"/></div> : null}
          </section>
        </div>
        <Styles/>
      </main>
    )
  }

  return (
    <main className="sites-world" data-view="website-generation">
      <div className="sites-world__home">
        <header className="home-head"><div><h1>Сайты</h1><p>Создавайте, управляйте и масштабируйте сайты внутри Malik AI.</p></div><button className="primary create-top" type="button" onClick={openBuilder}><Plus size={17}/> Создать сайт</button></header>

        <section className="metrics">
          <Metric icon={<Globe2/>} label="Всего сайтов" value={String(sites.length)} note={sites.length?"в вашем пространстве":"пока нет"}/>
          <Metric icon={<MonitorUp/>} label="Опубликовано" value={String(sites.length)} note="готовы к просмотру"/>
          <Metric icon={<Users/>} label="Проекты" value={String(sites.length)} note="создано в Malik AI"/>
          <Metric icon={<Settings2/>} label="Среда" value="Live" note="production workspace"/>
        </section>

        <div className="toolbar"><div className="site-search"><Search size={16}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Поиск сайтов..."/></div><button type="button">Сначала новые <MoreHorizontal size={16}/></button></div>

        {filteredSites.length ? <section className="saved-list">{filteredSites.map((site)=><article className="saved-row" key={site.id}>
          <button className="saved-main" type="button" onClick={()=>openSite(site)}>
            <div className="saved-preview"><iframe title={`Превью ${site.title}`} srcDoc={site.html} sandbox="" tabIndex={-1}/><span/></div>
            <div className="saved-copy"><strong>{site.title}</strong><span>malik-site · {new Date(site.createdAt).toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span><p>{site.prompt}</p><div className="tags"><em>Malik AI</em><em>Production</em></div></div>
            <div className="saved-meta"><span>Статус</span><strong>Готов</strong><span>Обновлён</span><strong>{new Date(site.createdAt).toLocaleDateString("ru-RU")}</strong></div>
          </button>
          <div className="saved-actions"><button type="button" onClick={()=>openSite(site)}><ArrowRight size={16}/> Открыть</button><button type="button" onClick={()=>onOpenCanvas?.(site.html)}><Settings2 size={16}/> Редактор</button><button type="button" onClick={()=>removeSite(site.id)}><Trash2 size={16}/> Удалить</button></div>
        </article>)}</section> : <section className="empty-state"><Globe2 size={30}/><strong>{query?"Ничего не найдено":"У вас пока нет сайтов"}</strong><span>{query?"Измените запрос поиска.":"Создайте первый сайт — он появится здесь."}</span><button className="primary" type="button" onClick={openBuilder}><Plus size={17}/> Создать сайт</button></section>}

        <section className="quick-grid"><button type="button" onClick={openBuilder}><Plus/><strong>Создать новый сайт</strong><span>Новый проект с нуля или по референсу.</span><ArrowRight/></button><button type="button" onClick={openBuilder}><Globe2/><strong>Найти вдохновение</strong><span>Linear, Stripe, Vercel, Notion и другие.</span><ArrowRight/></button><button type="button" onClick={onOpenCodex}><Code2/><strong>Открыть код</strong><span>Перейти к технической части проекта.</span><ArrowRight/></button><button type="button" onClick={()=>setBuilderOpen(true)}><Settings2/><strong>Настройки проекта</strong><span>Структура, дизайн и параметры сайта.</span><ArrowRight/></button></section>
      </div>
      <Styles/>
    </main>
  )
}

function Metric({icon,label,value,note}:{icon:React.ReactNode;label:string;value:string;note:string}){return <article className="metric"><div>{icon}<span>{label}</span></div><strong>{value}</strong><small>{note}</small></article>}

function Styles(){return <style jsx global>{`
.sites-world{width:100%;height:100%;overflow:auto;background:#000;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.sites-world *{box-sizing:border-box}.sites-world__home,.sites-world__builder{width:min(1320px,calc(100% - 46px));margin:0 auto;padding:48px 0 80px}.home-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:26px}.home-head h1,.builder-head h1{margin:0;color:#fff;font-size:38px;line-height:1;font-weight:760;letter-spacing:-.045em}.home-head p,.builder-head p{margin:9px 0 0;color:#8e8e96;font-size:14px}.primary,.secondary,.icon-btn,.toolbar button,.saved-actions button,.chips button,.inspiration-actions button,.inspiration-actions a{font:inherit}.primary{border:0;border-radius:11px;background:#fff;color:#080808;min-height:42px;padding:0 16px;font-weight:760;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.primary:disabled,.secondary:disabled{opacity:.45;cursor:default}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:26px}.metric{min-height:132px;border:1px solid #242424;border-radius:17px;background:#0a0a0a;padding:17px;display:flex;flex-direction:column}.metric>div{display:flex;align-items:center;gap:9px;color:#aaa;font-size:12px}.metric svg{width:17px;height:17px;color:#ddd}.metric>strong{margin-top:19px;font-size:31px;letter-spacing:-.04em}.metric>small{margin-top:7px;color:#6f6f76;font-size:11px}.toolbar{display:flex;gap:12px;justify-content:space-between;margin-bottom:18px}.site-search,.insp-search{height:43px;border:1px solid #292929;border-radius:11px;background:#0b0b0b;display:flex;align-items:center;gap:10px;padding:0 13px;color:#777}.site-search{flex:1}.site-search input,.insp-search input{width:100%;border:0;outline:0;background:transparent;color:#eee;font:inherit;font-size:13px}.toolbar>button{min-width:164px;border:1px solid #292929;border-radius:11px;background:#0b0b0b;color:#d2d2d5;padding:0 14px;display:flex;align-items:center;justify-content:space-between}.saved-list{display:grid;gap:12px}.saved-row{display:grid;grid-template-columns:minmax(0,1fr) 156px;gap:0;border:1px solid #252525;border-radius:17px;background:#090909;overflow:hidden}.saved-main{min-width:0;border:0;background:transparent;color:inherit;display:grid;grid-template-columns:168px minmax(0,1fr) 170px;align-items:stretch;text-align:left;padding:0;cursor:pointer}.saved-preview{position:relative;min-height:150px;overflow:hidden;border-right:1px solid #202020;background:#0f0f0f}.saved-preview iframe{position:absolute;inset:0;width:400%;height:400%;border:0;transform:scale(.25);transform-origin:0 0;pointer-events:none}.saved-preview span{position:absolute;inset:0}.saved-copy{padding:19px 20px;min-width:0}.saved-copy strong{display:block;font-size:16px}.saved-copy>span{display:block;margin-top:5px;color:#8c8c93;font-size:12px}.saved-copy p{margin:12px 0 0;color:#b0b0b5;font-size:12px;line-height:1.55;max-width:680px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.tags{display:flex;gap:7px;margin-top:14px}.tags em{font-style:normal;font-size:10px;color:#aaa;border:1px solid #272727;border-radius:999px;padding:5px 8px;background:#101010}.saved-meta{padding:19px 16px;border-left:1px solid #202020;display:grid;align-content:center;grid-template-columns:1fr;gap:4px}.saved-meta span{color:#666;font-size:10px}.saved-meta strong{font-size:12px;margin-bottom:9px}.saved-actions{padding:12px;border-left:1px solid #202020;display:grid;align-content:center;gap:7px}.saved-actions button{height:36px;border:1px solid #292929;border-radius:9px;background:#111;color:#ddd;display:flex;align-items:center;gap:8px;padding:0 11px;cursor:pointer}.empty-state{min-height:330px;border:1px dashed #2a2a2a;border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:9px;color:#777}.empty-state strong{color:#eee;font-size:19px}.empty-state span{font-size:13px}.empty-state .primary{margin-top:12px}.quick-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px}.quick-grid button{min-height:130px;border:1px solid #252525;border-radius:16px;background:#090909;color:#fff;text-align:left;padding:17px;display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto auto 1fr;gap:8px;cursor:pointer}.quick-grid button>svg:first-child{width:20px}.quick-grid strong{font-size:13px;align-self:center}.quick-grid span{grid-column:1/4;color:#777;font-size:11px;line-height:1.5}.quick-grid button>svg:last-child{grid-column:3;grid-row:3;width:16px;align-self:end;color:#777}.builder-head{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:start;margin-bottom:22px}.builder-head>div>span{display:block;color:#777;font-size:12px;margin-bottom:8px}.icon-btn{width:40px;height:40px;border:1px solid #292929;border-radius:10px;background:#0d0d0d;color:#ddd;display:grid;place-items:center;cursor:pointer}.builder-panel{border:1px solid #252525;border-radius:18px;background:#090909;padding:20px;margin-bottom:14px}.step-title{display:flex;align-items:flex-start;gap:11px;margin-bottom:15px}.step-title>span{width:27px;height:27px;border-radius:999px;background:#fff;color:#000;font-size:12px;font-weight:800;display:grid;place-items:center;flex:0 0 auto}.step-title div{display:grid;gap:4px}.step-title strong{font-size:14px}.step-title small{color:#727279;font-size:11px}.builder-panel textarea{width:100%;min-height:142px;resize:vertical;border:1px solid #2c2c2c;border-radius:13px;background:#0d0d0d;color:#eee;padding:15px;font:inherit;font-size:13px;line-height:1.55;outline:0}.error{color:#d0d0d0;font-size:12px}.insp-search{width:100%;margin-bottom:12px}.chips{display:flex;gap:7px;overflow:auto;padding-bottom:11px}.chips button{border:1px solid #292929;border-radius:999px;background:#101010;color:#9a9aa1;padding:7px 11px;font-size:11px;cursor:pointer}.chips button.active{background:#fff;color:#000;border-color:#fff}.inspiration-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.inspiration-card{border:1px solid #262626;border-radius:15px;background:#0b0b0b;overflow:hidden}.live-preview{aspect-ratio:16/10;background:#111;border-bottom:1px solid #222;overflow:hidden}.live-preview img{width:100%;height:100%;object-fit:cover;display:block}.inspiration-copy{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:13px 13px 0}.inspiration-copy div{display:grid;gap:3px}.inspiration-copy strong{font-size:13px}.inspiration-copy span{color:#777;font-size:10px}.inspiration-copy em{font-style:normal;color:#aaa;font-size:9px;border:1px solid #292929;border-radius:999px;padding:4px 7px}.inspiration-card p{padding:0 13px;margin:10px 0 13px;color:#828289;font-size:11px;line-height:1.45;min-height:32px}.inspiration-actions{display:grid;grid-template-columns:1fr 38px;gap:7px;padding:0 13px 13px}.inspiration-actions button,.inspiration-actions a{height:34px;border:1px solid #2a2a2a;border-radius:9px;background:#121212;color:#e5e5e5;display:flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer;font-size:11px}.builder-actions{display:flex;flex-wrap:wrap;gap:8px}.secondary{min-height:42px;padding:0 13px;border:1px solid #292929;border-radius:11px;background:#111;color:#ddd;display:inline-flex;align-items:center;gap:8px;font-weight:650;cursor:pointer}.generated{margin-top:18px;border:1px solid #292929;border-radius:14px;overflow:hidden;background:#000}.browser{height:34px;border-bottom:1px solid #222;display:flex;align-items:center;gap:5px;padding:0 10px}.browser>span{width:7px;height:7px;border-radius:50%;background:#3a3a3a}.browser small{margin-left:7px;color:#666}.generated iframe{width:100%;height:560px;border:0;background:#fff}.spin{animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:980px){.metrics,.quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.saved-row{grid-template-columns:1fr}.saved-actions{grid-template-columns:repeat(3,1fr);border-left:0;border-top:1px solid #202020}.saved-main{grid-template-columns:140px minmax(0,1fr)}.saved-meta{display:none}.inspiration-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:680px){.sites-world__home,.sites-world__builder{width:min(100% - 24px,1320px);padding-top:28px}.home-head{align-items:center}.home-head h1,.builder-head h1{font-size:31px}.home-head p{font-size:12px}.create-top{width:42px;padding:0;font-size:0}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metric{min-height:108px;padding:13px}.metric>strong{font-size:25px;margin-top:13px}.toolbar>button{display:none}.saved-main{display:block}.saved-preview{width:100%;min-height:180px;border-right:0;border-bottom:1px solid #202020}.saved-actions{grid-template-columns:1fr}.quick-grid{grid-template-columns:1fr 1fr}.inspiration-grid{grid-template-columns:1fr}.builder-panel{padding:14px}.builder-actions{display:grid;grid-template-columns:1fr 1fr}.builder-actions .primary{grid-column:1/3}.generated iframe{height:440px}}
`}</style>}
