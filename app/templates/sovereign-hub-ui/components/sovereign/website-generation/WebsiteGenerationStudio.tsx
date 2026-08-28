"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Code2,
  ExternalLink,
  Github,
  Grid2X2,
  Layers3,
  LayoutTemplate,
  List,
  Loader2,
  Maximize2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { clientFetchWithTimeout } from "@/lib/api-client"

export type WebsiteGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

type SkillSource = {
  id: string
  name: string
  category: string
  source: string
  repo: string
  url: string
  role: string
  capabilities?: string[]
}

type SavedSite = {
  id: string
  title: string
  prompt: string
  html: string
  createdAt: string
  skills?: SkillSource[]
}

type ViewMode = "grid" | "list"

const ENDPOINT = "/api/generate/website"
const STORAGE_KEY = "malik-sites-v3"
const DEFAULT_PROMPT = "Создай современный сайт для моего проекта. Сначала пойми продукт и аудиторию, затем собери сильную структуру и дизайн. Нужны адаптивный hero, преимущества, доказательства, CTA, FAQ и рабочие интерактивные состояния."

const CORE_SOURCES: SkillSource[] = [
  { id: "tailwind-layout", name: "Responsive Layout System", category: "layout", source: "Tailwind CSS", repo: "tailwindlabs/tailwindcss", url: "https://github.com/tailwindlabs/tailwindcss", role: "Сетка, spacing и mobile-first композиция." },
  { id: "radix-accessibility", name: "Accessible Interaction Primitives", category: "accessibility", source: "Radix Primitives", repo: "radix-ui/primitives", url: "https://github.com/radix-ui/primitives", role: "Фокус, клавиатура, меню, FAQ и доступность." },
  { id: "shadcn-composition", name: "Product UI Composition", category: "components", source: "shadcn/ui", repo: "shadcn-ui/ui", url: "https://github.com/shadcn-ui/ui", role: "Чистая композиция продуктовых блоков и состояний." },
  { id: "motion-interactions", name: "Motion & Micro-interactions", category: "motion", source: "Motion", repo: "motiondivision/motion", url: "https://github.com/motiondivision/motion", role: "Микро-анимации и reduced-motion-safe поведение." },
]

function escapeHtmlText(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char] || char))
}

function fallbackSite(prompt: string) {
  const safe = escapeHtmlText(prompt.slice(0, 320))
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Malik Site</title><style>*{box-sizing:border-box}body{margin:0;background:#080809;color:#f6f6f3;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}.shell{width:min(1120px,calc(100% - 34px));margin:auto}.nav{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #242428}.brand{font-weight:850;letter-spacing:-.04em}.hero{min-height:78vh;display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#9c8cff}h1{font-size:clamp(48px,8vw,90px);line-height:.94;letter-spacing:-.065em;margin:16px 0}p{color:#a4a4aa;line-height:1.65;font-size:17px}.button{display:inline-flex;margin-top:22px;padding:14px 18px;border-radius:999px;background:#f6f6f3;color:#09090a;text-decoration:none;font-weight:750}.visual{height:430px;border:1px solid #29292f;border-radius:30px;background:linear-gradient(145deg,#18151f,#0d0d10);padding:18px}.window{height:100%;border:1px solid #29292f;border-radius:22px;background:#0b0b0d;padding:22px}.line{height:12px;border-radius:999px;background:#202027;margin-bottom:12px}.line:nth-child(2){width:72%}.line:nth-child(3){width:48%}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:70px 0}.card{border:1px solid #28282d;border-radius:24px;background:#111114;padding:24px}.card strong{font-size:20px}.card p{font-size:14px}@media(max-width:780px){.hero{grid-template-columns:1fr;padding:70px 0}.visual{height:300px}.cards{grid-template-columns:1fr}}</style></head><body><div class="shell"><nav class="nav"><span class="brand">Malik Site</span><span>Skill Engine</span></nav><section class="hero"><div><span class="eyebrow">Malik Skill Engine</span><h1>Идея превращается в цельный продукт</h1><p>${safe}</p><a class="button" href="#features">Открыть</a></div><div class="visual"><div class="window"><div class="line"></div><div class="line"></div><div class="line"></div></div></div></section><section id="features" class="cards"><article class="card"><strong>Система</strong><p>Один визуальный язык вместо случайного набора блоков.</p></article><article class="card"><strong>Адаптивность</strong><p>Композиция работает на телефоне и компьютере.</p></article><article class="card"><strong>Интерактивность</strong><p>Кнопки, состояния и навигация имеют реальную логику.</p></article></section></div></body></html>`
}

function titleFromPrompt(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim()
  if (!compact) return "Новый сайт"
  return compact.length > 56 ? `${compact.slice(0, 55)}…` : compact
}

function safeSkills(value: unknown): SkillSource[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, 12)
    .map((entry) => {
      const item = entry as Record<string, unknown>
      return {
        id: String(item.id || item.repo || "skill"),
        name: String(item.name || item.source || "Skill"),
        category: String(item.category || "design"),
        source: String(item.source || item.name || "GitHub"),
        repo: String(item.repo || ""),
        url: String(item.url || ""),
        role: String(item.role || ""),
        capabilities: Array.isArray(item.capabilities) ? item.capabilities.map(String).slice(0, 8) : undefined,
      }
    })
}

