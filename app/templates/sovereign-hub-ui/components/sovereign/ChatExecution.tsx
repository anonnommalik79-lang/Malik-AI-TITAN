"use client"

import { useEffect, useId, useState } from "react"
import { Check, ChevronDown, Copy, Download, FileText, Globe, Image, Loader2, Plug, Search, SquareTerminal, X, AlertCircle, CircleStop, ExternalLink } from "lucide-react"
import { executionMarkdown, type ExecutionStep, type ExecutionTrace } from "@/lib/ai/chat-execution"
import "./chat-execution.css"

const labels = { running: "Выполняется", completed: "Готово", failed: "Ошибка", cancelled: "Остановлено", interrupted: "Прервано" }
const icons = { status: Loader2, search: Search, read: Globe, plugin: Plug, file: FileText, model: SquareTerminal, code: SquareTerminal, media: Image }
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
  const Icon = icons[step.kind]
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

export function ChatExecution({ trace, live = false }: { trace: ExecutionTrace; live?: boolean }) {
  const [open, setOpen] = useState(true)
  const [expand, setExpand] = useState<boolean | undefined>()
  const [filter, setFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!live || trace.state !== "running") return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [live, trace.state])
  const now = trace.endedAt || clock
  const failures = trace.steps.filter((step) => step.state === "failed").length
  const tools = trace.steps.filter((step) => step.kind !== "status" && step.kind !== "model").length
  const running = trace.steps.filter((step) => step.state === "running")
  const rows = trace.steps.filter((step) => (filter === "all" || (filter === "errors" ? step.state === "failed" : step.kind !== "status" && step.kind !== "model"))
    && (!query || `${step.title} ${step.tool || ""} ${step.input || ""} ${step.output || ""} ${step.error || ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
  const id = useId()
  return <section className="malik-execution" aria-label="Ход выполнения запроса" data-state={trace.state}>
    <button type="button" className="malik-execution__summary" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
      {live && trace.state === "running" ? <Loader2 size={18} className="is-spinning" /> : <SquareTerminal size={18} />}
      <span>{trace.state === "running" && live ? "Ход выполнения" : "Отчёт выполнения"}<small>{tools} действий · {duration(now - trace.startedAt)}{failures ? ` · ошибок: ${failures}` : ""}</small></span>
      <ChevronDown size={17} className={open ? "is-open" : ""} />
    </button>
    <p className="malik-execution__live" role="status" aria-live="polite">{live && running.length ? running.at(-1)?.title : labels[trace.state]}</p>
    {open ? <div id={id}>
      <div className="malik-execution__toolbar">
        <label><span className="sr-only">Фильтр действий</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Все действия</option><option value="tools">Инструменты</option><option value="errors">Ошибки ({failures})</option></select></label>
        <button type="button" onClick={() => setExpand((value) => value === true ? undefined : true)} aria-pressed={expand === true}>{expand === true ? "По отдельности" : "Раскрыть все"}</button>
        <button type="button" onClick={() => setExpand((value) => value === false ? undefined : false)} aria-pressed={expand === false}>{expand === false ? "По отдельности" : "Свернуть все"}</button>
        <details className="malik-execution__export"><summary><Download size={14} />Отчёт</summary><div><button type="button" onClick={() => downloadChatFile(`malik-${trace.id}.md`, executionMarkdown(trace))}>Markdown</button><button type="button" onClick={() => downloadChatFile(`malik-${trace.id}.json`, JSON.stringify(trace, null, 2), "application/json")}>JSON</button></div></details>
      </div>
      {trace.steps.length > 4 ? <label className="malik-execution__search"><Search size={14} /><span className="sr-only">Поиск в отчёте</span><input placeholder="Найти действие или результат…" value={query} onChange={(event) => setQuery(event.target.value)} />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск"><X size={13} /></button> : null}</label> : null}
      <ol className="malik-execution__steps">{rows.map((step) => <Receipt key={step.id} step={step} now={now} expanded={expand} />)}</ol>
      {!rows.length ? <p className="malik-execution__empty">Нет подходящих действий.</p> : null}
      <div className="malik-execution__footer"><span>{trace.model || "Malik AI"}</span><span title={trace.id}>Запрос {trace.id.slice(0, 8)}</span></div>
      <p className="malik-execution__note">Фактические действия и результаты системы, не внутренние рассуждения модели.</p>
    </div> : null}
  </section>
}
