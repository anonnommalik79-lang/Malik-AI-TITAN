"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronDown, ExternalLink, Globe, Loader2, Monitor, ShieldCheck, Square, X } from "lucide-react"
import { computerImageUrl, computerPageUrl, shouldUseDigitalBrowser, type ComputerReceipt } from "@/lib/ai/computer-use"
import "./digital-browser.css"

const labels = { running: "Работаю в браузере", "awaiting-confirmation": "Нужно ваше подтверждение", complete: "Готово", failed: "Не удалось выполнить", cancelled: "Остановлено", handoff: "Нужно ваше участие" }

export function MalikDigitalBrowser({ task, latest = false, workMode = false, autoStart = false }: { task: string; latest?: boolean; workMode?: boolean; autoStart?: boolean }) {
  const eligible = shouldUseDigitalBrowser(task, workMode)
  // An explicit live Work request authorizes starting its browser session.
  // Restored history and rerenders must never execute that request again.
  const [launchForTurn] = useState(() => eligible && latest && autoStart)
  const [open, setOpen] = useState(launchForTurn)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [receipt, setReceipt] = useState<ComputerReceipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fullscreen, setFullscreen] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const started = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!eligible || !latest || (!open && !launchForTurn)) return
    const abort = new AbortController()
    fetch("/api/ai/computer", { cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]) }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(response.status === 401 ? "Войдите в аккаунт для работы браузера." : "Не удалось проверить браузерный сервис.")
      if (!abort.signal.aborted) setAvailable(Boolean(result.configured))
    }).catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
    return () => abort.abort()
  }, [open, latest, eligible, launchForTurn])

  const sessionId = receipt?.sessionId, approvalId = receipt?.approval?.id
  const operate = useCallback(async (operation: "start" | "poll" | "approve" | "cancel") => {
    if (inFlight.current || !eligible) return
    inFlight.current = true; setBusy(true); setError("")
    try {
      const response = await fetch("/api/ai/computer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        operation, workspaceMode: "work", task: operation === "start" ? task : undefined, sessionId,
        approvalId: operation === "approve" ? approvalId : undefined,
        confirm: operation === "start" || operation === "approve",
      }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || "Браузер не подтвердил действие. Повторный запуск автоматически не выполняется.")
      if (mounted.current) setReceipt(result)
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "Ошибка соединения") }
    finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }, [eligible, task, sessionId, approvalId])
  useEffect(() => {
    if (!launchForTurn || !eligible || available !== true || started.current) return
    started.current = true
    void operate("start")
  }, [launchForTurn, eligible, available, operate])
  // Only observe an already running task. Polling never starts or approves an action.
  useEffect(() => {
    if (!eligible || !receipt?.sessionId || receipt.status !== "running" || error) return
    const timer = window.setTimeout(() => void operate("poll"), 1600)
    return () => window.clearTimeout(timer)
  }, [receipt, error, eligible, operate])

  const screenshot = receipt?.screenshots.at(-1)
  const image = screenshot ? computerImageUrl(screenshot.url) : ""
  const page = computerPageUrl(receipt?.pageUrl)
  const live = receipt?.status === "running"
  const approval = receipt?.status === "awaiting-confirmation" ? receipt.approval : undefined
  const title = receipt ? labels[receipt.status] : "Цифровой браузер"
  if (!eligible) return null
  return <section className={`malik-digital-browser${fullscreen ? " is-fullscreen" : ""}`} data-state={receipt?.status || "idle"} aria-label={workMode ? "Браузер Malik Work" : "Браузер Malik AI"}>
    <button type="button" className="malik-digital-browser__heading" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {live ? <Loader2 className="is-spinning" size={18} /> : <Monitor size={18} />}<span>{title}</span><ChevronDown size={16} className={open ? "is-open" : ""} />
    </button>
    {open ? <div className="malik-digital-browser__body">
      <header className="malik-digital-browser__address"><Globe size={14} /><span>{receipt?.pageTitle || (page ? new URL(page).hostname : "Отдельная браузерная сессия")}</span>
        {page ? <a href={page} target="_blank" rel="noopener noreferrer" aria-label="Открыть текущую страницу"><ExternalLink size={14} /></a> : null}
        {image ? <button type="button" onClick={() => setFullscreen(value => !value)} aria-label={fullscreen ? "Свернуть экран" : "Увеличить экран"}>{fullscreen ? <X size={16} /> : <Monitor size={16} />}</button> : null}
      </header>
      <div className="malik-digital-browser__screen">
        {image ? <img src={image} alt={screenshot?.label || "Реальный снимок браузерной сессии"} decoding="async" referrerPolicy="no-referrer" /> : <div className="malik-digital-browser__empty"><Monitor size={30} /><p>{live ? "Ожидаю первый снимок браузера…" : "Снимок появится после открытия страницы."}</p></div>}
        {live ? <span className="malik-digital-browser__live"><span />Браузер выполняет задачу</span> : null}
      </div>
      {receipt?.steps.length ? <ol className="malik-digital-browser__steps">{receipt.steps.slice(-12).map((step, index) => <li key={`${index}:${step.action}`} data-state={step.status}>
        {step.status === "running" ? <Loader2 size={15} className="is-spinning" /> : step.status === "done" ? <Check size={15} /> : <Globe size={15} />}<details><summary>{step.action}</summary>{step.detail ? <pre>{step.detail}</pre> : null}</details>
      </li>)}</ol> : null}
      {approval ? <section className="malik-digital-browser__approval" aria-label="Подтверждение действия"><h3><ShieldCheck size={18} />{approval.title}</h3><pre>{approval.detail}</pre><p>Подтверждение относится только к этому действию. Следующее внешнее действие потребует отдельного подтверждения.</p>
        <div><button type="button" disabled={busy} onClick={() => void operate("approve")}>Подтвердить действие</button><button type="button" disabled={busy} onClick={() => void operate("cancel")}>Отменить</button></div>
      </section> : null}
      {receipt?.summary ? <p className="malik-digital-browser__result" role="status">{receipt.summary}</p> : null}
      {error ? <p role="alert" className="malik-digital-browser__error">{error}</p> : null}
      {!receipt && latest ? <div className="malik-digital-browser__launch"><p>{available === false ? "Браузерный сервис ещё не подключён. Malik AI не выполнял действия на сайтах." : "Задача для браузера:"}</p><p className="malik-digital-browser__task">{task}</p>
        <button type="button" disabled={busy || available !== true} onClick={() => void operate("start")}>{busy ? "Запускаю…" : "Запустить задачу в браузере"}</button><small>Письма, публикации и изменения — после просмотра и вашего подтверждения.</small>
      </div> : null}
      {live || approval ? <button type="button" className="malik-digital-browser__stop" disabled={busy} onClick={() => void operate("cancel")}><Square size={13} />Остановить задачу</button> : error && receipt?.sessionId ? <button type="button" disabled={busy} onClick={() => void operate("poll")}>Проверить состояние без повторного запуска</button> : null}
      {!latest && !receipt ? <p className="malik-digital-browser__result">Запуск доступен для последнего запроса.</p> : null}
    </div> : null}
  </section>
}
