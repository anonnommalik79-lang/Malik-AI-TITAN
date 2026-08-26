"use client"

import { useMemo, useState } from "react"
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react"
import { prefillPrompt } from "@/lib/malik-context"
import {
  MALIK_PLUGINS,
  PLUGIN_CATEGORIES,
  type MalikPlugin,
  type PluginCategory,
} from "./plugin-registry"
import {
  officialPluginIconUrl,
  pluginDisplayName,
  PLUGIN_BRAND_COUNT,
} from "./plugin-brand-icons"

const CATEGORY_LABEL: Record<PluginCategory, string> = {
  AI: "AI",
  Dev: "Разработка",
  Work: "Работа",
  Automation: "Автоматизация",
  Research: "Исследования",
  Media: "Медиа",
  Business: "Бизнес",
  Data: "Данные",
}

function BrandIcon({ plugin, large = false }: { plugin: MalikPlugin; large?: boolean }) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const brandName = pluginDisplayName(plugin.id, plugin.name)
  const initials = brandName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const sources = [
    officialPluginIconUrl(plugin.id),
    `https://cdn.simpleicons.org/${plugin.iconSlug}`,
  ].filter(Boolean)

  const src = sources[sourceIndex] || ""

  return (
    <span className={large ? "plugin-logo is-large" : "plugin-logo"} aria-hidden="true">
      <span className="plugin-logo-fallback">{initials}</span>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setSourceIndex((current) => current + 1)}
        />
      ) : null}
    </span>
  )
}

function PluginCard({ plugin, onOpen }: { plugin: MalikPlugin; onOpen: (plugin: MalikPlugin) => void }) {
  const brandName = pluginDisplayName(plugin.id, plugin.name)

  return (
    <button type="button" className="plugin-card" onClick={() => onOpen(plugin)}>
      <BrandIcon plugin={plugin} />
      <span className="plugin-card-copy">
        <span className="plugin-card-name">{brandName}</span>
        <span className="plugin-card-meta">
          {plugin.tier === "free" ? "Бесплатно" : "Free / Freemium"}
        </span>
      </span>
    </button>
  )
}

function PluginDetail({ plugin, onClose, onRun }: {
  plugin: MalikPlugin
  onClose: () => void
  onRun: (plugin: MalikPlugin) => void
}) {
  const openSource = plugin.access === "open"
  const brandName = pluginDisplayName(plugin.id, plugin.name)
  const description = plugin.description.replace(plugin.name, brandName)

  return (
    <aside className="plugin-detail" aria-label={`${brandName} — возможности`}>
      <div className="plugin-detail-head">
        <button type="button" className="plugin-detail-back" onClick={onClose} aria-label="Назад к плагинам">
          <ChevronLeft />
        </button>
        <span className="plugin-detail-eyebrow">MALIK AI · PLUGIN</span>
        <button type="button" className="plugin-detail-close" onClick={onClose} aria-label="Закрыть">
          <X />
        </button>
      </div>

      <div className="plugin-detail-hero">
        <BrandIcon plugin={plugin} large />
        <div className="plugin-detail-title-wrap">
          <p>{CATEGORY_LABEL[plugin.category]}</p>
          <h2>{brandName}</h2>
        </div>
      </div>

      <p className="plugin-detail-description">{description}</p>

      <div className="plugin-detail-badges">
        <span className={openSource ? "is-open" : "is-connect"}>
          {openSource ? "Открытые данные" : "OAuth / API при необходимости"}
        </span>
        <span>{plugin.tier === "free" ? "Бесплатный доступ" : "Есть бесплатный режим"}</span>
      </div>

      <section className="plugin-detail-section">
        <h3>Что умеет внутри Malik AI</h3>
        <ul>
          {plugin.capabilities.map((capability) => (
            <li key={capability}>
              <span><Check /></span>
              {capability}
            </li>
          ))}
        </ul>
      </section>

      <section className="plugin-detail-section plugin-detail-note">
        <div><ShieldCheck /></div>
        <p>
          {openSource
            ? "Запускается прямо внутри Malik AI и использует доступный открытый контекст. Пользователя не перекидывает на чужой интерфейс."
            : "Работает как внутренний workflow Malik AI. Для приватных данных или действий в аккаунте подключается официальный OAuth/API сервиса — без имитации доступа."}
        </p>
      </section>

      <button type="button" className="plugin-run" onClick={() => onRun(plugin)}>
        <Sparkles />
        Использовать в Malik AI
        <ArrowRight />
      </button>
    </aside>
  )
}

