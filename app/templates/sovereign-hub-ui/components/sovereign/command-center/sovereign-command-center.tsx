"use client"

import { useState } from "react"
import {
  Bot,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  FileText,
  GitBranch,
  LayoutDashboard,
  Radio,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react"
import { PRIMARY_WORKING_FEATURES, type SovereignFeature } from "../core/feature-registry"

interface SovereignCommandCenterProps {
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas: () => void
}

type MissionStatus = "Выполняется" | "Ожидание" | "Очередь"
type MissionPriority = "Высокий" | "Средний" | "Низкий"

const topbarItems = [
  ["◎", "Malik AI Jarvis", "final-intelligence"],
  ["✺", "High-Speed queue", "ai-generator"],
  ["⌘", "Malik Ask", "home"],
  ["⌕", "Craft & Search", "search"],
  ["↯", "API 2.0", "features"],
  ["✧", "Queue all flow", "command-center"],
  ["⟡", "Deploy", "dashboard-generation"],
  [">_", "Malik Codex", "codex"],
  ["✣", "Creator Mode: ON", "home"],
] as const

const metrics = [
  { label: "Агенты", value: "18", note: "12 активных + 6 в режиме ожидания", tone: "violet", icon: Bot },
  { label: "Активные миссии", value: "24", note: "↑ 4 с прошлого часа", tone: "purple", icon: Workflow },
  { label: "Успешные выполнения", value: "98.7%", note: "↑ 2.4% с прошлой недели", tone: "cyan", icon: ShieldCheck },
  { label: "Очередь задач", value: "37", note: "↑ 6 в очереди", tone: "slate", icon: Clock3 },
] as const

const agents = [
  { id: "trigger", label: "Trigger", sub: "Webhook In", icon: Zap, x: 7, y: 46, tone: "violet" },
  { id: "data", label: "Data Scout", sub: "Сбор и мониторинг", icon: Bot, x: 32, y: 18, tone: "blue" },
  { id: "insight", label: "Insight Analyst", sub: "Анализ и инсайты", icon: LayoutDashboard, x: 32, y: 46, tone: "purple" },
  { id: "content", label: "Content Weaver", sub: "Генерация контента", icon: Sparkles, x: 32, y: 74, tone: "pink" },
  { id: "validator", label: "Validator Pro", sub: "Проверка и валидация", icon: ShieldCheck, x: 62, y: 46, tone: "cyan" },
  { id: "publisher", label: "Publisher AI", sub: "Публикация", icon: Rocket, x: 86, y: 46, tone: "teal" },
] as const

const missionRows = [
  ["Маркетинговый анализ Q2", "Обзор данных + Анализ + Отчет", "Выполняется", "68%", "Высокий", "anonymous#guest", "18 мин", "/dashboard-generation"],
  ["Исследование рынка ЕС", "Обзор данных + Анализ + Инсайты", "Выполняется", "42%", "Средний", "data.scientist", "43 мин", "/ai-generator"],
  ["Генерация контента блога", "Исследование + Написание + SEO", "Ожидание", "0%", "Средний", "content.manager", "1 ч 12 мин", "/landing-generation"],
  ["Мониторинг упоминаний бренда", "Мониторинг + Анализ + Уведомления", "Выполняется", "83%", "Низкий", "brand.relations", "27 мин", "/search"],
  ["Финансовый отчет недели", "Сбор данных + Обработка + Отчет", "Ожидание", "0%", "Низкий", "finance.analysis", "2 ч 05 мин", "/document-generation"],
] as const satisfies ReadonlyArray<readonly [string, string, MissionStatus, string, MissionPriority, string, string, string]>

const telemetry = [
  ["12:42:16", "Data Scout собрал 1.2K записей", "Источник: Web + Статус: Успешно", "data"],
  ["12:42:09", "Insight Analyst завершил анализ", "Точность: 96.4% + Инсайтов: 8", "insight"],
  ["12:41:58", "Validator Pro проверил результаты", "Ошибок не обнаружено", "validator"],
  ["12:41:45", "Content Weaver сгенерировал контент", "Статус: Готов к проверке", "content"],
  ["12:41:32", "Publisher AI опубликовал материал", "Платформа: Website + Статус: Успешно", "publisher"],
] as const

const schedule = [
  ["13:00", "Ежедневный отчет по продажам", "Ежедневно", "Очередь", "5 задач"],
  ["14:30", "Мониторинг конкурентов", "Каждые 2 часа", "Очередь", "3 задачи"],
  ["15:00", "Бэкап базы данных", "Ежедневно", "Ожидание", "1 задача"],
  ["16:00", "SEO аудит сайта", "Еженедельно по пн", "Ожидание", "2 задачи"],
  ["18:00", "Анализ соц. сетей", "Ежедневно", "Ожидание", "4 задачи"],
] as const

const actionCards = [
  { title: "Создать агента", text: "Создайте нового AI агента с кастомными навыками за пару кликов.", icon: Bot, route: "/ai-generator" },
  { title: "Новая миссия", text: "Запустите новую миссию или выберите шаблон для быстрого старта.", icon: CalendarCheck, route: "/templates" },
  { title: "Автоматизация", text: "Создайте автоматизированные рабочие процессы и правила для вашей операции.", icon: GitBranch, route: "/dashboard-generation" },
  { title: "Runbooks", text: "Готовые сценарии и инструкции для типовых операций и инцидентов.", icon: FileText, route: "/document-generation" },
] as const

const routeToView = (route: string) => route.replace(/^\//, "") || "home"

function statusClass(status: MissionStatus) {
  if (status === "Выполняется") return "cmd-status-run"
  if (status === "Ожидание") return "cmd-status-wait"
  return "cmd-status-queue"
}

function priorityClass(priority: MissionPriority) {
  if (priority === "Высокий") return "cmd-priority-high"
  if (priority === "Средний") return "cmd-priority-mid"
  return "cmd-priority-low"
}

function MiniTrend({ tone }: { tone: string }) {
  const color = tone === "cyan" ? "#22d3ee" : tone === "purple" || tone === "violet" ? "#a855f7" : "#94a3b8"
  return (
    <svg className="cmd-mini-trend" viewBox="0 0 150 52" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 38 L16 36 L27 40 L39 30 L51 34 L62 22 L75 31 L88 17 L100 25 L112 12 L124 20 L137 8 L148 14" />
      <path d="M2 38 L16 36 L27 40 L39 30 L51 34 L62 22 L75 31 L88 17 L100 25 L112 12 L124 20 L137 8 L148 14" stroke={color} />
    </svg>
  )
}

function AgentMap({ runRoute }: { runRoute: (route: string) => void }) {
  return (
    <div className="cmd-agent-map">
      <svg className="cmd-agent-lines" viewBox="0 0 1000 320" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="cmdLine" x1="0%" x2="100%">
            <stop offset="0%" stopColor="rgba(168,85,247,.2)" />
            <stop offset="45%" stopColor="rgba(168,85,247,.85)" />
            <stop offset="100%" stopColor="rgba(34,211,238,.35)" />
          </linearGradient>
          <filter id="cmdGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M150 158 C245 158 230 64 340 64" />
        <path d="M150 158 C245 158 230 158 340 158" />
        <path d="M150 158 C245 158 230 252 340 252" />
        <path d="M470 64 C560 64 560 158 650 158" />
        <path d="M470 158 C560 158 560 158 650 158" />
        <path d="M470 252 C560 252 560 158 650 158" />
        <path d="M780 158 C838 158 858 158 910 158" />
      </svg>
      {agents.map((agent) => {
        const Icon = agent.icon
        return (
          <button key={agent.id} type="button" className={`cmd-agent-node cmd-agent-${agent.tone}`} style={{ left: `${agent.x}%`, top: `${agent.y}%` }} onClick={() => runRoute("/ai-generator")}>
            <Icon className="h-4 w-4" />
            <span>
              <strong>{agent.label}</strong>
              <em>{agent.sub}</em>
            </span>
            <i />
          </button>
        )
      })}
      <div className="cmd-map-legend">
        <span><i className="cmd-dot-green" /> Активен</span>
        <span><i className="cmd-dot-blue" /> Режим ожидания</span>
        <span><i className="cmd-dot-red" /> Ошибка</span>
      </div>
    </div>
  )
}

export function SovereignCommandCenter({ onViewChange, onOpenCodex, onOpenCanvas }: SovereignCommandCenterProps) {
  const connectedFeatures = PRIMARY_WORKING_FEATURES.filter((feature) => feature.status === "connected")
  const [mapZoom, setMapZoom] = useState(80)
  const [telemetryTab, setTelemetryTab] = useState<"events" | "logs">("events")

  const runRoute = (route: string) => {
    if (route === "codex" || route === "/codex") {
      onOpenCodex()
      return
    }
    if (route === "/canvas" || route === "/preview") {
      onOpenCanvas()
      return
    }
    onViewChange(routeToView(route))
  }

  const runFeature = (feature: SovereignFeature) => {
    if (feature.title === "Malik Codex 1.0" || feature.route === "/codex") {
      onOpenCodex()
      return
    }
    if (feature.actionType === "open-canvas" || feature.route === "/canvas" || feature.route === "/preview") {
      onOpenCanvas()
      return
    }
    runRoute(feature.route)
  }

  return (
    <main className="command-center-home">
      <div className="cmd-bg-aura" />
      <div className="cmd-bg-grid" />

      <div className="cmd-topbar" aria-label="Command Center shortcuts">
        {topbarItems.map(([icon, label, route]) => (
          <button key={label} type="button" onClick={() => runRoute(route)}>
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="cmd-topbar-status" aria-hidden="true">
        <span>♢</span>
        <span>♛ 4,460</span>
        <span>M</span>
      </div>

      <section className="cmd-inner">
        <header className="cmd-header">
          <div>
            <h1>Command Center</h1>
            <p>Миссии, агенты и автоматизированные рабочие процессы.</p>
          </div>
          <button type="button" onClick={() => runRoute("/settings")}>
            <Settings className="h-4 w-4" />
            Настроить панель
          </button>
        </header>

        <section className="cmd-metrics">
          {metrics.map((metric) => {
            const Icon = metric.icon
            return (
              <article key={metric.label} className={`cmd-card cmd-metric cmd-metric-${metric.tone}`}>
                <div>
                  <p>{metric.label}</p>
                  <strong>{metric.value}</strong>
                  <span>{metric.note}</span>
                </div>
                <div className="cmd-metric-visual">
                  <Icon className="h-6 w-6" />
                  {metric.tone !== "slate" && <MiniTrend tone={metric.tone} />}
                </div>
              </article>
            )
          })}
        </section>

        <section className="cmd-dashboard-grid">
          <article className="cmd-card cmd-agent-card">
            <div className="cmd-panel-head">
              <h2>Карта агентов</h2>
              <div className="cmd-map-tools">
                <button type="button" aria-label="Search agents" onClick={() => runRoute("/search")}><Search className="h-4 w-4" /></button>
                <button type="button" onClick={() => setMapZoom((value) => value >= 100 ? 60 : value + 20)}>{mapZoom}%</button>
                <button type="button" onClick={() => runRoute("/dashboard-generation")}>Вид: Рабочий процесс⌄</button>
              </div>
            </div>
            <AgentMap runRoute={runRoute} />
          </article>

          <article className="cmd-card cmd-telemetry-card">
            <div className="cmd-panel-head">
              <h2>Живая телеметрия</h2>
              <span>LIVE</span>
            </div>
            <div className="cmd-telemetry-tabs">
              <button type="button" onClick={() => setTelemetryTab("events")}>События{telemetryTab === "events" ? " •" : ""}</button>
              <button type="button" onClick={() => setTelemetryTab("logs")}>Логи выполнения{telemetryTab === "logs" ? " •" : ""}</button>
            </div>
            <div className="cmd-telemetry-list">
              {telemetry.map(([time, title, text, tone]) => (
                <button key={`${time}-${title}`} type="button" onClick={() => runRoute("/features")} className={`cmd-event cmd-event-${tone}`}>
                  <time>{time}</time>
                  <span>
                    <strong>{title}</strong>
                    <em>{text}</em>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" className="cmd-link-button" onClick={() => runRoute("/features")}>Смотреть все события →</button>
          </article>

          <article className="cmd-card cmd-missions-card">
            <div className="cmd-panel-head">
              <h2>Текущие миссии</h2>
              <button type="button" onClick={() => runRoute("/projects")}>Смотреть все⌄</button>
            </div>
            <div className="cmd-missions-table">
              <div className="cmd-missions-head">
                <span>Миссия</span>
                <span>Агенты</span>
                <span>Статус</span>
                <span>Приоритет</span>
                <span>Владелец</span>
                <span>ETA</span>
              </div>
              {missionRows.map(([title, sub, status, progress, priority, owner, eta, route]) => (
                <button key={title} type="button" className="cmd-mission-row" onClick={() => runRoute(route)}>
                  <span>
                    <strong>{title}</strong>
                    <em>{sub}</em>
                  </span>
                  <span className="cmd-agent-pills">
                    <i /> <i /> <i /> <em>+2</em>
                  </span>
                  <span>
                    <em className={statusClass(status)}>● {status}</em>
                    <b><i style={{ width: progress }} /></b>
                  </span>
                  <span className={priorityClass(priority)}>↟ {priority}</span>
                  <span>{owner}</span>
                  <span>{eta}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="cmd-card cmd-scheduler-card">
            <div className="cmd-panel-head">
              <h2>Планировщик задач</h2>
              <button type="button" onClick={() => runRoute("/projects")}>Все очереди⌄</button>
            </div>
            <div className="cmd-schedule-list">
              {schedule.map(([time, title, cadence, status, tasks]) => (
                <button key={`${time}-${title}`} type="button" onClick={() => runRoute("/projects")}>
                  <time>{time}</time>
                  <span>
                    <strong>{title}</strong>
                    <em>{cadence}</em>
                  </span>
                  <b>{status}</b>
                  <small>{tasks}</small>
                </button>
              ))}
            </div>
            <button type="button" className="cmd-link-button" onClick={() => runRoute("/projects")}>Открыть планировщик →</button>
          </article>
        </section>

        <section className="cmd-action-grid">
          {actionCards.map((card) => {
            const Icon = card.icon
            return (
              <button key={card.title} type="button" className="cmd-card cmd-action-card" onClick={() => runRoute(card.route)}>
                <Icon className="h-5 w-5" />
                <span>
                  <strong>{card.title}</strong>
                  <em>{card.text}</em>
                </span>
                <i>→</i>
              </button>
            )
          })}
        </section>

        <section className="cmd-feature-strip" aria-label="Connected command center actions">
          {connectedFeatures.slice(0, 8).map((feature) => (
            <button key={feature.id} type="button" onClick={() => runFeature(feature)}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {feature.title}
            </button>
          ))}
          <button type="button" onClick={onOpenCanvas}><Radio className="h-3.5 w-3.5" /> Canvas online</button>
          <button type="button" onClick={onOpenCodex}><Terminal className="h-3.5 w-3.5" /> Codex ready</button>
        </section>
      </section>
    </main>
  )
}

export default SovereignCommandCenter

