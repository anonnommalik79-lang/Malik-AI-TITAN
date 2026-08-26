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

function PluginLogo({ plugin, large = false }: { plugin: MalikPlugin; large?: boolean }) {
  const initials = plugin.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <span className={large ? "plugin-logo is-large" : "plugin-logo"} aria-hidden="true">
      <span className="plugin-logo-fallback">{initials}</span>
      <img
        src={`https://cdn.simpleicons.org/${plugin.iconSlug}`}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(event) => {
          event.currentTarget.style.display = "none"
        }}
      />
    </span>
  )
}

function PluginCard({ plugin, onOpen }: { plugin: MalikPlugin; onOpen: (plugin: MalikPlugin) => void }) {
  return (
    <button type="button" className="plugin-card" onClick={() => onOpen(plugin)}>
      <PluginLogo plugin={plugin} />
      <span className="plugin-card-name">{plugin.name}</span>
      <span className="plugin-card-meta">
        {plugin.tier === "free" ? "Бесплатно" : "Есть free‑режим"}
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

  return (
    <aside className="plugin-detail" aria-label={`${plugin.name} — возможности`}>
      <div className="plugin-detail-head">
        <button type="button" className="plugin-detail-back" onClick={onClose} aria-label="Назад к плагинам">
          <ChevronLeft />
        </button>
        <button type="button" className="plugin-detail-close" onClick={onClose} aria-label="Закрыть">
          <X />
        </button>
      </div>

      <div className="plugin-detail-hero">
        <PluginLogo plugin={plugin} large />
        <div className="plugin-detail-title-wrap">
          <p>{CATEGORY_LABEL[plugin.category]}</p>
          <h2>{plugin.name}</h2>
        </div>
      </div>

      <p className="plugin-detail-description">{plugin.description}</p>

      <div className="plugin-detail-badges">
        <span className={openSource ? "is-open" : "is-connect"}>
          {openSource ? "Открытые источники" : "Аккаунт / API при необходимости"}
        </span>
        <span>{plugin.tier === "free" ? "Бесплатный доступ" : "Free / Freemium"}</span>
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
        <div>
          <ShieldCheck />
        </div>
        <p>
          {openSource
            ? "Плагин запускается внутри Malik AI и использует открытый веб-контекст. Он не отправляет пользователя на внешний сайт."
            : "Плагин запускается внутри Malik AI. Открытые данные и переданный в чат контекст работают сразу; приватные данные и действия в аккаунте требуют официального OAuth/API, когда он подключён."}
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
      if (category !== "All" && plugin.category !== category) return false
      if (freeOnly && plugin.tier !== "free") return false
      if (!q) return true
      return `${plugin.name} ${plugin.category} ${plugin.description}`.toLowerCase().includes(q)
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
          <div>
            <p className="plugin-market-kicker">MALIK AI · PLUGINS</p>
            <h1>Плагины</h1>
            <p className="plugin-market-subtitle">
              100 сильных сервисов и AI‑инструментов в одном чистом рабочем пространстве.
            </p>
          </div>
          <div className="plugin-market-count">100</div>
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
          <section className="plugin-section">
            <div className="plugin-section-head">
              <div>
                <span>Рекомендуемые</span>
                <h2>Главные плагины</h2>
              </div>
              <p>Работают как внутренние AI‑workflow, без перехода на чужие страницы.</p>
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
            <p>Нажми на любой плагин — откроется его собственная внутренняя карточка возможностей.</p>
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

        .malik-plugin-market {
          position: relative;
          min-height: 100%;
          height: 100%;
          overflow-y: auto;
          background: #0f0f10;
          color: #f5f5f5;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,.13) transparent;
        }

        .plugin-market-shell {
          width: min(100%, 1440px);
          margin: 0 auto;
          padding: 42px 44px 80px;
        }

        .plugin-market-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 28px;
          padding-bottom: 28px;
          border-bottom: 1px solid rgba(255,255,255,.065);
        }

        .plugin-market-kicker {
          margin: 0 0 9px;
          color: #7c7c84;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .13em;
        }

        .plugin-market-header h1 {
          margin: 0;
          color: #f7f7f8;
          font-size: clamp(32px, 4vw, 48px);
          font-weight: 590;
          letter-spacing: -.04em;
          line-height: 1;
        }

        .plugin-market-subtitle {
          max-width: 700px;
          margin: 12px 0 0;
          color: #8b8b93;
          font-size: 14px;
          line-height: 1.65;
        }

        .plugin-market-count {
          display: grid;
          width: 58px;
          height: 58px;
          flex: 0 0 58px;
          place-items: center;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 18px;
          background: #151516;
          color: #ececef;
          font-size: 16px;
          font-weight: 650;
        }

        .plugin-market-toolbar {
          padding: 24px 0 8px;
        }

        .plugin-search {
          display: flex;
          width: min(100%, 520px);
          height: 46px;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 13px;
          background: #151516;
          padding: 0 14px;
          color: #74747c;
          transition: border-color 150ms ease, background-color 150ms ease;
        }

        .plugin-search:focus-within {
          border-color: rgba(255,255,255,.16);
          background: #181819;
        }

        .plugin-search svg {
          width: 17px;
          height: 17px;
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

        .plugin-search input::placeholder { color: #6f6f76; }

        .plugin-filter-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 14px;
          overflow-x: auto;
          padding-bottom: 4px;
          scrollbar-width: none;
        }

        .plugin-filter-row::-webkit-scrollbar { display: none; }

        .plugin-filter-row button {
          height: 34px;
          flex: 0 0 auto;
          border: 1px solid transparent;
          border-radius: 10px;
          padding: 0 11px;
          color: #8e8e96;
          font-size: 12px;
          font-weight: 520;
          transition: background-color 130ms ease, color 130ms ease, border-color 130ms ease;
        }

        .plugin-filter-row button:hover {
          background: rgba(255,255,255,.045);
          color: #d8d8dc;
        }

        .plugin-filter-row button.is-active {
          border-color: rgba(255,255,255,.08);
          background: #1a1a1c;
          color: #f5f5f6;
        }

        .plugin-section { margin-top: 30px; }

        .plugin-section-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 14px;
        }

        .plugin-section-head span {
          display: block;
          margin-bottom: 5px;
          color: #696970;
          font-size: 10px;
          font-weight: 650;
          letter-spacing: .05em;
          text-transform: uppercase;
        }

        .plugin-section-head h2 {
          margin: 0;
          color: #e9e9eb;
          font-size: 17px;
          font-weight: 590;
          letter-spacing: -.02em;
        }

        .plugin-section-head p {
          max-width: 470px;
          margin: 0;
          color: #68686f;
          font-size: 11px;
          line-height: 1.55;
          text-align: right;
        }

        .plugin-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
        }

        .plugin-grid-featured { grid-template-columns: repeat(6, minmax(0, 1fr)); }

        .plugin-card {
          position: relative;
          display: flex;
          min-width: 0;
          min-height: 142px;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-end;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.065);
          border-radius: 16px;
          background: #141415;
          padding: 14px;
          text-align: left;
          transition: transform 150ms ease, border-color 150ms ease, background-color 150ms ease;
        }

        .plugin-card:hover {
          border-color: rgba(255,255,255,.13);
          background: #181819;
          transform: translateY(-2px);
        }

        .plugin-card:focus-visible {
          outline: 2px solid rgba(255,255,255,.28);
          outline-offset: 2px;
        }

        .plugin-logo {
          position: relative;
          display: grid;
          width: 46px;
          height: 46px;
          place-items: center;
          overflow: hidden;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 13px;
          background: #fff;
          box-shadow: 0 7px 18px rgba(0,0,0,.2);
        }

        .plugin-card .plugin-logo { margin-bottom: auto; }

        .plugin-logo.is-large {
          width: 76px;
          height: 76px;
          border-radius: 21px;
        }

        .plugin-logo img {
          position: relative;
          z-index: 2;
          display: block;
          width: 58%;
          height: 58%;
          object-fit: contain;
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

        .plugin-card-name {
          display: block;
          width: 100%;
          margin-top: 17px;
          overflow: hidden;
          color: #ececee;
          font-size: 13px;
          font-weight: 590;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .plugin-card-meta {
          display: block;
          margin-top: 4px;
          color: #6f6f76;
          font-size: 10px;
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
          padding: 22px 24px 28px;
          box-shadow: -26px 0 70px rgba(0,0,0,.32);
          animation: plugin-detail-in 180ms cubic-bezier(.22,1,.36,1) both;
        }

        .plugin-detail-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
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

        @media (max-width: 1180px) {
          .plugin-grid, .plugin-grid-featured { grid-template-columns: repeat(5, minmax(0,1fr)); }
        }

        @media (max-width: 920px) {
          .plugin-market-shell { padding: 30px 22px 70px; }
          .plugin-grid, .plugin-grid-featured { grid-template-columns: repeat(4, minmax(0,1fr)); }
          .plugin-section-head p { display: none; }
        }

        @media (max-width: 680px) {
          .plugin-market-shell { padding: 24px 14px 60px; }
          .plugin-market-header { align-items: flex-start; }
          .plugin-market-count { width: 48px; height: 48px; flex-basis: 48px; border-radius: 14px; }
          .plugin-grid, .plugin-grid-featured { grid-template-columns: repeat(3, minmax(0,1fr)); gap: 7px; }
          .plugin-card { min-height: 128px; padding: 12px; }
          .plugin-card-name { font-size: 12px; }
          .plugin-detail { top: 0; width: 100vw; max-width: none; padding: max(18px, env(safe-area-inset-top)) 18px 28px; }
          .plugin-detail-back { visibility: visible; }
          .plugin-detail-close { display: none !important; }
        }

        @media (max-width: 420px) {
          .plugin-grid, .plugin-grid-featured { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .plugin-market-subtitle { font-size: 12px; }
        }
      `}</style>
    </div>
  )
}

export default FeatureCenter