export function FeatureCenter() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<"All" | PluginCategory>("All")
  const [freeOnly, setFreeOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = selectedId ? MALIK_PLUGINS.find((plugin) => plugin.id === selectedId) || null : null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return MALIK_PLUGINS.filter((plugin) => {
      const displayName = pluginDisplayName(plugin.id, plugin.name)
      if (category !== "All" && plugin.category !== category) return false
      if (freeOnly && plugin.tier !== "free") return false
      if (!q) return true
      return `${displayName} ${plugin.name} ${plugin.category} ${plugin.description}`.toLowerCase().includes(q)
    })
  }, [category, freeOnly, query])

  const featured = useMemo(() => MALIK_PLUGINS.filter((plugin) => plugin.featured), [])

  const runPlugin = (plugin: MalikPlugin) => {
    prefillPrompt(plugin.prompt)
    window.location.assign("/dashboard")
  }

  return (
    <div className="malik-plugin-market">
      <div className="plugin-market-shell">
        <header className="plugin-market-header">
          <div className="plugin-market-title-wrap">
            <p className="plugin-market-kicker">MALIK AI · PLUGINS</p>
            <h1>Плагины</h1>
            <p className="plugin-market-subtitle">
              100 сильных сервисов и AI‑инструментов. Официальные иконки, единый интерфейс, запуск внутри Malik AI.
            </p>
          </div>
          <div className="plugin-market-count" aria-label={`${PLUGIN_BRAND_COUNT} плагинов`}>
            <strong>{PLUGIN_BRAND_COUNT}</strong>
            <span>плагинов</span>
          </div>
        </header>

        <div className="plugin-market-toolbar">
          <label className="plugin-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти плагин..."
              aria-label="Поиск плагинов"
            />
          </label>

          <div className="plugin-filter-row" aria-label="Категории">
            {PLUGIN_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={category === item.id ? "is-active" : undefined}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={freeOnly ? "is-active" : undefined}
              onClick={() => setFreeOnly((value) => !value)}
            >
              Бесплатные
            </button>
          </div>
        </div>

        {!query && category === "All" && !freeOnly ? (
          <section className="plugin-section plugin-section-featured">
            <div className="plugin-section-head">
              <div>
                <span>Рекомендуемые</span>
                <h2>Главные плагины</h2>
              </div>
              <p>Нажми на сервис — откроется его собственная внутренняя карточка возможностей.</p>
            </div>
            <div className="plugin-grid plugin-grid-featured">
              {featured.map((plugin) => (
                <PluginCard key={plugin.id} plugin={plugin} onOpen={(item) => setSelectedId(item.id)} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="plugin-section">
          <div className="plugin-section-head">
            <div>
              <span>{filtered.length} доступно</span>
              <h2>{category === "All" ? "Все плагины" : CATEGORY_LABEL[category]}</h2>
            </div>
            <p>Иконка берётся с официального домена сервиса; Simple Icons используется только как резерв.</p>
          </div>

          {filtered.length ? (
            <div className="plugin-grid">
              {filtered.map((plugin) => (
                <PluginCard key={plugin.id} plugin={plugin} onOpen={(item) => setSelectedId(item.id)} />
              ))}
            </div>
          ) : (
            <div className="plugin-empty">
              <Search />
              <strong>Ничего не найдено</strong>
              <span>Попробуй другое название или категорию.</span>
            </div>
          )}
        </section>
      </div>

      {selected ? <PluginDetail plugin={selected} onClose={() => setSelectedId(null)} onRun={runPlugin} /> : null}

      <style jsx global>{`
        body:has(.malik-plugin-market) .titan-rail {
          display: none !important;
        }

        body:has(.malik-plugin-market) .malik-dashboard-shell main {
          flex: 1 1 100% !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: none !important;
        }

        .malik-plugin-market {
          position: relative;
          display: block;
          flex: 1 1 0%;
          width: 100%;
          max-width: none;
          min-width: 0;
          min-height: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          background: #0f0f10;
          color: #f5f5f5;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,.13) transparent;
        }

        .plugin-market-shell {
          width: 100%;
          max-width: none;
          margin: 0;
          padding: 34px 34px 84px;
        }

        .plugin-market-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 28px;
          padding-bottom: 24px;
          border-bottom: 1px solid rgba(255,255,255,.065);
        }

        .plugin-market-title-wrap { min-width: 0; }

        .plugin-market-kicker {
          margin: 0 0 8px;
          color: #74747b;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .13em;
        }

        .plugin-market-header h1 {
          margin: 0;
          color: #f7f7f8;
          font-size: clamp(30px, 3vw, 42px);
          font-weight: 620;
          letter-spacing: -.042em;
          line-height: 1.04;
        }

        .plugin-market-subtitle {
          max-width: 760px;
          margin: 10px 0 0;
          color: #85858d;
          font-size: 13px;
          line-height: 1.6;
        }

        .plugin-market-count {
          display: flex;
          min-width: 92px;
          height: 54px;
          flex: 0 0 auto;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,.075);
          border-radius: 15px;
          background: #151516;
        }

        .plugin-market-count strong {
          color: #f1f1f2;
          font-size: 16px;
          font-weight: 650;
          line-height: 1;
        }

        .plugin-market-count span {
          margin-top: 4px;
          color: #707078;
          font-size: 9px;
          line-height: 1;
        }

        .plugin-market-toolbar {
          padding: 20px 0 4px;
        }

        .plugin-search {
          display: flex;
          width: min(100%, 500px);
          height: 44px;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 12px;
          background: #151516;
          padding: 0 13px;
          color: #74747c;
          transition: border-color 140ms ease, background-color 140ms ease;
        }

        .plugin-search:focus-within {
          border-color: rgba(255,255,255,.17);
          background: #181819;
        }

        .plugin-search svg {
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
        }

        .plugin-search input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: #efeff1;
          font: inherit;
          font-size: 13px;
        }

        .plugin-search input::placeholder { color: #66666e; }

        .plugin-filter-row {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 12px;
          overflow-x: auto;
          padding-bottom: 4px;
          scrollbar-width: none;
        }

        .plugin-filter-row::-webkit-scrollbar { display: none; }

        .plugin-filter-row button {
          height: 32px;
          flex: 0 0 auto;
          border: 1px solid transparent;
          border-radius: 9px;
          padding: 0 10px;
          color: #8b8b92;
          font-size: 11px;
          font-weight: 520;
          transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
        }

        .plugin-filter-row button:hover {
          background: rgba(255,255,255,.04);
          color: #d7d7da;
        }

        .plugin-filter-row button.is-active {
          border-color: rgba(255,255,255,.085);
          background: #1b1b1d;
          color: #f5f5f6;
        }

        .plugin-section { margin-top: 28px; }
        .plugin-section-featured { margin-top: 26px; }

        .plugin-section-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 22px;
          margin-bottom: 13px;
        }

        .plugin-section-head span {
          display: block;
          margin-bottom: 4px;
          color: #68686f;
          font-size: 9px;
          font-weight: 650;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .plugin-section-head h2 {
          margin: 0;
          color: #e9e9eb;
          font-size: 16px;
          font-weight: 600;
          letter-spacing: -.02em;
        }

        .plugin-section-head p {
          max-width: 510px;
          margin: 0;
          color: #66666d;
          font-size: 10.5px;
          line-height: 1.5;
          text-align: right;
        }

        .plugin-grid {
          display: grid;
          width: 100%;
          grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
          gap: 9px;
        }

        .plugin-grid-featured {
          grid-template-columns: repeat(auto-fill, minmax(154px, 1fr));
        }

        .plugin-card {
          position: relative;
          display: flex;
          min-width: 0;
          min-height: 132px;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.065);
          border-radius: 16px;
          background: #141415;
          padding: 13px;
          text-align: left;
          transition: transform 140ms ease, border-color 140ms ease, background-color 140ms ease;
        }

        .plugin-card:hover {
          border-color: rgba(255,255,255,.14);
          background: #181819;
          transform: translateY(-2px);
        }

        .plugin-card:focus-visible {
          outline: 2px solid rgba(255,255,255,.3);
          outline-offset: 2px;
        }

        .plugin-logo {
          position: relative;
          display: grid;
          width: 48px;
          height: 48px;
          flex: 0 0 48px;
          place-items: center;
          overflow: hidden;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 13px;
          background: #f7f7f8;
          box-shadow: 0 7px 18px rgba(0,0,0,.2);
        }

        .plugin-logo.is-large {
          width: 74px;
          height: 74px;
          flex-basis: 74px;
          border-radius: 20px;
        }

        .plugin-logo img {
          position: relative;
          z-index: 2;
          display: block;
          width: 30px;
          height: 30px;
          object-fit: contain;
        }

        .plugin-logo.is-large img {
          width: 46px;
          height: 46px;
        }

        .plugin-logo-fallback {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: #111114;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: -.04em;
        }

        .plugin-logo.is-large .plugin-logo-fallback { font-size: 18px; }

        .plugin-card-copy { display: block; width: 100%; min-width: 0; }

        .plugin-card-name {
          display: block;
          width: 100%;
          overflow: hidden;
          color: #eeeeef;
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .plugin-card-meta {
          display: block;
          margin-top: 4px;
          color: #6c6c73;
          font-size: 9.5px;
          line-height: 1.25;
        }

        .plugin-empty {
          display: flex;
          min-height: 220px;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          border: 1px dashed rgba(255,255,255,.08);
          border-radius: 18px;
          color: #67676e;
        }

        .plugin-empty svg { width: 22px; height: 22px; margin-bottom: 12px; }
        .plugin-empty strong { color: #cfcfd3; font-size: 14px; font-weight: 590; }
        .plugin-empty span { margin-top: 5px; font-size: 11px; }

        .plugin-detail {
          position: fixed;
          z-index: 70;
          top: 56px;
          right: 0;
          bottom: 0;
          width: min(440px, 92vw);
          overflow-y: auto;
          border-left: 1px solid rgba(255,255,255,.09);
          background: #111112;
          padding: 20px 24px 28px;
          box-shadow: -26px 0 70px rgba(0,0,0,.34);
          animation: plugin-detail-in 180ms cubic-bezier(.22,1,.36,1) both;
        }

        .plugin-detail-head {
          display: grid;
          grid-template-columns: 34px 1fr 34px;
          align-items: center;
          gap: 8px;
          margin-bottom: 28px;
        }

        .plugin-detail-eyebrow {
          color: #696970;
          font-size: 9px;
          font-weight: 650;
          letter-spacing: .1em;
          text-align: center;
        }

        .plugin-detail-head button {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border-radius: 9px;
          color: #898990;
          transition: background-color 120ms ease, color 120ms ease;
        }

        .plugin-detail-head button:hover { background: rgba(255,255,255,.055); color: #ededee; }
        .plugin-detail-head svg { width: 17px; height: 17px; }
        .plugin-detail-back { visibility: hidden; }

        .plugin-detail-hero {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .plugin-detail-title-wrap p {
          margin: 0 0 5px;
          color: #73737a;
          font-size: 10px;
          font-weight: 650;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .plugin-detail-title-wrap h2 {
          margin: 0;
          color: #f5f5f6;
          font-size: 25px;
          font-weight: 620;
          letter-spacing: -.035em;
        }

        .plugin-detail-description {
          margin: 22px 0 0;
          color: #9999a1;
          font-size: 13px;
          line-height: 1.7;
        }

        .plugin-detail-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 18px;
        }

        .plugin-detail-badges span {
          display: inline-flex;
          min-height: 27px;
          align-items: center;
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 999px;
          background: rgba(255,255,255,.025);
          padding: 0 9px;
          color: #7f7f87;
          font-size: 10px;
        }

        .plugin-detail-badges span.is-open { color: #9fb9a5; }
        .plugin-detail-badges span.is-connect { color: #b6a783; }

        .plugin-detail-section {
          margin-top: 28px;
          padding-top: 22px;
          border-top: 1px solid rgba(255,255,255,.065);
        }

        .plugin-detail-section h3 {
          margin: 0 0 13px;
          color: #d9d9dc;
          font-size: 12px;
          font-weight: 600;
        }

        .plugin-detail-section ul { display: grid; gap: 11px; margin: 0; padding: 0; list-style: none; }

        .plugin-detail-section li {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          color: #97979e;
          font-size: 12px;
          line-height: 1.55;
        }

        .plugin-detail-section li > span {
          display: grid;
          width: 18px;
          height: 18px;
          flex: 0 0 18px;
          place-items: center;
          border-radius: 999px;
          background: rgba(255,255,255,.055);
          color: #c9c9cd;
        }

        .plugin-detail-section li svg { width: 11px; height: 11px; }

        .plugin-detail-note {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .plugin-detail-note > div {
          display: grid;
          width: 30px;
          height: 30px;
          flex: 0 0 30px;
          place-items: center;
          border-radius: 9px;
          background: rgba(255,255,255,.045);
          color: #9b9ba2;
        }

        .plugin-detail-note svg { width: 15px; height: 15px; }
        .plugin-detail-note p { margin: 0; color: #787880; font-size: 10.5px; line-height: 1.6; }

        .plugin-run {
          display: flex;
          width: 100%;
          height: 48px;
          align-items: center;
          justify-content: center;
          gap: 9px;
          margin-top: 28px;
          border-radius: 13px;
          background: #f4f4f5;
          color: #111113;
          font-size: 12px;
          font-weight: 650;
          transition: background-color 130ms ease, transform 130ms ease;
        }

        .plugin-run:hover { background: #fff; transform: translateY(-1px); }
        .plugin-run svg { width: 16px; height: 16px; }
        .plugin-run svg:last-child { margin-left: auto; margin-right: 13px; }
        .plugin-run svg:first-child { margin-left: 13px; }

        @keyframes plugin-detail-in {
          from { opacity: 0; transform: translateX(18px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @media (max-width: 920px) {
          .plugin-market-shell { padding: 28px 20px 70px; }
          .plugin-section-head p { display: none; }
        }

        @media (max-width: 680px) {
          .plugin-market-shell { padding: 20px 13px 60px; }
          .plugin-market-header { align-items: flex-start; gap: 14px; }
          .plugin-market-count { min-width: 72px; height: 48px; border-radius: 13px; }
          .plugin-market-subtitle { font-size: 12px; }
          .plugin-grid, .plugin-grid-featured { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 7px; }
          .plugin-card { min-height: 122px; padding: 11px; border-radius: 14px; }
          .plugin-logo { width: 44px; height: 44px; flex-basis: 44px; border-radius: 12px; }
          .plugin-logo img { width: 28px; height: 28px; }
          .plugin-card-name { font-size: 12px; }
          .plugin-detail { top: 0; width: 100vw; max-width: none; padding: max(18px, env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom)); }
          .plugin-detail-back { visibility: visible; }
          .plugin-detail-close { display: none !important; }
        }

        @media (max-width: 390px) {
          .plugin-market-header h1 { font-size: 29px; }
          .plugin-market-count { min-width: 66px; }
          .plugin-card { min-height: 118px; }
        }
      `}</style>
    </div>
  )
}

export default FeatureCenter
