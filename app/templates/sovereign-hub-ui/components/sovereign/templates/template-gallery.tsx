"use client"

import { useMemo, useState } from "react"
import { ArrowRight, Layers3, Search, X } from "lucide-react"
import {
  MALIK_TEMPLATES,
  MALIK_TEMPLATE_CATEGORIES,
  type MalikTemplate,
  type MalikTemplateCategory,
} from "@/lib/malik-template-registry"

type TemplateFilter = "Все" | MalikTemplateCategory

export type TemplateGalleryPanelProps = {
  onLaunchTemplate?: (template: MalikTemplate) => void
}

export type TemplatePreviewCardProps = {
  template: MalikTemplate
  onLaunchTemplate?: (template: MalikTemplate) => void
}

export function TemplatePreviewCard({ template, onLaunchTemplate }: TemplatePreviewCardProps) {
  return (
    <button type="button" className="mtpl-card" onClick={() => onLaunchTemplate?.(template)}>
      <span className={`mtpl-card-media mtpl-v${template.visual}`}>
        <img src={template.preview} alt={`Превью шаблона «${template.title}»`} loading="lazy" decoding="async" draggable={false} />
        <span className="mtpl-media-shade" />
        <span className="mtpl-preview-ui" aria-hidden="true">
          <span className="mtpl-preview-nav">
            <b>{template.title}</b>
            <span><i /><i /><i /></span>
          </span>
          <span className="mtpl-preview-copy">
            <small>{template.category}</small>
            <strong>{template.hero}</strong>
            <em>Explore <ArrowRight /></em>
          </span>
          <span className="mtpl-preview-detail"><i /><i /><i /></span>
        </span>
        {template.featured ? <span className="mtpl-featured">Выбор Malik</span> : null}
      </span>
      <span className="mtpl-card-copy">
        <span className="mtpl-card-title">{template.title}</span>
        <span className="mtpl-card-description">{template.description}</span>
        <span className="mtpl-card-meta"><span>{template.category}</span><ArrowRight aria-hidden="true" /></span>
      </span>
    </button>
  )
}

