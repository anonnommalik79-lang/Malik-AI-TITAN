"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Upload, X } from "lucide-react"

import { OverlayPortal } from "../OverlayPortal"
import { newRequestId, OS_OPEN_EVENT, osFetch, formatDuration, type FlowView } from "./os-client"
import { SuperflowBlock, kindIcon } from "./SuperflowBlock"
import "./os.css"

const ArtifactViewer = dynamic(() => import("./ArtifactViewer").then((mod) => mod.ArtifactViewer), { ssr: false })

/**
 * Mission control: every flow of this account (running and finished), the
 * universal library, the data analyst, plugins as actions, and the real
 * health of models and tools. Opened from the Superflow block or the
 * command palette; lives in an overlay, so the dashboard is untouched.
 */

type Tab = "tasks" | "library" | "data" | "plugins" | "health"

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "tasks", label: "Задачи" },
  { id: "library", label: "Библиотека" },
  { id: "data", label: "Данные" },
  { id: "plugins", label: "Плагины" },
  { id: "health", label: "Здоровье" },
]

type FlowEntry = { id: string; projectId: string; goal: string; status: string; createdAt: number; updatedAt: number; clientRequestId: string; taskCount: number; artifactCount: number }
type LibraryEntry = { id: string; title: string; kind: string; createdAt: number; summary: string; url?: string; version?: number; fallback?: unknown; relevance?: number }
type PluginEntry = { id: string; name: string; category: string; runtime: string; needsConnection: boolean; reads: string; grant: { mode: string } | null }

const STATUS_WORD: Record<string, string> = { planned: "в очереди", running: "выполняется", completed: "готово", partial: "готово частично", failed: "не получилось", cancelled: "остановлено" }

const KIND_FILTERS = [
  { id: "", label: "Всё" },
  { id: "website", label: "Сайты" },
  { id: "presentation", label: "Презентации" },
  { id: "business-plan", label: "Бизнес-планы" },
  { id: "analysis", label: "Исследования" },
  { id: "image", label: "Изображения" },
  { id: "code", label: "Код" },
  { id: "document", label: "Документы" },
  { id: "dataset", label: "Данные" },
]

function TasksTab() {
  const [flows, setFlows] = useState<FlowEntry[] | null>(null)
  const [error, setError] = useState("")
  const [open, setOpen] = useState<FlowEntry | null>(null)
  const [durable, setDurable] = useState(true)
  const load = useCallback(async () => {
    const result = await osFetch<{ flows: FlowEntry[]; durable: boolean }>("/api/os/flows")
    if (result.ok) {
      setFlows(result.data.flows)
      setDurable(result.data.durable)
    } else setError(result.message)
  }, [])
  useEffect(() => {
    void load()
    const timer = window.setInterval(load, 8_000)
    return () => window.clearInterval(timer)
  }, [load])
  if (open) {
    return (
      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        <button type="button" className="malik-os-button" style={{ justifySelf: "start" }} onClick={() => setOpen(null)}>← Все задачи</button>
        <SuperflowBlock messageId="" reference={{ clientRequestId: open.clientRequestId, goal: open.goal, flowId: open.id }} />
      </div>
    )
  }
  if (error) return <div className="malik-os-empty">{error}</div>
  if (!flows) return <div className="malik-os-empty"><Loader2 className="animate-spin" style={{ width: 18, height: 18, display: "inline" }} aria-hidden="true" /></div>
  if (!flows.length) return <div className="malik-os-empty">Задач пока нет. Напишите в чате цель — например: «Создай казахстанский технологический стартап и подготовь его к презентации инвесторам».</div>
  return (
    <>
      {!durable ? <div className="malik-os-banner">Облачное хранилище проектов не настроено: результаты хранятся до перезапуска сервера.</div> : null}
      <ul className="malik-os-list">
        {flows.map((flow) => (
          <li key={flow.id} className="malik-os-list-item">
            <button type="button" className="malik-os-link" onClick={() => setOpen(flow)}>
              <strong>{flow.goal}</strong>
              <span>{STATUS_WORD[flow.status] || flow.status} · {flow.artifactCount} результатов · {new Date(flow.createdAt).toLocaleString("ru-RU")}</span>
            </button>
            {flow.status === "running" ? <span className="malik-os-dot" aria-label="выполняется" /> : <span className="malik-os-badge">{STATUS_WORD[flow.status] || flow.status}</span>}
          </li>
        ))}
      </ul>
    </>
  )
}

function LibraryTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("")
  const [items, setItems] = useState<LibraryEntry[] | null>(null)
  const [mode, setMode] = useState("")
  const [error, setError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams()
      if (query.trim()) params.set("q", query.trim())
      if (kind) params.set("kind", kind)
      const result = await osFetch<{ artifacts: LibraryEntry[]; mode: string }>(`/api/os/artifacts?${params}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (result.ok) {
        setItems(result.data.artifacts)
        setMode(result.data.mode)
        setError("")
      } else setError(result.message)
    }, query ? 280 : 0)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [kind, query])
  return (
    <div>
      <div className="malik-os-toolbar">
        <input className="malik-os-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти: «лендинг», «питч для инвесторов», «логотип»…" aria-label="Поиск по библиотеке" />
      </div>
      <div className="malik-os-tabs" role="tablist" aria-label="Тип результата">
        {KIND_FILTERS.map((filter) => <button key={filter.id} type="button" className={`malik-os-tab${kind === filter.id ? " is-active" : ""}`} onClick={() => setKind(filter.id)}>{filter.label}</button>)}
      </div>
      {query && mode ? <div className="malik-os-note" style={{ padding: "8px 14px 0" }}>{mode === "semantic" ? "Поиск по смыслу" : "Поиск по словам, синонимам и опечаткам"}</div> : null}
      {error ? <div className="malik-os-empty">{error}</div> : null}
      {!items && !error ? <div className="malik-os-empty"><Loader2 className="animate-spin" style={{ width: 18, height: 18, display: "inline" }} aria-hidden="true" /></div> : null}
      {items && !items.length ? <div className="malik-os-empty">{query ? "Ничего не нашлось." : "Библиотека пуста: здесь появятся сайты, презентации, планы и изображения из ваших задач."}</div> : null}
      <ul className="malik-os-list">
        {(items || []).map((item) => (
          <li key={item.id} className="malik-os-list-item" style={{ gridTemplateColumns: "34px minmax(0,1fr)" }}>
            <span className="malik-os-card-icon" style={{ width: 34, height: 34, borderRadius: 10, background: "#fff", color: "#000", display: "grid", placeItems: "center", overflow: "hidden" }}>
              {item.kind === "image" && item.url ? <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" referrerPolicy="no-referrer" /> : kindIcon(item.kind)}
            </span>
            <button type="button" className="malik-os-link" onClick={() => onOpen(item.id)}>
              <strong>{item.title}{item.version && item.version > 1 ? ` · v${item.version}` : ""}</strong>
              <span>{item.summary || new Date(item.createdAt).toLocaleString("ru-RU")}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DataTab() {
  const [question, setQuestion] = useState("")
  const [flow, setFlow] = useState<FlowView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const upload = async (file: File) => {
    setError("")
    if (file.size > 5 * 1024 * 1024) return setError("Файл больше 5 МБ. Сократите таблицу или разбейте её на части.")
    setBusy(true)
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    }).catch(() => "")
    if (!base64) {
      setBusy(false)
      return setError("Не удалось прочитать файл.")
    }
    const result = await osFetch<{ flow: FlowView }>("/api/os/data", { method: "POST", json: { fileName: file.name, base64, question, clientRequestId: newRequestId("dt") }, timeoutMs: 60_000 })
    setBusy(false)
    if (result.ok) setFlow(result.data.flow)
    else setError(result.message)
  }
  return (
    <div style={{ padding: 14, display: "grid", gap: 12, maxWidth: 720 }}>
      <p className="malik-os-note" style={{ margin: 0 }}>Загрузите CSV или XLSX до 5 МБ. Malik посчитает статистику точно (типы столбцов, суммы, средние, медианы, связи, группы) и объяснит, что она показывает. Цифры считает программа, а не модель.</p>
      <input className="malik-os-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Вопрос к данным (необязательно): где продажи выше?" />
      <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file) }} />
      <button type="button" className="malik-os-button is-primary" style={{ justifySelf: "start" }} disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}Выбрать файл
      </button>
      {error ? <div className="malik-os-note" role="alert">{error}</div> : null}
      {flow ? <SuperflowBlock messageId="" reference={{ clientRequestId: flow.clientRequestId, goal: flow.goal, flowId: flow.id }} /> : null}
    </div>
  )
}

function PluginsTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [plugins, setPlugins] = useState<PluginEntry[] | null>(null)
  const [filter, setFilter] = useState("")
  const [active, setActive] = useState<PluginEntry | null>(null)
  const [query, setQuery] = useState("")
  const [asking, setAsking] = useState<PluginEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const load = useCallback(async () => {
    const result = await osFetch<{ plugins: PluginEntry[] }>("/api/os/plugins")
    if (result.ok) setPlugins(result.data.plugins)
    else setMessage(result.message)
  }, [])
  useEffect(() => { void load() }, [load])
  const run = async (plugin: PluginEntry) => {
    setBusy(true)
    setMessage("")
    const result = await osFetch<{ artifact: { id: string } }>("/api/os/plugins/run", { method: "POST", json: { pluginId: plugin.id, query }, timeoutMs: 90_000 })
    setBusy(false)
    if (result.ok) return onOpen(result.data.artifact.id)
    if (result.code === "PERMISSION_REQUIRED") return setAsking(plugin)
    setMessage(result.message)
  }
  const grant = async (mode: "once" | "always") => {
    if (!asking) return
    const plugin = asking
    setAsking(null)
    const result = await osFetch("/api/os/plugins", { method: "POST", json: { pluginId: plugin.id, mode } })
    if (!result.ok) return setMessage(result.message)
    void load()
    void run(plugin)
  }
  const shown = useMemo(() => (plugins || []).filter((plugin) => !filter || `${plugin.name} ${plugin.category}`.toLowerCase().includes(filter.toLowerCase())), [filter, plugins])
  return (
    <div>
      <div className="malik-os-toolbar">
        <input className="malik-os-input" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Найти плагин" aria-label="Найти плагин" />
      </div>
      {message ? <div className="malik-os-banner" role="alert">{message}</div> : null}
      {active ? (
        <form className="malik-os-toolbar" onSubmit={(event) => { event.preventDefault(); void run(active) }}>
          <strong style={{ fontSize: 13 }}>{active.name}</strong>
          <input className="malik-os-input" style={{ flex: "1 1 220px" }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Что найти или получить" autoFocus />
          <button type="submit" className="malik-os-button is-primary" disabled={busy}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Выполнить</button>
          <button type="button" className="malik-os-button" onClick={() => setActive(null)}>Отмена</button>
        </form>
      ) : null}
      {!plugins ? <div className="malik-os-empty"><Loader2 className="animate-spin" style={{ width: 18, height: 18, display: "inline" }} aria-hidden="true" /></div> : null}
      <ul className="malik-os-list">
        {shown.map((plugin) => (
          <li key={plugin.id} className="malik-os-list-item">
            <button type="button" className="malik-os-link" onClick={() => { setActive(plugin); setQuery("") }}>
              <strong>{plugin.name}</strong>
              <span>{plugin.reads}</span>
            </button>
            <span className="malik-os-badge">{plugin.needsConnection ? (plugin.grant ? (plugin.grant.mode === "always" ? "разрешено" : "разрешено 1 раз") : "нужно разрешение") : "открытые данные"}</span>
          </li>
        ))}
      </ul>
      {asking ? (
        <div className="malik-os-overlay" style={{ zIndex: 450 }} role="presentation">
          <div className="malik-os-sheet" style={{ height: "auto", width: "min(460px, 100%)" }} role="alertdialog" aria-modal="true" aria-label={`Разрешение для ${asking.name}`}>
            <header className="malik-os-sheet-head"><h2>Разрешить {asking.name}?</h2></header>
            <div style={{ padding: 16, display: "grid", gap: 10, fontSize: 14 }}>
              <p style={{ margin: 0 }}>{asking.reads}</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: "rgba(255,255,255,.7)", fontSize: 13, display: "grid", gap: 4 }}>
                <li>Только чтение: Malik AI ничего не меняет и не отправляет от вашего имени.</li>
                <li>Результат сохранится в библиотеке проекта.</li>
                <li>Разрешение можно отозвать в любой момент.</li>
              </ul>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                <button type="button" className="malik-os-button is-primary" onClick={() => void grant("once")}>Разрешить один раз</button>
                <button type="button" className="malik-os-button" onClick={() => void grant("always")}>Разрешать всегда</button>
                <button type="button" className="malik-os-button" onClick={() => setAsking(null)}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

type HealthPayload = {
  detailed: boolean
  summary: { text: { lanes: number; available: number; observedOk: number; providers: number }; search: { configured: number }; image: { directDelivery: boolean; primaryConfigured: boolean }; storage: { projectsDurable: boolean }; tools: Array<{ tool: string; runs: number; successRate: number | null; p50: number | null; p95: number | null; budgetMs: number | null }> }
  providers?: Array<{ provider: string; lanes: number; resting: number; ok: number; fail: number; firstTokenMsMedian: number | null; state: string }>
}
type PerfPayload = { rows: Array<{ metric: string; budgetMs: number | null; count: number; successRate: number | null; p50: number | null; p95: number | null; withinBudget: boolean | null }> }

const STATE_WORD: Record<string, string> = { "observed-ok": "отвечает", failing: "ошибки", resting: "отдыхает", configured: "подключён, данных нет" }

function HealthTab() {
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [perf, setPerf] = useState<PerfPayload | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    void (async () => {
      const [h, p] = await Promise.all([osFetch<HealthPayload>("/api/os/health"), osFetch<PerfPayload>("/api/os/perf")])
      if (h.ok) setHealth(h.data)
      else setError(h.message)
      if (p.ok) setPerf(p.data)
    })()
  }, [])
  if (error) return <div className="malik-os-empty">{error}</div>
  if (!health) return <div className="malik-os-empty"><Loader2 className="animate-spin" style={{ width: 18, height: 18, display: "inline" }} aria-hidden="true" /></div>
  const s = health.summary
  const ms = (value: number | null | undefined) => (value === null || value === undefined ? "—" : formatDuration(value))
  return (
    <div style={{ padding: 14, display: "grid", gap: 18 }}>
      <p className="malik-os-note" style={{ margin: 0 }}>Только реальные данные этого сервера: «отвечает» — были успешные ответы; «подключён, данных нет» — ключ есть, запросов ещё не было.</p>
      <table className="malik-os-table">
        <tbody>
          <tr><th>Текстовые модели</th><td>{s.text.available} из {s.text.lanes} маршрутов свободны · отвечали {s.text.observedOk} из {s.text.providers} провайдеров</td></tr>
          <tr><th>Поиск в интернете</th><td>{s.search.configured} поисковых сервисов подключено</td></tr>
          <tr><th>Изображения</th><td>{s.image.primaryConfigured ? "основной сервис подключён" : "основной сервис не подключён"}{s.image.directDelivery ? " · доставка напрямую от провайдера" : ""}</td></tr>
          <tr><th>Хранилище проектов</th><td>{s.storage.projectsDurable ? "облачное (переживает перезапуск)" : "память сервера (до перезапуска)"}</td></tr>
        </tbody>
      </table>
      {health.providers?.length ? (
        <section>
          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Матрица провайдеров (видна только владельцу)</h4>
          <div style={{ overflowX: "auto" }}>
            <table className="malik-os-table">
              <thead><tr><th>Провайдер</th><th>Состояние</th><th>Маршрутов</th><th>Отдыхают</th><th>Успехов</th><th>Ошибок</th><th>Первый токен</th></tr></thead>
              <tbody>
                {health.providers.map((row) => <tr key={row.provider}><td>{row.provider}</td><td>{STATE_WORD[row.state] || row.state}</td><td>{row.lanes}</td><td>{row.resting}</td><td>{row.ok}</td><td>{row.fail}</td><td>{ms(row.firstTokenMsMedian)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {perf?.rows.length ? (
        <section>
          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Бюджет скорости</h4>
          <div style={{ overflowX: "auto" }}>
            <table className="malik-os-table">
              <thead><tr><th>Шаг</th><th>Запусков</th><th>Успешно</th><th>p50</th><th>p95</th><th>Бюджет</th><th /></tr></thead>
              <tbody>
                {perf.rows.map((row) => (
                  <tr key={row.metric}>
                    <td>{row.metric.replace(/^tool\./, "").replace(/^flow\./, "flow · ")}</td>
                    <td>{row.count}</td>
                    <td>{row.successRate === null ? "—" : `${Math.round(row.successRate * 100)}%`}</td>
                    <td>{ms(row.p50)}</td>
                    <td>{ms(row.p95)}</td>
                    <td>{ms(row.budgetMs)}</td>
                    <td>{row.withinBudget === null ? "нет данных" : row.withinBudget ? "в бюджете" : "медленнее бюджета"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export function MissionControl({ initialTab = "tasks", onClose }: { initialTab?: Tab; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [viewing, setViewing] = useState<string | null>(null)
  useEffect(() => setTab(initialTab), [initialTab])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !viewing) onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, viewing])
  return (
    <OverlayPortal>
      <div className="malik-os-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
        <div className="malik-os-sheet" role="dialog" aria-modal="true" aria-label="Malik AI OS">
          <header className="malik-os-sheet-head">
            <h2>Malik AI OS</h2>
            <div className="malik-os-sheet-actions">
              <button type="button" className="malik-os-close" onClick={onClose} aria-label="Закрыть"><X aria-hidden="true" /></button>
            </div>
          </header>
          <nav className="malik-os-tabs" role="tablist" aria-label="Разделы">
            {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`malik-os-tab${tab === item.id ? " is-active" : ""}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
          </nav>
          <div className="malik-os-sheet-body">
            {tab === "tasks" ? <TasksTab /> : null}
            {tab === "library" ? <LibraryTab onOpen={setViewing} /> : null}
            {tab === "data" ? <DataTab /> : null}
            {tab === "plugins" ? <PluginsTab onOpen={setViewing} /> : null}
            {tab === "health" ? <HealthTab /> : null}
          </div>
        </div>
      </div>
      {viewing ? <ArtifactViewer artifactId={viewing} onClose={() => setViewing(null)} /> : null}
    </OverlayPortal>
  )
}

/** Mounted once by the dashboard; opens mission control on request. */
export function MissionControlHost() {
  const [open, setOpen] = useState<Tab | null>(null)
  useEffect(() => {
    const onOpen = (event: Event) => {
      const tab = String((event as CustomEvent<{ tab?: string }>).detail?.tab || "tasks") as Tab
      setOpen(TABS.some((item) => item.id === tab) ? tab : "tasks")
    }
    window.addEventListener(OS_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OS_OPEN_EVENT, onOpen)
  }, [])
  if (!open) return null
  return <MissionControl initialTab={open} onClose={() => setOpen(null)} />
}
