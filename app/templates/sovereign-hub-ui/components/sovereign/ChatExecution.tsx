"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { Check, ChevronDown, Copy, Download, FileText, Globe, Image, Loader2, Plug, Search, SquareTerminal, AlertCircle, CircleStop, ExternalLink, BrainCircuit, Github } from "lucide-react"
import { executionMarkdown, executionOverview, publicExecutionText, type ExecutionSource, type ExecutionStep, type ExecutionTrace } from "@/lib/ai/chat-execution"
import "./chat-execution.css"
import { MalikLiveActivity } from "./MalikLiveActivity"
import { MalikResponseStages } from "./MalikResponseStages"
import { MalikDigitalBrowser } from "./MalikDigitalBrowser"
import { shouldUseDigitalBrowser } from "@/lib/ai/computer-use"
import { ACTIVITY_FILTERS, activityStepNote, activitySummary, filterActivitySteps, type ActivityFilter } from "@/lib/ai/chat-activity"

const labels = { running: "Выполняется", completed: "Готово", failed: "Ошибка", cancelled: "Остановлено", interrupted: "Прервано" }
const icons = { status: BrainCircuit, search: Search, read: Globe, plugin: Plug, file: FileText, model: BrainCircuit, code: SquareTerminal, media: Image }
function duration(ms: number) { return ms < 1000 ? `${Math.max(0, Math.round(ms))} мс` : `${(ms / 1000).toFixed(1)} с` }

