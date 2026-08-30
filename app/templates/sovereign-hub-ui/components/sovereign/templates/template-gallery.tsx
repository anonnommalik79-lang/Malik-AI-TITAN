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
      <span className="mtpl-card-media">
        <img src={template.preview} alt={`Превью шаблона «${template.title}»`} loading="lazy" decoding="async" draggable={false} />
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
      const matchesQuery = !normalized || `${template.title} ${template.category} ${template.description}`.toLocaleLowerCase("ru").includes(normalized)
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
            <h1>Начните с готового шаблона</h1>
            <p>100 рабочих сценариев для диалогов, сайтов, приложений, визуалов, видео, кода и бизнеса.</p>
          </div>
          <div className="mtpl-total" aria-label="Количество шаблонов"><strong>100</strong><span>шаблонов</span></div>
        </header>
        <section className="mtpl-controls" aria-label="Поиск и фильтры шаблонов">
          <label className="mtpl-search">
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Найти шаблон" aria-label="Найти шаблон" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск"><X aria-hidden="true" /></button> : null}
          </label>
          <div className="mtpl-filters" role="group" aria-label="Категории">
            {(["Все", ...MALIK_TEMPLATE_CATEGORIES] as TemplateFilter[]).map((category) => (
              <button key={category} type="button" className={filter === category ? "is-active" : undefined} aria-pressed={filter === category} onClick={() => setFilter(category)}>{category}</button>
            ))}
          </div>
        </section>
        <div className="mtpl-results-head"><span>{filter === "Все" ? "Все шаблоны" : filter}</span><small>{templates.length} {templates.length === 1 ? "результат" : "результатов"}</small></div>
        {templates.length ? (
          <section className="mtpl-grid" aria-label="Шаблоны Malik AI">{templates.map((template) => <TemplatePreviewCard key={template.id} template={template} onLaunchTemplate={onLaunchTemplate} />)}</section>
        ) : (
          <section className="mtpl-empty"><Layers3 aria-hidden="true" /><h2>Шаблоны не найдены</h2><p>Измените запрос или сбросьте выбранную категорию.</p><button type="button" onClick={reset}>Показать все шаблоны</button></section>
        )}
      </div>
      <style jsx global>{`
        /* Absolute cross-device authority: the LABEL is the only search surface.
           The native input is text/caret only — never a second shelf. */
        html #malik-root .mtpl-search {
          position: relative !important;
          overflow: hidden !important;
          isolation: isolate !important;
          box-shadow: none !important;
          -webkit-box-shadow: none !important;
        }
        html #malik-root .mtpl-search > input,
        html #malik-root .mtpl-search > input[type="search"],
        html #malik-root .mtpl-search > input[type="text"],
        html #malik-root .mtpl-search > input:is(:hover,:focus,:focus-visible,:active,:autofill) {
          appearance: none !important;
          -webkit-appearance: none !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding-block: 0 !important;
          border: 0 !important;
          outline: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
          -webkit-box-shadow: none !important;
          filter: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        html #malik-root .mtpl-search > input::-webkit-search-decoration,
        html #malik-root .mtpl-search > input::-webkit-search-cancel-button,
        html #malik-root .mtpl-search > input::-webkit-search-results-button,
        html #malik-root .mtpl-search > input::-webkit-search-results-decoration {
          display: none !important;
          -webkit-appearance: none !important;
        }
        html #malik-root .mtpl-search::before,
        html #malik-root .mtpl-search::after,
        html #malik-root .mtpl-search > input::before,
        html #malik-root .mtpl-search > input::after {
          content: none !important;
          display: none !important;
          border: 0 !important;
          background: none !important;
          box-shadow: none !important;
        }
        @media (max-width: 820px), (hover: none) and (pointer: coarse) {
          html #malik-root .mtpl-search > input,
          html #malik-root .mtpl-search > input:is(:hover,:focus,:focus-visible,:active) {
            appearance: none !important;
            -webkit-appearance: none !important;
            border: 0 !important;
            outline: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            -webkit-box-shadow: none !important;
          }
        }
      `}</style>
    </main>
  )
}

export default TemplateGalleryPanel
