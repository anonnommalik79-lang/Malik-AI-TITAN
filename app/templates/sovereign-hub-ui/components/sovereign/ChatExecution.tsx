"use client"

import { useEffect, useId, useState } from "react"
import { Check, ChevronDown, Copy, Download, FileText, Globe, Image, Loader2, Plug, Search, SquareTerminal, AlertCircle, CircleStop, ExternalLink, BrainCircuit, Github } from "lucide-react"
import { executionMarkdown, executionOverview, executionSources, publicExecutionText, type ExecutionSource, type ExecutionStep, type ExecutionTrace } from "@/lib/ai/chat-execution"
import "./chat-execution.css"
import { MalikLiveActivity } from "./MalikLiveActivity"
import { MalikResponseStages } from "./MalikResponseStages"
import { MalikDigitalBrowser } from "./MalikDigitalBrowser"
import { shouldUseDigitalBrowser } from "@/lib/ai/computer-use"

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
  const [localOpen, setLocalOpen] = useState(true)
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

export function ChatExecution({ trace, live = false, sources = [], workMode = false, writing = false, legacyThought, stages = false, browserTask = "", latest = false }: { trace?: ExecutionTrace; live?: boolean; sources?: ExecutionSource[]; workMode?: boolean; writing?: boolean; legacyThought?: { ms: number; steps: string[] }; browserTask?: string; latest?: boolean; /** Show the progress line under «Думаю…» for a turn that started live (visible without opening the panel). */ stages?: boolean }) {
  const [open, setOpen] = useState(false)
  // Decided once, when this answer's row mounts: only a turn that is being
  // answered right now gets the progress line, never a reopened history item.
  const [stagesForTurn] = useState(() => Boolean(stages && live && !writing && (!trace || trace.state === "running")))
  const [expand, setExpand] = useState<boolean | undefined>(undefined)
  const [allSources, setAllSources] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!live || trace?.state !== "running") return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [live, trace?.state])
  const now = trace?.endedAt || clock
  const tools = trace?.steps.filter((step) => step.kind !== "status" && step.kind !== "model") || []
  const running = trace?.steps.filter((step) => step.state === "running") || []
  const completedTools = tools.filter((step) => step.state === "completed").length
  const failedTools = tools.filter((step) => step.state === "failed").length
  const rows = trace?.steps || []
  const verified = trace ? executionSources(trace, sources) : []
  const visibleSources = allSources ? verified : verified.slice(0, 6)
  const active = live && (!trace || trace.state === "running")
  const id = useId()
  const summary = active ? writing ? "Пишу ответ…" : "Выполняется" : trace ? `${labels[trace.state]} · ${duration(Math.max(0, now - trace.startedAt))}` : "Журнал недоступен"
  const overview = executionOverview(trace)
  const legacySteps = !trace ? legacyThought?.steps.slice(-8).map(step => publicExecutionText(step, 300)).filter(Boolean) || [] : []
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
    {open ? <div id={id} className="malik-execution__panel">
    <p className="malik-execution__explanation">Здесь реальные этапы и результаты инструментов, а не скрытые внутренние рассуждения модели.</p>
    {overview.length ? <div className="malik-execution__overview" aria-label="Краткий отчёт"><h3>Как подготовлен ответ</h3><ul>{overview.map(text => <li key={text}>{text}</li>)}</ul></div> : null}
    {rows.length ? <ol className="malik-execution__steps">{rows.map((step) => <Receipt key={step.id} step={step} now={now} expanded={expand} />)}</ol> : legacySteps.length ? <div className="malik-execution__legacy"><p>Сохранены только сообщения о статусе. Подробные квитанции этого ответа отсутствуют.</p><ol>{legacySteps.map((text, index) => <li key={index}>{text}</li>)}</ol></div> : <p className="malik-execution__empty">{active ? "Ожидаю событий выполнения от сервера. Ответ появится ниже автоматически." : "Для этого ответа этапы не были сохранены. Восстанавливать или придумывать их задним числом нельзя."}</p>}
    {verified.length ? <div className="malik-execution__sources" aria-label="Источники поиска">
      <p className="malik-execution__sources-title"><Search size={16} aria-hidden="true" />Поиск · {verified.length} источников</p>
      <div className="malik-execution__source-chips">{visibleSources.map((source) => <a key={source.url} href={source.url} title={source.title || source.domain} target="_blank" rel="noopener noreferrer"><Globe size={16} aria-hidden="true" /><span>{source.domain}</span></a>)}
        {verified.length > 6 ? <button type="button" aria-expanded={allSources} onClick={() => setAllSources(!allSources)}>{allSources ? "Свернуть" : `Ещё ${verified.length - 6}`}</button> : null}
      </div>
    </div> : null}
    {workMode && tools.length > 0 ? <div className="malik-execution__work-summary" aria-label="Фактический ход работы">
      <span><Check size={13} aria-hidden="true" />{completedTools} завершено</span>
      {active && running.length > 0 ? <span><Loader2 size={13} className="is-spinning" aria-hidden="true" />{running.length} в процессе</span> : null}
      {failedTools > 0 ? <span><AlertCircle size={13} aria-hidden="true" />{failedTools} с ошибкой</span> : null}
    </div> : null}
    {trace && rows.length ? <div className="malik-execution__toolbar">
      <button type="button" onClick={() => setExpand((value) => value === true ? undefined : true)} aria-pressed={expand === true}>{expand === true ? "По отдельности" : "Раскрыть детали"}</button>
      <button type="button" onClick={() => setExpand((value) => value === false ? undefined : false)} aria-pressed={expand === false}>{expand === false ? "По отдельности" : "Свернуть детали"}</button>
      <details className="malik-execution__export"><summary><Download size={14} />Скачать отчёт</summary><div><button type="button" onClick={() => downloadChatFile(`malik-${trace.id}.md`, executionMarkdown(trace))}>Markdown</button><button type="button" onClick={() => downloadChatFile(`malik-${trace.id}.json`, JSON.stringify(trace, null, 2), "application/json")}>JSON</button></div></details>
    </div> : null}
    </div> : null}
    {shouldUseDigitalBrowser(browserTask, workMode) ? <MalikDigitalBrowser task={browserTask} latest={latest} workMode={workMode} autoStart={live} /> : null}
  </section>
}