export function WebsiteGenerationStudio({
  onViewChange,
  onOpenCodex,
  onOpenCanvas,
  onNewChat,
}: WebsiteGenerationStudioProps) {
  const [sites, setSites] = useState<SavedSite[]>([])
  const [query, setQuery] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [builderOpen, setBuilderOpen] = useState(false)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("Готов к созданию")
  const [html, setHtml] = useState("")
  const [skills, setSkills] = useState<SkillSource[]>(CORE_SOURCES)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const rawV3 = window.localStorage.getItem(STORAGE_KEY)
      const rawV2 = window.localStorage.getItem("malik-sites-v2")
      const raw = rawV3 || rawV2
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) setSites(parsed.slice(0, 24))
    } catch {
      // A broken local draft must never block the workspace.
    }
  }, [])

  const persist = (next: SavedSite[]) => {
    setSites(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 24)))
    } catch {
      // Local persistence is best effort.
    }
  }

  const visibleSites = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return sites
    return sites.filter((site) => `${site.title} ${site.prompt}`.toLowerCase().includes(needle))
  }, [query, sites])

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedId) || null,
    [selectedId, sites],
  )

  const openBuilder = () => {
    setSelectedId(null)
    setHtml("")
    setPrompt(DEFAULT_PROMPT)
    setSkills(CORE_SOURCES)
    setError("")
    setStatus("Опишите сайт")
    setBuilderOpen(true)
  }

  const openSite = (site: SavedSite) => {
    setSelectedId(site.id)
    setPrompt(site.prompt)
    setHtml(site.html)
    setSkills(site.skills?.length ? site.skills : CORE_SOURCES)
    setError("")
    setStatus("Сохранённый сайт")
    setBuilderOpen(true)
  }

  const removeSite = (id: string) => {
    const next = sites.filter((site) => site.id !== id)
    persist(next)
    if (selectedId === id) {
      setSelectedId(null)
      setHtml("")
      setBuilderOpen(false)
    }
  }

  const generate = async () => {
    const userPrompt = prompt.trim()
    if (!userPrompt) {
      setError("Сначала опишите сайт")
      return
    }

    setLoading(true)
    setError("")
    setSkills([])
    setStatus("Выбираю дизайн-скиллы и собираю WebsitePlan…")

    try {
      const response = await clientFetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: userPrompt,
            template: "adaptive-skill-first",
            style: "skill-selected",
            quality: "production",
          }),
        },
        150_000,
      )

      const data = await response.json().catch(() => ({}))
      const generated = String(data.html || data.code || data.content || "").trim()
      const finalHtml = /<html[\s>]/i.test(generated) ? generated : fallbackSite(userPrompt)
      const selectedSkills = safeSkills(data.skills)
      const finalSkills = selectedSkills.length ? selectedSkills : CORE_SOURCES

      const site: SavedSite = {
        id: selectedId || crypto.randomUUID(),
        title: titleFromPrompt(userPrompt),
        prompt: userPrompt,
        html: finalHtml,
        createdAt: new Date().toISOString(),
        skills: finalSkills,
      }

      const next = [site, ...sites.filter((item) => item.id !== site.id)].slice(0, 24)
      persist(next)
      setSelectedId(site.id)
      setHtml(finalHtml)
      setSkills(finalSkills)
      setStatus(`Сайт собран из ${finalSkills.length} скиллов`)
      if (data.fallback) {
        setError("Planner был недоступен, но сайт всё равно собран локальным Skill Engine без сырого model-HTML.")
      }
    } catch {
      const finalHtml = fallbackSite(userPrompt)
      const site: SavedSite = {
        id: selectedId || crypto.randomUUID(),
        title: titleFromPrompt(userPrompt),
        prompt: userPrompt,
        html: finalHtml,
        createdAt: new Date().toISOString(),
        skills: CORE_SOURCES,
      }
      const next = [site, ...sites.filter((item) => item.id !== site.id)].slice(0, 24)
      persist(next)
      setSelectedId(site.id)
      setHtml(finalHtml)
      setSkills(CORE_SOURCES)
      setStatus("Локальный Skill Engine собрал резервную версию")
      setError("Сервер временно не ответил. Показана структурированная локальная версия — не сырой ответ модели.")
    } finally {
      setLoading(false)
    }
  }

  const openInNewTab = () => {
    if (!html) return
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <main className="sites" data-view="website-generation">
      <div className="sites__inner">
        <header className="sites__head">
          <h1>Сайты</h1>
          <div className="sites__search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск сайтов" aria-label="Поиск сайтов" />
          </div>
        </header>

        <div className="sites__view-toggle" aria-label="Вид списка">
          <button type="button" className={viewMode === "grid" ? "is-active" : ""} onClick={() => setViewMode("grid")} aria-label="Сетка"><Grid2X2 size={18} /></button>
          <button type="button" className={viewMode === "list" ? "is-active" : ""} onClick={() => setViewMode("list")} aria-label="Список"><List size={19} /></button>
        </div>

        <section className="sites__create-card">
          <div className="sites__create-icon"><LayoutTemplate size={24} /></div>
          <div className="sites__create-copy">
            <strong>Создайте сайт на основе своей идеи</strong>
            <span>Malik AI выбирает подходящие open-source дизайн-скиллы, модель строит только план, а сайт собирает Skill Engine.</span>
          </div>
          <button type="button" className="sites__primary" onClick={openBuilder}>Создать сайт</button>
        </section>

        {visibleSites.length ? (
          <section className={`sites__saved sites__saved--${viewMode}`}>
            {visibleSites.map((site) => (
              <article key={site.id} className="site-card">
                <button type="button" className="site-card__main" onClick={() => openSite(site)}>
                  <div className="site-card__preview">
                    <iframe title={`Превью ${site.title}`} srcDoc={site.html} sandbox="" tabIndex={-1} />
                    <span className="site-card__preview-shield" />
                  </div>
                  <div className="site-card__copy">
                    <strong>{site.title}</strong>
                    <span>{site.skills?.length || 0} skills · {new Date(site.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </button>
                <button type="button" className="site-card__delete" onClick={() => removeSite(site.id)} aria-label={`Удалить ${site.title}`}><Trash2 size={16} /></button>
              </article>
            ))}
          </section>
        ) : query ? <p className="sites__empty">По этому запросу сайтов не найдено.</p> : null}

        {builderOpen ? (
          <section className="builder" aria-label="Создание сайта">
            <div className="builder__top">
              <div>
                <span className="builder__model"><Layers3 size={12} /> Malik Skill Engine · MalikCoder 4.7 Planner</span>
                <h2>{selectedSite ? "Редактировать сайт" : "Новый сайт"}</h2>
                <p>{status}</p>
              </div>
              <button type="button" className="builder__close" onClick={() => { setBuilderOpen(false); setError("") }} aria-label="Закрыть"><X size={20} /></button>
            </div>

            <div className="builder__contract">
              <ShieldCheck size={17} />
              <div><strong>Один формат, без каши</strong><span>Модель возвращает только WebsitePlan JSON. HTML/CSS/JS собирает детерминированный renderer по выбранным скиллам.</span></div>
            </div>

            <textarea className="builder__prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} placeholder="Например: сделай магазин одежды с редакционным hero, каталогом, фильтрами, отзывами и чёрно-белой типографикой…" disabled={loading} />

            {error ? <p className="builder__error">{error}</p> : null}

            <div className="builder__actions">
              <button type="button" className="sites__primary" onClick={generate} disabled={loading}>
                {loading ? <Loader2 className="builder__spin" size={17} /> : <Sparkles size={17} />}
                {loading ? "Собираю…" : selectedSite ? "Пересобрать сайт" : "Сгенерировать сайт"}
              </button>
              <button type="button" className="sites__secondary" onClick={() => onOpenCanvas?.(html)} disabled={!html}><Maximize2 size={16} /> Открыть в редакторе</button>
              <button type="button" className="sites__secondary" onClick={openInNewTab} disabled={!html}><ExternalLink size={16} /> Превью</button>
              <button type="button" className="sites__secondary" onClick={onOpenCodex}><Code2 size={16} /> Код</button>
            </div>

            <section className="builder__skills" aria-label="Использованные скиллы">
              <div className="builder__skills-head"><div><Github size={17} /><strong>Источники скиллов</strong></div><span>{loading ? "подбираю…" : `${skills.length} выбрано`}</span></div>
              <div className="builder__skill-grid">
                {(skills.length ? skills : CORE_SOURCES).map((skill) => (
                  <a key={skill.id} className="skill" href={skill.url || `https://github.com/${skill.repo}`} target="_blank" rel="noreferrer">
                    <div className="skill__top"><span>{skill.category}</span><ExternalLink size={12} /></div>
                    <strong>{skill.source}</strong>
                    <code>{skill.repo}</code>
                    <p>{skill.role}</p>
                  </a>
                ))}
              </div>
            </section>

            {html ? (
              <div className="builder__preview-wrap">
                <div className="builder__browser-bar"><span /><span /><span /><small>{selectedSite?.title || "Malik AI Site"}</small></div>
                <iframe className="builder__preview" title="Сгенерированный сайт" srcDoc={html} sandbox="allow-scripts allow-forms allow-modals" />
              </div>
            ) : (
              <div className="builder__waiting"><Plus size={22} /><span>После сборки здесь появится настоящий сайт.</span></div>
            )}
          </section>
        ) : null}

        <footer className="sites__footer">
          <button type="button" onClick={() => onViewChange("home")}>Вернуться в чат</button>
          <button type="button" onClick={() => { onNewChat?.(); onViewChange("home") }}>Новый чат</button>
        </footer>
      </div>

      <style jsx>{`
        .sites{width:100%;height:100%;overflow-y:auto;background:#000;color:#f4f4f4;padding:clamp(68px,7vw,94px) clamp(18px,4vw,48px) 80px;scrollbar-width:thin}
        .sites__inner{width:min(100%,940px);margin:0 auto}.sites__head{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:70px}.sites__head h1{margin:0;font-size:32px;line-height:1;font-weight:650;letter-spacing:-.04em}.sites__search{width:min(270px,42vw);height:42px;border:1px solid #424242;border-radius:999px;background:#202020;display:flex;align-items:center;gap:10px;padding:0 15px;color:#a9a9a9}.sites__search input{width:100%;border:0;outline:0;background:transparent;color:#eee;font:inherit;font-size:14px}.sites__search input::placeholder{color:#aaa}.sites__view-toggle{display:flex;justify-content:flex-end;gap:6px;margin-bottom:24px}.sites__view-toggle button{width:40px;height:40px;border:0;border-radius:999px;background:transparent;color:#a6a6a6;display:grid;place-items:center;cursor:pointer}.sites__view-toggle button.is-active{background:#3a3a3a;color:#fff}.sites__create-card{min-height:108px;border:1px solid #484848;border-radius:18px;background:#303030;display:flex;align-items:center;gap:16px;padding:20px 24px;margin-bottom:24px}.sites__create-icon{width:44px;height:44px;flex:0 0 auto;border:1px solid #505050;border-radius:13px;background:#252525;display:grid;place-items:center;color:#f2f2f2}.sites__create-copy{min-width:0;display:flex;flex-direction:column;gap:5px;flex:1}.sites__create-copy strong{font-size:16px;font-weight:700}.sites__create-copy span{font-size:14px;color:#d0d0d0;line-height:1.45}.sites__primary,.sites__secondary{border:0;font:inherit;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap}.sites__primary{min-height:40px;padding:0 16px;border-radius:999px;background:#fff;color:#080808}.sites__primary:disabled,.sites__secondary:disabled{opacity:.45;cursor:default}.sites__secondary{min-height:40px;padding:0 14px;border-radius:11px;border:1px solid #343434;background:#171717;color:#e8e8e8}.sites__saved{display:grid;gap:12px;margin-top:16px}.sites__saved--grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sites__saved--list{grid-template-columns:1fr}.site-card{position:relative;border:1px solid #272727;border-radius:16px;background:#101010;overflow:hidden;min-width:0}.site-card__main{display:flex;width:100%;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;min-width:0}.sites__saved--grid .site-card__main{display:block}.site-card__preview{position:relative;width:180px;aspect-ratio:16/10;overflow:hidden;background:#161616;flex:0 0 auto;border-right:1px solid #262626}.sites__saved--grid .site-card__preview{width:100%;border-right:0;border-bottom:1px solid #262626}.site-card__preview iframe{position:absolute;inset:0;width:400%;height:400%;border:0;transform:scale(.25);transform-origin:0 0;pointer-events:none;background:#fff}.site-card__preview-shield{position:absolute;inset:0}.site-card__copy{min-width:0;padding:17px 46px 17px 17px;display:flex;flex-direction:column;justify-content:center;gap:8px}.site-card__copy strong{font-size:14px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.site-card__copy span{font-size:12px;color:#777}.site-card__delete{position:absolute;right:10px;top:10px;width:34px;height:34px;border:0;border-radius:9px;background:rgba(0,0,0,.68);color:#aaa;display:grid;place-items:center;cursor:pointer}.site-card__delete:hover{color:#fff;background:#2b2b2b}.sites__empty{color:#777;text-align:center;padding:36px 0}.builder{margin-top:28px;border:1px solid #2d2d2d;border-radius:20px;background:#0d0d0d;padding:22px}.builder__top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:16px}.builder__top h2{font-size:22px;letter-spacing:-.03em;margin:7px 0 4px}.builder__top p{margin:0;color:#828282;font-size:13px}.builder__model{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid #303030;border-radius:8px;color:#b3b3b3;font-size:11px;font-weight:700;letter-spacing:.02em}.builder__close{width:38px;height:38px;border:0;border-radius:10px;background:#171717;color:#a4a4a4;display:grid;place-items:center;cursor:pointer}.builder__contract{display:flex;gap:11px;align-items:flex-start;border:1px solid #2c2c2c;border-radius:13px;background:#121212;padding:12px 14px;margin-bottom:13px;color:#aaa}.builder__contract svg{margin-top:1px;color:#d5d5d5;flex:0 0 auto}.builder__contract div{display:flex;flex-direction:column;gap:3px}.builder__contract strong{font-size:12px;color:#dedede}.builder__contract span{font-size:11px;line-height:1.45}.builder__prompt{width:100%;resize:vertical;min-height:128px;border:1px solid #343434;border-radius:14px;background:#151515;color:#f0f0f0;padding:15px 16px;font:inherit;font-size:14px;line-height:1.55;outline:none}.builder__prompt:focus{border-color:#555}.builder__error{margin:10px 0 0;color:#bdbdbd;font-size:12px;line-height:1.5}.builder__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}.builder__spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.builder__skills{margin-top:20px}.builder__skills-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;color:#868686;font-size:11px}.builder__skills-head>div{display:flex;align-items:center;gap:7px}.builder__skills-head strong{color:#c8c8c8;font-size:12px}.builder__skill-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.skill{min-width:0;border:1px solid #292929;border-radius:13px;background:#111;color:inherit;text-decoration:none;padding:13px;transition:border-color .16s ease,background .16s ease}.skill:hover{border-color:#454545;background:#151515}.skill__top{display:flex;align-items:center;justify-content:space-between;color:#666;font-size:9px;text-transform:uppercase;letter-spacing:.1em}.skill strong{display:block;margin-top:10px;font-size:13px}.skill code{display:block;margin-top:4px;color:#777;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.skill p{margin:9px 0 0;color:#8c8c8c;font-size:10px;line-height:1.45}.builder__preview-wrap{margin-top:20px;border:1px solid #303030;border-radius:16px;overflow:hidden;background:#111}.builder__browser-bar{height:42px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #292929;padding:0 13px;background:#161616}.builder__browser-bar span{width:8px;height:8px;border-radius:50%;background:#555}.builder__browser-bar small{margin-left:8px;color:#777;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.builder__preview{display:block;width:100%;height:min(62vh,620px);border:0;background:#fff}.builder__waiting{min-height:180px;margin-top:20px;border:1px dashed #2e2e2e;border-radius:14px;display:grid;place-items:center;align-content:center;gap:10px;color:#666;font-size:13px}.sites__footer{display:flex;gap:14px;margin-top:32px;padding-top:18px;border-top:1px solid #191919}.sites__footer button{border:0;background:transparent;color:#666;padding:0;font:inherit;font-size:12px;cursor:pointer}.sites__footer button:hover{color:#aaa}@media(max-width:780px){.sites{padding:24px 14px 72px}.sites__head{align-items:flex-start;flex-direction:column;margin-bottom:44px;gap:20px}.sites__head h1{font-size:30px}.sites__search{width:100%;max-width:none}.sites__create-card{align-items:flex-start;flex-wrap:wrap;padding:18px}.sites__create-copy{width:calc(100% - 60px)}.sites__create-card .sites__primary{width:100%;margin-top:4px}.sites__saved--grid{grid-template-columns:1fr}.site-card__preview{width:118px}.builder{padding:16px;border-radius:16px}.builder__skill-grid{grid-template-columns:1fr 1fr}.builder__actions>.sites__primary,.builder__actions>.sites__secondary{flex:1 1 calc(50% - 8px)}.builder__preview{height:58vh}}@media(max-width:460px){.builder__actions>.sites__primary,.builder__actions>.sites__secondary{flex-basis:100%}.builder__skill-grid{grid-template-columns:1fr}.site-card__preview{width:96px}}
      `}</style>
    </main>
  )
}