export function downloadChatFile(name: string, content: string, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement("a")
  link.href = url; link.download = name; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Receipt({ step, expanded, now }: { step: ExecutionStep; expanded?: boolean; now: number }) {
  const [localOpen, setLocalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState("")
  const id = useId()
  const open = expanded ?? localOpen
  const Icon = /github/i.test(step.tool || "") || /^https?:\/\/(?:api\.)?github\.com\//i.test(step.url || "") ? Github : icons[step.kind]
  const StateIcon = step.state === "running" ? Loader2 : step.state === "completed" ? Check : step.state === "failed" ? AlertCircle : CircleStop
  const detailed = Boolean(step.input || step.output || step.error || step.url)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText([step.title, step.input, step.output, step.error].filter(Boolean).join("\n\n"))
      setCopied(true); setCopyError("")
      window.setTimeout(() => setCopied(false), 1600)
    } catch { setCopyError("Копирование недоступно — выделите текст вручную.") }
  }
  return <li className={`malik-receipt is-${step.state}`}>
    <button className="malik-receipt__heading" type="button" aria-expanded={detailed ? open : undefined} aria-controls={detailed ? id : undefined} onClick={() => setLocalOpen(!open)} disabled={!detailed || expanded !== undefined}>
      <Icon size={18} aria-hidden="true" />
      <span className="malik-receipt__title">{step.title}</span>
      <StateIcon size={14} className={step.state === "running" ? "is-spinning" : ""} aria-hidden="true" />
      <span className="sr-only">{labels[step.state]}</span>
      <span className="malik-receipt__duration">{duration((step.endedAt || now) - step.startedAt)}</span>
      {detailed ? <ChevronDown size={15} className={open ? "is-open" : ""} aria-hidden="true" /> : null}
    </button>
    {open && detailed ? <div id={id} className="malik-receipt__body">
      <div className="malik-receipt__meta"><span>{step.tool || step.kind} · {labels[step.state]}</span><button type="button" onClick={copy} aria-label="Копировать действие">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Скопировано" : "Копировать"}</button></div>
      {copyError ? <p role="status">{copyError}</p> : null}
      {step.input ? <div className="malik-receipt__payload"><span>Входные данные</span><pre tabIndex={0}>{step.input}</pre></div> : null}
      {step.output ? <div className="malik-receipt__payload"><span>Результат</span><pre tabIndex={0}>{step.output}</pre></div> : null}
      {step.error ? <div className="malik-receipt__error" role="note"><AlertCircle size={15} /><span>{step.error}</span></div> : null}
      {step.url ? <a className="malik-receipt__source" href={step.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Открыть источник</a> : null}
      {step.state === "running" ? <p className="malik-receipt__waiting">Ожидаю результат инструмента…</p> : null}
    </div> : null}
  </li>
}

const NO_SOURCES: ExecutionSource[] = []

export function ChatExecution({ trace, live = false, sources = NO_SOURCES, workMode = false, writing = false, legacyThought, stages = false, browserTask = "", latest = false }: { trace?: ExecutionTrace; live?: boolean; sources?: ExecutionSource[]; workMode?: boolean; writing?: boolean; legacyThought?: { ms: number; steps: string[] }; browserTask?: string; latest?: boolean; /** Show the progress line under «Думаю…» for a turn that started live (visible without opening the panel). */ stages?: boolean }) {
  const [open, setOpen] = useState(false)
  // Decided once, when this answer's row mounts: only a turn that is being
  // answered right now gets the progress line, never a reopened history item.
  const [stagesForTurn] = useState(() => Boolean(stages && live && !writing && (!trace || trace.state === "running")))
  const [expand, setExpand] = useState<boolean | undefined>(undefined)
  const [allSources, setAllSources] = useState(false)
  const [hideUpdates, setHideUpdates] = useState(false)
  const [filter, setFilter] = useState<ActivityFilter>("all")
  const [query, setQuery] = useState("")
  const [copyStatus, setCopyStatus] = useState("")
  const [clock, setClock] = useState(() => Date.now())
  const activity = useMemo(() => activitySummary(trace, sources), [trace, sources])
  useEffect(() => {
    if (!live || trace?.state !== "running") return
    const timer = window.setInterval(() => { if (!document.hidden) setClock(Date.now()) }, 1000)
    return () => window.clearInterval(timer)
  }, [live, trace?.state])
  const now = trace?.endedAt || clock
  const tools = trace?.steps.filter((step) => step.kind !== "status" && step.kind !== "model") || []
  const running = trace?.steps.filter((step) => step.state === "running") || []
  const completedTools = tools.filter((step) => step.state === "completed").length
  const failedTools = tools.filter((step) => step.state === "failed").length
  const rows = trace?.steps || []
  const verified = activity.sources
  const visibleSources = allSources ? verified : verified.slice(0, 6)
  const active = live && (!trace || trace.state === "running")
  const id = useId()
  const summary = active ? writing ? "Пишу ответ…" : "Выполняется" : trace ? `${labels[trace.state]} · ${duration(Math.max(0, now - trace.startedAt))}` : "Журнал недоступен"
  const overview = executionOverview(trace)
  const legacySteps = !trace ? legacyThought?.steps.slice(-8).map(step => publicExecutionText(step, 300)).filter(Boolean) || [] : []
  const filteredRows = useMemo(() => filterActivitySteps(trace?.steps || [], filter, query), [trace?.steps, filter, query])
  const copyReport = async () => {
    if (!trace) return
    try { await navigator.clipboard.writeText(executionMarkdown(trace)); setCopyStatus("Отчёт скопирован") }
    catch { setCopyStatus("Копирование недоступно. Можно скачать отчёт.") }
  }
  const showJournal = active && !writing && activity.journal.length > 0
  return <section className="malik-execution malik-execution--inline" aria-label="Ход выполнения запроса" data-state={trace?.state || (active ? "running" : "unrecorded")}>
    <button type="button" className="malik-execution__summary" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={id}>
      {active ? <Loader2 size={16} className="is-spinning" aria-hidden="true" /> : <BrainCircuit size={16} aria-hidden="true" />}
      <span className="malik-execution__summary-label">Ход работы</span>
      <span className="malik-execution__summary-status" role="status" aria-live="polite">{summary}</span>
      <ChevronDown size={15} className={open ? "is-open" : ""} aria-hidden="true" />
    </button>
    {/* The waiting animation is visible without opening the panel: «Думаю…»
        and the progress line sit right under the request until the first
        characters arrive, then fold away. Receipts stay behind the toggle. */}
    {active && !writing && trace ? <MalikLiveActivity /> : null}
    {stagesForTurn ? <MalikResponseStages trace={trace} writing={writing} /> : null}
    {activity.hasResearch ? <div className="malik-execution__evidence" aria-label="Подтверждённая работа с источниками">
      <span>Найдено ссылок: {activity.countsAreLowerBounds ? "не менее " : ""}{activity.found}</span><span>Сайтов: {activity.countsAreLowerBounds ? "не менее " : ""}{activity.sites}</span><span>Прочитано страниц: {activity.read}</span>
      {activity.unavailable ? <span>Недоступно страниц: {activity.unavailable}</span> : null}
      {verified.length ? <button type="button" onClick={() => { setOpen(true); setFilter("sources"); setQuery("") }}>Показать источники</button> : null}
    </div> : null}
    {showJournal ? <div className="malik-execution__journal" data-malik-activity-journal>
      <div className="malik-execution__journal-heading"><span role="status" aria-live="polite">{activity.title}</span>
        <button type="button" aria-expanded={!hideUpdates} onClick={() => setHideUpdates(value => !value)}>{hideUpdates ? "Показать действия" : "Скрыть действия"}</button>
      </div>
      {!hideUpdates ? <ol>{activity.journal.map(step => {
        const Icon = step.state === "running" ? Loader2 : step.state === "completed" ? Check : step.state === "failed" ? AlertCircle : CircleStop
        return <li key={step.id} data-state={step.state}><div><Icon size={14} className={step.state === "running" ? "is-spinning" : ""} aria-hidden="true" /><span>{step.title}</span><span className="sr-only">{labels[step.state]}</span></div><p>{activityStepNote(step)}</p></li>
      })}</ol> : null}
    </div> : null}
    {!active && activity.problems > 0 ? <p className="malik-execution__limitations" role="note"><AlertCircle size={14} aria-hidden="true" />Есть ограничения или прерванные действия: {activity.problems}. Подробности — в журнале.</p> : null}
    {open ? <div id={id} className="malik-execution__panel">
    <p className="malik-execution__explanation">Здесь реальные этапы и результаты инструментов, а не скрытые внутренние рассуждения модели.</p>
    {activity.detailsLimited ? <p className="malik-execution__explanation">Подробный список ссылок сокращён для ограничения размера журнала. Счётчики сохранены; объединённые неполные списки отмечаются «не менее».</p> : null}
    {overview.length ? <div className="malik-execution__overview" aria-label="Краткий отчёт"><h3>Как подготовлен ответ</h3><ul>{overview.map(text => <li key={text}>{text}</li>)}</ul></div> : null}
    {rows.length ? <>
      <div className="malik-execution__filters"><label className="sr-only" htmlFor={`${id}-filter`}>Фильтр действий</label><select id={`${id}-filter`} value={filter} onChange={event => setFilter(event.target.value as ActivityFilter)}>{ACTIVITY_FILTERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <label className="malik-execution__find"><Search size={14} aria-hidden="true" /><input aria-label="Найти действие" placeholder="Найти действие…" value={query} maxLength={160} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      <p className="malik-execution__count" role="status">Показано действий: {filteredRows.length} из {rows.length}</p>
      {filteredRows.length ? <ol className="malik-execution__steps">{filteredRows.map((step) => <Receipt key={step.id} step={step} now={now} expanded={expand} />)}</ol> : <p className="malik-execution__empty">Нет действий по выбранному фильтру.</p>}
    </> : legacySteps.length ? <div className="malik-execution__legacy"><p>Сохранены только сообщения о статусе. Подробные квитанции этого ответа отсутствуют.</p><ol>{legacySteps.map((text, index) => <li key={index}>{text}</li>)}</ol></div> : <p className="malik-execution__empty">{active ? "Ожидаю событий выполнения от сервера. Ответ появится ниже автоматически." : "Для этого ответа этапы не были сохранены. Восстанавливать или придумывать их задним числом нельзя."}</p>}
    {verified.length ? <div className="malik-execution__sources" aria-label="Источники поиска">
      <p className="malik-execution__sources-title"><Search size={16} aria-hidden="true" />Источники и найденные ссылки · {verified.length}</p>
      <div className="malik-execution__source-chips">{visibleSources.map((source) => <a key={source.url} href={source.url} title={source.title || source.domain} target="_blank" rel="noopener noreferrer"><Globe size={16} aria-hidden="true" /><span><b>{source.domain}</b>{source.title ? <small>{source.title}</small> : null}<em>{activity.readUrls.includes(source.url) ? "Страница прочитана" : "Ссылка · чтение не подтверждено"}</em></span></a>)}
        {verified.length > 6 ? <button type="button" aria-expanded={allSources} onClick={() => setAllSources(!allSources)}>{allSources ? "Свернуть" : `Ещё ${verified.length - 6}`}</button> : null}
      </div>
    </div> : null}
    {workMode && tools.length > 0 ? <div className="malik-execution__work-summary" aria-label="Фактический ход работы">
      <span><Check size={13} aria-hidden="true" />{completedTools} завершено</span>
      {active && running.length > 0 ? <span><Loader2 size={13} className="is-spinning" aria-hidden="true" />{running.length} в процессе</span> : null}
      {failedTools > 0 ? <span><AlertCircle size={13} aria-hidden="true" />{failedTools} с ошибкой</span> : null}
    </div> : null}
    {trace && rows.length ? <div className="malik-execution__toolbar">
      <button type="button" onClick={copyReport}><Copy size={14} aria-hidden="true" />Копировать отчёт</button>
      <button type="button" onClick={() => setExpand((value) => value === true ? undefined : true)} aria-pressed={expand === true}>{expand === true ? "По отдельности" : "Раскрыть детали"}</button>
      <button type="button" onClick={() => setExpand((value) => value === false ? undefined : false)} aria-pressed={expand === false}>{expand === false ? "По отдельности" : "Свернуть детали"}</button>
      <details className="malik-execution__export"><summary><Download size={14} />Скачать отчёт</summary><div><button type="button" onClick={() => downloadChatFile(`malik-${trace.id}.md`, executionMarkdown(trace))}>Markdown</button><button type="button" onClick={() => downloadChatFile(`malik-${trace.id}.json`, JSON.stringify(trace, null, 2), "application/json")}>JSON</button></div></details>
    </div> : null}
    {copyStatus ? <p className="malik-execution__copy-status" role="status">{copyStatus}</p> : null}
    </div> : null}
    {shouldUseDigitalBrowser(browserTask, workMode) ? <MalikDigitalBrowser task={browserTask} latest={latest} workMode={workMode} autoStart={live} /> : null}
  </section>
}