export function TemplateGalleryPanel({ onLaunchTemplate }: TemplateGalleryPanelProps) {
  const [filter, setFilter] = useState<TemplateFilter>("Все")
  const [query, setQuery] = useState("")

  const templates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru")
    return MALIK_TEMPLATES.filter((template) => {
      const matchesCategory = filter === "Все" || template.category === filter
      const matchesQuery = !normalized || `${template.title} ${template.category} ${template.description} ${template.hero}`.toLocaleLowerCase("ru").includes(normalized)
      return matchesCategory && matchesQuery
    }).sort((a, b) => Number(b.featured) - Number(a.featured))
  }, [filter, query])

  const reset = () => { setFilter("Все"); setQuery("") }

  return (
    <main className="mtpl-shell">
      <div className="mtpl-content">
        <header className="mtpl-header">
          <div className="mtpl-heading">
            <span className="mtpl-eyebrow"><Layers3 aria-hidden="true" />Библиотека Malik AI</span>
            <h1>100 сайтов мирового уровня</h1>
            <p>Премиальные шаблоны из AI, fintech, e-commerce, luxury, недвижимости, ресторанов, travel, health, creative и deep tech.</p>
          </div>
          <div className="mtpl-total" aria-label="Количество шаблонов"><strong>100</strong><span>шаблонов</span></div>
        </header>

        <section className="mtpl-controls" aria-label="Поиск и фильтры шаблонов">
          <label className="mtpl-search">
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Найти премиальный шаблон" aria-label="Найти шаблон" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск"><X aria-hidden="true" /></button> : null}
          </label>
          <div className="mtpl-filters" role="group" aria-label="Категории">
            {(["Все", ...MALIK_TEMPLATE_CATEGORIES] as TemplateFilter[]).map((category) => (
              <button key={category} type="button" className={filter === category ? "is-active" : undefined} aria-pressed={filter === category} onClick={() => setFilter(category)}>{category}</button>
            ))}
          </div>
        </section>

        <div className="mtpl-results-head"><span>{filter === "Все" ? "Премиальная коллекция" : filter}</span><small>{templates.length} {templates.length === 1 ? "результат" : "результатов"}</small></div>

        {templates.length ? (
          <section className="mtpl-grid" aria-label="Шаблоны Malik AI">{templates.map((template) => <TemplatePreviewCard key={template.id} template={template} onLaunchTemplate={onLaunchTemplate} />)}</section>
        ) : (
          <section className="mtpl-empty"><Layers3 aria-hidden="true" /><h2>Шаблоны не найдены</h2><p>Измените запрос или сбросьте выбранную категорию.</p><button type="button" onClick={reset}>Показать все шаблоны</button></section>
        )}
      </div>

      <style jsx global>{`
        html #malik-root .mtpl-shell { min-height:100% !important; background:#000 !important; color:#f7f7f7 !important; }
        html #malik-root .mtpl-content { width:min(100%,1500px) !important; margin:0 auto !important; }
        html #malik-root .mtpl-heading h1 { letter-spacing:-.055em !important; }
        html #malik-root .mtpl-heading p { max-width:900px !important; color:rgba(255,255,255,.5) !important; }

        html #malik-root .mtpl-search { position:relative !important; overflow:hidden !important; isolation:isolate !important; box-shadow:none !important; -webkit-box-shadow:none !important; }
        html #malik-root .mtpl-search > input,
        html #malik-root .mtpl-search > input[type="search"],
        html #malik-root .mtpl-search > input[type="text"],
        html #malik-root .mtpl-search > input:is(:hover,:focus,:focus-visible,:active,:autofill) {
          appearance:none !important; -webkit-appearance:none !important; width:100% !important; height:100% !important; min-height:0 !important; margin:0 !important; padding-block:0 !important; border:0 !important; outline:0 !important; border-radius:0 !important; background:transparent !important; background-color:transparent !important; background-image:none !important; box-shadow:none !important; -webkit-box-shadow:none !important; filter:none !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important;
        }
        html #malik-root .mtpl-search > input::-webkit-search-decoration,
        html #malik-root .mtpl-search > input::-webkit-search-cancel-button,
        html #malik-root .mtpl-search > input::-webkit-search-results-button,
        html #malik-root .mtpl-search > input::-webkit-search-results-decoration { display:none !important; -webkit-appearance:none !important; }

        html #malik-root .mtpl-grid { display:grid !important; grid-template-columns:repeat(4,minmax(0,1fr)) !important; gap:16px !important; align-items:stretch !important; }
        html #malik-root .mtpl-card { position:relative !important; display:flex !important; min-width:0 !important; flex-direction:column !important; overflow:hidden !important; padding:0 !important; text-align:left !important; border:1px solid rgba(255,255,255,.115) !important; border-radius:14px !important; background:#101010 !important; box-shadow:none !important; transform:translateZ(0); transition:transform .22s ease,border-color .22s ease,background .22s ease !important; }
        html #malik-root .mtpl-card:hover { transform:translateY(-3px) !important; border-color:rgba(255,255,255,.24) !important; background:#141414 !important; }
        html #malik-root .mtpl-card-media { position:relative !important; display:block !important; height:clamp(178px,14vw,238px) !important; overflow:hidden !important; background:#060606 !important; isolation:isolate !important; }
        html #malik-root .mtpl-card-media > img { position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; object-fit:cover !important; transform:scale(1.015) !important; transition:transform .55s cubic-bezier(.2,.7,.2,1),filter .35s ease !important; }
        html #malik-root .mtpl-card:hover .mtpl-card-media > img { transform:scale(1.055) !important; }
        html #malik-root .mtpl-media-shade { position:absolute !important; inset:0 !important; z-index:1 !important; pointer-events:none !important; }
        html #malik-root .mtpl-preview-ui { position:absolute !important; inset:0 !important; z-index:2 !important; display:flex !important; flex-direction:column !important; justify-content:space-between !important; padding:14px 15px 15px !important; color:var(--mtpl-fg,#fff) !important; pointer-events:none !important; }
        html #malik-root .mtpl-preview-nav { display:flex !important; align-items:center !important; justify-content:space-between !important; gap:12px !important; font-size:8px !important; letter-spacing:.08em !important; text-transform:uppercase !important; }
        html #malik-root .mtpl-preview-nav b { max-width:72% !important; overflow:hidden !important; text-overflow:ellipsis !important; white-space:nowrap !important; font-size:8px !important; font-weight:760 !important; }
        html #malik-root .mtpl-preview-nav > span { display:flex !important; gap:4px !important; }
        html #malik-root .mtpl-preview-nav i { width:3px !important; height:3px !important; border-radius:50% !important; background:currentColor !important; opacity:.65 !important; }
        html #malik-root .mtpl-preview-copy { display:flex !important; max-width:92% !important; flex-direction:column !important; align-items:flex-start !important; gap:6px !important; margin-top:auto !important; }
        html #malik-root .mtpl-preview-copy small { font-size:7px !important; font-weight:720 !important; letter-spacing:.16em !important; text-transform:uppercase !important; opacity:.72 !important; }
        html #malik-root .mtpl-preview-copy strong { display:block !important; max-width:260px !important; font-size:clamp(16px,1.45vw,24px) !important; line-height:.98 !important; letter-spacing:-.045em !important; font-weight:760 !important; text-wrap:balance !important; text-shadow:0 2px 20px rgba(0,0,0,.18) !important; }
        html #malik-root .mtpl-preview-copy em { display:inline-flex !important; align-items:center !important; gap:4px !important; margin-top:1px !important; padding:5px 8px !important; border:1px solid color-mix(in srgb,currentColor 35%,transparent) !important; border-radius:999px !important; background:color-mix(in srgb,var(--mtpl-surface,#000) 45%,transparent) !important; font-size:7px !important; font-style:normal !important; font-weight:720 !important; backdrop-filter:blur(8px) !important; }
        html #malik-root .mtpl-preview-copy em svg { width:8px !important; height:8px !important; }
        html #malik-root .mtpl-preview-detail { position:absolute !important; right:14px !important; bottom:13px !important; display:grid !important; width:56px !important; gap:3px !important; opacity:.62 !important; }
        html #malik-root .mtpl-preview-detail i { display:block !important; height:1px !important; background:currentColor !important; }
        html #malik-root .mtpl-preview-detail i:nth-child(2) { width:72% !important; }
        html #malik-root .mtpl-preview-detail i:nth-child(3) { width:46% !important; }
        html #malik-root .mtpl-featured { top:12px !important; left:12px !important; z-index:5 !important; border:1px solid rgba(221,177,52,.48) !important; background:rgba(6,6,6,.76) !important; color:#f1c84d !important; backdrop-filter:blur(10px) !important; box-shadow:none !important; }
        html #malik-root .mtpl-card-copy { min-height:124px !important; padding:16px 16px 14px !important; }
        html #malik-root .mtpl-card-title { font-size:15px !important; letter-spacing:-.02em !important; }
        html #malik-root .mtpl-card-description { display:-webkit-box !important; overflow:hidden !important; -webkit-line-clamp:2 !important; -webkit-box-orient:vertical !important; min-height:36px !important; color:rgba(255,255,255,.48) !important; }
        html #malik-root .mtpl-card-meta { margin-top:15px !important; }

        html #malik-root .mtpl-v0 { --mtpl-fg:#f8f8f8; --mtpl-surface:#050505; }
        html #malik-root .mtpl-v0 > img { filter:brightness(.53) saturate(.72) contrast(1.18) !important; }
        html #malik-root .mtpl-v0 .mtpl-media-shade { background:linear-gradient(120deg,rgba(0,0,0,.86),rgba(0,0,0,.12) 72%) !important; }
        html #malik-root .mtpl-v1 { --mtpl-fg:#15110c; --mtpl-surface:#f0e7da; }
        html #malik-root .mtpl-v1 > img { filter:brightness(1.02) saturate(.62) sepia(.13) !important; }
        html #malik-root .mtpl-v1 .mtpl-media-shade { background:linear-gradient(90deg,rgba(244,237,225,.92),rgba(244,237,225,.08) 75%) !important; }
        html #malik-root .mtpl-v2 { --mtpl-fg:#fff; --mtpl-surface:#221207; }
        html #malik-root .mtpl-v2 > img { filter:brightness(.72) saturate(1.15) contrast(1.08) !important; }
        html #malik-root .mtpl-v2 .mtpl-media-shade { background:linear-gradient(0deg,rgba(20,7,2,.88),rgba(20,7,2,.02) 76%) !important; }
        html #malik-root .mtpl-v2 .mtpl-preview-copy { max-width:78% !important; }
        html #malik-root .mtpl-v3 { --mtpl-fg:#080808; --mtpl-surface:#fff; }
        html #malik-root .mtpl-v3 > img { filter:brightness(1.04) saturate(.35) contrast(.94) !important; }
        html #malik-root .mtpl-v3 .mtpl-media-shade { background:linear-gradient(135deg,rgba(255,255,255,.94),rgba(255,255,255,.06) 68%) !important; }
        html #malik-root .mtpl-v3 .mtpl-preview-copy strong { font-weight:620 !important; }
        html #malik-root .mtpl-v4 { --mtpl-fg:#f5f7ff; --mtpl-surface:#050816; }
        html #malik-root .mtpl-v4 > img { filter:brightness(.52) saturate(1.25) hue-rotate(8deg) !important; }
        html #malik-root .mtpl-v4 .mtpl-media-shade { background:radial-gradient(circle at 82% 18%,rgba(96,108,255,.18),transparent 35%),linear-gradient(115deg,rgba(3,5,18,.92),rgba(3,5,18,.18) 76%) !important; }
        html #malik-root .mtpl-v5 { --mtpl-fg:#fffdf9; --mtpl-surface:#18120c; }
        html #malik-root .mtpl-v5 > img { filter:brightness(.62) saturate(.88) contrast(1.12) sepia(.08) !important; }
        html #malik-root .mtpl-v5 .mtpl-media-shade { background:linear-gradient(0deg,rgba(18,12,8,.92),rgba(18,12,8,.04) 73%) !important; }
        html #malik-root .mtpl-v6 { --mtpl-fg:#f7fffb; --mtpl-surface:#03100d; }
        html #malik-root .mtpl-v6 > img { filter:brightness(.54) saturate(.86) hue-rotate(18deg) !important; }
        html #malik-root .mtpl-v6 .mtpl-media-shade { background:linear-gradient(115deg,rgba(2,15,11,.92),rgba(2,15,11,.06) 72%) !important; }
        html #malik-root .mtpl-v7 { --mtpl-fg:#161616; --mtpl-surface:#f4f0e8; }
        html #malik-root .mtpl-v7 > img { filter:brightness(1.08) saturate(.46) contrast(.92) !important; }
        html #malik-root .mtpl-v7 .mtpl-media-shade { background:linear-gradient(90deg,rgba(246,243,236,.9),rgba(246,243,236,.05) 69%) !important; }
        html #malik-root .mtpl-v7 .mtpl-preview-copy strong { font-family:Georgia,"Times New Roman",serif !important; font-weight:500 !important; letter-spacing:-.035em !important; }
        html #malik-root .mtpl-v8 { --mtpl-fg:#fff; --mtpl-surface:#080808; }
        html #malik-root .mtpl-v8 > img { filter:grayscale(1) brightness(.52) contrast(1.32) !important; }
        html #malik-root .mtpl-v8 .mtpl-media-shade { background:linear-gradient(100deg,rgba(0,0,0,.9),rgba(0,0,0,.04) 80%) !important; }
        html #malik-root .mtpl-v8 .mtpl-preview-copy strong { text-transform:uppercase !important; font-weight:850 !important; }
        html #malik-root .mtpl-v9 { --mtpl-fg:#fff; --mtpl-surface:#0b0710; }
        html #malik-root .mtpl-v9 > img { filter:brightness(.58) saturate(1.35) contrast(1.12) !important; }
        html #malik-root .mtpl-v9 .mtpl-media-shade { background:radial-gradient(circle at 70% 20%,rgba(214,97,255,.18),transparent 32%),linear-gradient(120deg,rgba(12,5,16,.94),rgba(12,5,16,.08) 78%) !important; }

        @media (max-width:1280px) { html #malik-root .mtpl-grid { grid-template-columns:repeat(3,minmax(0,1fr)) !important; } html #malik-root .mtpl-card-media { height:210px !important; } }
        @media (max-width:900px) { html #malik-root .mtpl-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; } html #malik-root .mtpl-card-media { height:220px !important; } }
        @media (max-width:620px) { html #malik-root .mtpl-grid { grid-template-columns:1fr !important; gap:12px !important; } html #malik-root .mtpl-card-media { height:228px !important; } html #malik-root .mtpl-card-copy { min-height:116px !important; } html #malik-root .mtpl-preview-copy strong { font-size:24px !important; } }
        @media (max-width:820px), (hover:none) and (pointer:coarse) {
          html #malik-root .mtpl-search > input,
          html #malik-root .mtpl-search > input:is(:hover,:focus,:focus-visible,:active) { appearance:none !important; -webkit-appearance:none !important; border:0 !important; outline:0 !important; border-radius:0 !important; background:transparent !important; box-shadow:none !important; -webkit-box-shadow:none !important; }
        }
      `}</style>
    </main>
  )
}

export default TemplateGalleryPanel
