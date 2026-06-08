"use client"

import { useMemo, useState } from "react"
import {
  BarChart3,
  Bookmark,
  BookOpen,
  Clock3,
  Code2,
  Database,
  FileText,
  Folder,
  History,
  MessageSquare,
  MoreVertical,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react"

type GlobalSearchPanelProps = {
  onViewChange: (view: string) => void
  onOpenCodex: () => void
}

const topbarItems = [
  ["◎", "Malik AI Agents", "final-intelligence"],
  ["✺", "High-Speed queue", "ai-generator"],
  ["⌘", "Malik Ask", "home"],
  ["⌕", "Craft & Search", "search"],
  ["↯", "API 2.0", "features"],
  ["✧", "Crew: all flow", "command-center"],
  ["⟡", "Deploy", "dashboard-generation"],
  [">_", "Malik Codex", "codex"],
  ["✣", "Creator Mode: ON", "home"],
] as const

const resultItems = [
  {
    type: "Проект",
    title: "Запуск AI-платформы Sovereign",
    text: "Стратегия выхода на рынок, дорожная карта и ключевые инициативы для запуска платформы Sovereign AI OS в Q3.",
    icon: Folder,
    route: "projects",
    tone: "violet",
    tags: ["AI Strategy", "Roadmap", "Q3 2024"],
    meta: "Обновлено 2 дня назад",
  },
  {
    type: "Чат",
    title: "Обсуждение архитектуры ядра",
    text: "Обсуждали модульную архитектуру Sovereign Core, безопасность и масштабируемость системы.",
    icon: MessageSquare,
    route: "chats",
    tone: "blue",
    tags: ["Архитектура", "Безопасность", "Sovereign Core"],
    meta: "15 мая 2024",
  },
  {
    type: "Файл",
    title: "Отчет: тестирование Unbreakable AI",
    text: "Результаты нагрузочного тестирования и аудита безопасности модуля Unbreakable AI.",
    icon: FileText,
    route: "document-generation",
    tone: "amber",
    tags: ["Отчеты", "Тестирование", "PDF"],
    meta: "12 мая 2024 • 2.4 MB",
  },
  {
    type: "Инструмент",
    title: "Code Generator",
    text: "Генерация кода по описанию, поддержка 300+ языков, Git workflow и live preview.",
    icon: Sparkles,
    route: "code-generation",
    tone: "purple",
    tags: ["Development", "Code", "Automation"],
    meta: "Активен",
  },
  {
    type: "Знание",
    title: "Документация: API 2.0",
    text: "Полное руководство по интеграции с API 2.0, примеры запросов, ответы и схемы ошибок.",
    icon: BookOpen,
    route: "features",
    tone: "violet",
    tags: ["API", "Документация", "Интеграция"],
    meta: "10 мая 2024",
  },
]

const quickLinks = [
  { title: "Мои проекты", value: "24 проекта", icon: Folder, route: "projects", tone: "violet" },
  { title: "Команда", value: "12 участников", icon: Users, route: "settings", tone: "cyan" },
  { title: "Документы", value: "156 файлов", icon: FileText, route: "document-generation", tone: "emerald" },
  { title: "Шаблоны", value: "128 шаблонов", icon: Database, route: "templates", tone: "amber" },
  { title: "AI инструменты", value: "30 модулей", icon: Sparkles, route: "features", tone: "purple" },
  { title: "Настройки", value: "Профиль и команда", icon: Settings, route: "settings", tone: "slate" },
]

const recentQueries = [
  ["Sovereign Core архитектура", "2 мин назад"],
  ["отчет по безопасности май", "15 мин назад"],
  ["API 2.0 документация", "32 мин назад"],
  ["code generator примеры", "1 ч назад"],
  ["статистика проектов", "2 ч назад"],
]

const filters = ["Все", "Проекты", "Файлы", "Чаты", "Инструменты", "История"]

function routeToView(route: string) {
  if (route === "codex" || route === "/codex") return "codex"
  return route.replace(/^\//, "") || "home"
}

export function GlobalSearchPanel({ onViewChange, onOpenCodex }: GlobalSearchPanelProps) {
  const [query, setQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState("Все")
  const [resultLimit, setResultLimit] = useState(3)
  const [sortMode, setSortMode] = useState<"relevance" | "recent">("relevance")
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [analyticsRange, setAnalyticsRange] = useState<"7 дней" | "30 дней">("7 дней")

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    return resultItems.filter((item) => {
      const matchesFilter = activeFilter === "Все" || item.type.toLowerCase().includes(activeFilter.slice(0, -1).toLowerCase()) || activeFilter === "Инструменты" && item.type === "Инструмент"
      const matchesQuery = !q || `${item.title} ${item.text} ${item.tags.join(" ")}`.toLowerCase().includes(q)
      return matchesFilter && matchesQuery
    })
  }, [activeFilter, query])

  const visibleResults = useMemo(() => {
    const next = sortMode === "recent" ? [...filteredResults].reverse() : filteredResults
    return next.slice(0, resultLimit)
  }, [filteredResults, resultLimit, sortMode])

  const openRoute = (route: string) => {
    const view = routeToView(route)
    if (view === "codex") {
      onOpenCodex()
      return
    }
    onViewChange(view)
  }

  return (
    <main className="studio-shell search-clone-shell">
      <div className="studio-bg-grid" />
      <div className="studio-topbar" aria-label="Global search shortcuts">
        {topbarItems.map(([icon, label, route]) => (
          <button key={label} type="button" onClick={() => openRoute(route)}>
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>
      <div className="studio-topbar-status" aria-hidden="true">
        <span>♢</span>
        <span>♛ 4,460</span>
        <span>M</span>
      </div>

      <section className="studio-inner search-layout">
        <header className="studio-page-head">
          <div>
            <h1>Глобальный поиск</h1>
            <p>Поиск везде: проекты, файлы, чаты, инструменты и знания.</p>
          </div>
          <button type="button" onClick={() => setQuery(query || "Sovereign Core архитектура")}>
            <Bookmark className="h-4 w-4" />
            Сохранить поиск
          </button>
        </header>

        <section className="search-command-bar">
          <Search className="h-5 w-5" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Искать проекты, файлы, чаты, команды..." />
          <span>⌘</span>
          <span>K</span>
        </section>

        <div className="search-filter-row">
          <div>
            {filters.map((filter) => (
              <button key={filter} type="button" className={filter === activeFilter ? "is-active" : ""} onClick={() => setActiveFilter(filter)}>
                {filter}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setActiveFilter("Все")}><SlidersHorizontal className="h-4 w-4" /> Фильтры</button>
        </div>

        <section className="search-content-grid">
          <article className="studio-card search-results-card">
            <div className="search-card-head">
              <h2>Результаты</h2>
              <span>Найдено {filteredResults.length * 24 + 8} результатов за 0.24 сек.</span>
              <button type="button" onClick={() => setSortMode((value) => value === "relevance" ? "recent" : "relevance")}>Сортировать: {sortMode === "relevance" ? "Релевантность" : "Сначала новые"}⌄</button>
            </div>
            <div className="search-results-list">
              {visibleResults.map((item) => {
                const Icon = item.icon
                return (
                  <button key={item.title} type="button" className={`search-result search-result-${item.tone}`} onClick={() => openRoute(item.route)}>
                    <span className="search-result-icon"><Icon className="h-5 w-5" /></span>
                    <span className="search-result-body">
                      <em>{item.type}</em>
                      <strong>{item.title}</strong>
                      <small>{item.text}</small>
                      <span>{item.tags.map((tag) => <i key={tag}>{tag}</i>)}</span>
                    </span>
                    <span className="search-result-meta">{item.meta}</span>
                    <MoreVertical className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
            <button type="button" className="search-more" onClick={() => setResultLimit((value) => Math.min(filteredResults.length, value + 2))}>Показать ещё результаты⌄</button>
          </article>

          <aside className="search-side">
            <article className="studio-card">
              <h2>Быстрые переходы</h2>
              <div className="quick-link-grid">
                {quickLinks.map((item) => {
                  const Icon = item.icon
                  return (
                    <button key={item.title} type="button" className={`quick-link quick-${item.tone}`} onClick={() => openRoute(item.route)}>
                      <Icon className="h-5 w-5" />
                      <span><strong>{item.title}</strong><em>{item.value}</em></span>
                    </button>
                  )
                })}
              </div>
            </article>

            <article className="studio-card search-history-card">
              <div className="search-card-head compact">
                <h2>Недавние запросы</h2>
                <button type="button" onClick={() => setQuery("")}>Очистить историю</button>
              </div>
              {recentQueries.slice(0, historyExpanded ? recentQueries.length : 3).map(([title, time]) => (
                <button key={title} type="button" onClick={() => setQuery(title)}>
                  <Clock3 className="h-4 w-4" />
                  <span>{title}</span>
                  <em>{time}</em>
                </button>
              ))}
              <button type="button" className="search-link" onClick={() => setHistoryExpanded((value) => !value)}>{historyExpanded ? "Скрыть историю" : "Показать всю историю"}</button>
            </article>

            <div className="search-analytics-grid">
              <article className="studio-card search-metric-card">
                <div>
                  <h2>Индекс знаний</h2>
                  <span>Активен</span>
                </div>
                <strong>98.7%</strong>
                <p>Обновлено сегодня, 04:20</p>
                <BarChart3 className="h-20 w-full" />
                <div><span>Источники<br /><b>1,248</b></span><span>Документы<br /><b>24,560</b></span></div>
              </article>
              <article className="studio-card search-metric-card">
                <div>
                  <h2>Поисковая аналитика</h2>
                  <button type="button" onClick={() => setAnalyticsRange((value) => value === "7 дней" ? "30 дней" : "7 дней")}>{analyticsRange}⌄</button>
                </div>
                <strong>1,248</strong>
                <p>+18% к прошлой неделе</p>
                <History className="h-20 w-full" />
                <div><span>Успешные<br /><b>94.2%</b></span><span>Среднее<br /><b>0.28 сек.</b></span></div>
              </article>
            </div>
          </aside>
        </section>
      </section>
    </main>
  )
}

export default GlobalSearchPanel

