"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ChevronRight,
  Clapperboard,
  Code2,
  FileText,
  Globe,
  ImageIcon,
  LayoutList,
  Loader2,
  Minus,
  Presentation,
  RotateCw,
  Search,
  Square,
  Table2,
  X,
} from "lucide-react"

import type { ArtifactSummary } from "@/lib/os/types"

import {
  answerSuperflowInChat,
  flowProgressOf,
  formatDuration,
  isFlowDone,
  openOs,
  osFetch,
  superflowShouldFallBackToChat,
  updateSuperflowMessage,
  useLiveFlow,
  type FlowView,
  type SuperflowRef,
  type TaskView,
} from "./os-client"
import "./os.css"
import { WorkJournal } from "./WorkJournal"

const ArtifactViewer = dynamic(() => import("./ArtifactViewer").then((mod) => mod.ArtifactViewer), { ssr: false })

/**
 * MALIK SUPERFLOW in the chat: one row per real task of the flow, updated
 * live. A finished row opens what it made; a failed row says why and can be
 * run again; when everything is done the block turns into the result.
 */

function MalikMark() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true"><rect width="44" height="44" rx="12" fill="#fff" /><path d="M9 29 L22 15 L22 29 Z" fill="#000" /><path d="M24 15 H38 L24 29 Z" fill="#000" /></svg>
  )
}

function StatusIcon({ task }: { task: TaskView }) {
  if (task.status === "completed") return <Check aria-hidden="true" />
  if (task.status === "running") return <span className="malik-os-dot" aria-hidden="true" />
  if (task.status === "retrying") return <RotateCw aria-hidden="true" />
  if (task.status === "failed") return <X aria-hidden="true" />
  if (task.status === "cancelled") return <Minus aria-hidden="true" />
  return <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, border: "1.5px solid currentColor", display: "block" }} />
}

const STATUS_WORD: Record<string, string> = {
  completed: "готово",
  running: "выполняется",
  retrying: "повтор",
  failed: "не получилось",
  cancelled: "остановлено",
  planned: "в очереди",
  queued: "в очереди",
  waiting: "ждёт",
}

export function kindIcon(kind: string) {
  if (kind === "website") return <Globe aria-hidden="true" />
  if (kind === "presentation") return <Presentation aria-hidden="true" />
  if (kind === "image") return <ImageIcon aria-hidden="true" />
  if (kind === "code") return <Code2 aria-hidden="true" />
  if (kind === "analysis") return <Search aria-hidden="true" />
  if (kind === "dataset") return <Table2 aria-hidden="true" />
  if (kind === "document") return <Clapperboard aria-hidden="true" />
  if (kind === "business-plan") return <LayoutList aria-hidden="true" />
  return <FileText aria-hidden="true" />
}

const KIND_WORD: Record<string, string> = {
  website: "Сайт",
  presentation: "Презентация",
  image: "Изображение",
  code: "Код",
  analysis: "Исследование",
  dataset: "Данные",
  document: "Документ",
  "business-plan": "Бизнес-план",
  text: "Текст",
}

function fallbackLabel(artifact: ArtifactSummary) {
  if (!artifact.fallback) return ""
  const date = new Date(artifact.fallback.originalCreatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  return `Сохранённая копия от ${date}`
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

export function SuperflowBlock({ messageId, reference, chatId }: { messageId: string; reference: SuperflowRef; chatId?: string }) {
  const [flowId, setFlowId] = useState(reference.flowId)
  const [startError, setStartError] = useState<{ message: string; action?: string } | null>(null)
  const [busy, setBusy] = useState<"" | "cancel" | "retry">("")
  const [openArtifact, setOpenArtifact] = useState<string | null>(null)
  const startedRef = useRef(false)
  const { flow, artifacts, error, refresh, reconnect } = useLiveFlow(flowId)

  // Start (or find) the flow for this message. The request id makes this
  // safe to repeat: a reload, a second tab or a retry reach the same flow.
  const start = useCallback(async () => {
    setStartError(null)
    const result = await osFetch<{ flow: FlowView }>("/api/os/flows", {
      method: "POST",
      json: { goal: reference.goal, clientRequestId: reference.clientRequestId, chatId, workspaceMode: reference.workspaceMode || "chat" },
      timeoutMs: 45_000,
    })
    if (!result.ok) {
      setStartError({ message: result.message, action: result.action })
      // A fresh turn the server refused (limit, plan, not a flow) is answered
      // in the chat right away. An old refused block reopened later only
      // offers the button, so opening a chat never sends anything by itself.
      if (messageId && !reference.status && superflowShouldFallBackToChat(result.code, result.action)) {
        answerSuperflowInChat(messageId, reference.goal)
        return
      }
      updateSuperflowMessage(messageId, { status: "not-started" })
      return
    }
    setFlowId(result.data.flow.id)
    updateSuperflowMessage(messageId, { flowId: result.data.flow.id, projectId: result.data.flow.projectId, status: result.data.flow.status })
  }, [chatId, messageId, reference.clientRequestId, reference.goal, reference.status, reference.workspaceMode])

  useEffect(() => {
    if (flowId || startedRef.current) return
    startedRef.current = true
    void start()
  }, [flowId, start])

  const done = isFlowDone(flow)
  useEffect(() => {
    if (flow && done && reference.status !== flow.status) updateSuperflowMessage(messageId, { status: flow.status })
  }, [done, flow, messageId, reference.status])

  const now = useNow(Boolean(flow && !done))
  const progress = flowProgressOf(flow)
  const completed = flow?.tasks.filter((task) => task.status === "completed").length || 0
  const elapsed = flow ? (flow.finishedAt || now) - flow.createdAt : 0

  const cancel = async () => {
    if (!flow) return
    setBusy("cancel")
    await osFetch(`/api/os/flows/${flow.id}/cancel`, { method: "POST" })
    setBusy("")
    void refresh()
  }

  const retry = async (taskId?: string) => {
    if (!flow) return
    setBusy("retry")
    const result = await osFetch<{ flow: FlowView }>(`/api/os/flows/${flow.id}/retry`, { method: "POST", json: taskId ? { taskId } : {} })
    setBusy("")
    if (!result.ok) {
      setStartError({ message: result.message, action: result.action })
      return
    }
    // The event stream closed after "done"; open it again for the new run.
    reconnect()
  }

  const deliverables = useMemo(() => {
    if (!flow) return [] as ArtifactSummary[]
    const ids = flow.tasks.filter((task) => task.type !== "goal.understand" && task.type !== "result.assemble").flatMap((task) => task.artifactIds)
    return ids.map((id) => artifacts[id]).filter((item): item is ArtifactSummary => Boolean(item))
  }, [artifacts, flow])

  const brandName = useMemo(() => {
    const brand = deliverables.find((item) => item.sourceTool === "brand.create")
    return brand?.title.replace(/^Бренд\s+/, "") || ""
  }, [deliverables])

  if (startError && !flow) {
    return (
      <section className="malik-os-block" aria-label="Malik Superflow">
        <header className="malik-os-head">
          <div className="malik-os-title"><MalikMark />Malik Superflow</div>
        </header>
        <div className="malik-os-goal" style={{ whiteSpace: "normal" }}>{reference.goal}</div>
        <div className="malik-os-foot" style={{ borderTop: 0 }}>
          <span className="malik-os-note">{startError.message}</span>
          {startError.action === "sign-in" ? (
            <a className="malik-os-button is-primary" href="/login">Войти</a>
          ) : startError.action === "upgrade" ? null : (
            <button type="button" className="malik-os-button" onClick={() => { startedRef.current = false; void start() }}>Повторить</button>
          )}
          {messageId ? (
            <button type="button" className="malik-os-button is-primary" onClick={() => answerSuperflowInChat(messageId, reference.goal)}>Ответить в чате</button>
          ) : null}
        </div>
      </section>
    )
  }

  const tasks = flow?.tasks || []
  const failedCount = tasks.filter((task) => task.status === "failed" || (task.status === "cancelled" && task.error)).length

  return (
    <section className="malik-os-block" aria-label="Malik Superflow" aria-busy={!done}>
      <header className="malik-os-head">
        <div className="malik-os-title"><MalikMark />Malik Superflow</div>
        <div className="malik-os-meta">
          {flow ? <span>{formatDuration(elapsed)} · {completed}/{tasks.length}</span> : <span>запускаю…</span>}
          {flow && !done ? (
            <button type="button" className="malik-os-button" onClick={cancel} disabled={busy === "cancel"} aria-label="Остановить Superflow">
              <Square aria-hidden="true" />Стоп
            </button>
          ) : null}
        </div>
      </header>
      <div className="malik-os-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <i style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="malik-os-goal" title={reference.goal}>{reference.goal}</div>

      {!flow ? (
        <ul className="malik-os-rows" aria-live="polite">
          <li className="malik-os-row is-running">
            <span className="malik-os-icon"><Loader2 className="animate-spin" aria-hidden="true" /></span>
            <span className="malik-os-label"><strong>Составляю план задач</strong></span>
            <span />
          </li>
        </ul>
      ) : (
        <ol className="malik-os-rows" aria-live="polite">
          {tasks.map((task) => {
            const artifactId = task.status === "completed" ? task.artifactIds[0] : undefined
            const clickable = Boolean(artifactId)
            const duration = task.startedAt ? (task.finishedAt || now) - task.startedAt : 0
            const retryIn = task.status === "retrying" && task.retry.nextRetryAt ? Math.max(0, task.retry.nextRetryAt - now) : 0
            return (
              <li
                key={task.id}
                className={`malik-os-row is-${task.status}${clickable ? " is-clickable" : ""}`}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => setOpenArtifact(artifactId!) : undefined}
                onKeyDown={clickable ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenArtifact(artifactId!) } } : undefined}
                aria-label={`${task.label}: ${STATUS_WORD[task.status] || task.status}`}
              >
                <span className="malik-os-icon"><StatusIcon task={task} /></span>
                <span className="malik-os-label">
                  <strong>{task.label}</strong>
                  {task.provider === "demo-cache" ? <> <span className="malik-os-badge">сохранённая копия</span></> : null}
                  {task.status === "running" && task.activity ? <span className="malik-os-activity">{task.activity}</span> : null}
                  {task.status === "retrying" ? <span className="malik-os-activity">{task.error?.message || "Повторяю"}{retryIn ? ` · через ${Math.ceil(retryIn / 1000)} с` : ""}</span> : null}
                  {(task.status === "failed" || (task.status === "cancelled" && task.error && task.error.code !== "CANCELLED")) && task.error ? (
                    <span className="malik-os-error">{task.error.message}</span>
                  ) : null}
                </span>
                <span className="malik-os-time">
                  {task.status === "completed" || task.status === "running" ? formatDuration(duration) : null}
                  {clickable ? <ChevronRight aria-hidden="true" /> : null}
                  {task.status === "failed" && task.error?.retryable !== false && task.error?.action !== "upgrade" ? (
                    <button type="button" className="malik-os-button" disabled={Boolean(busy)} onClick={(event) => { event.stopPropagation(); void retry(task.id) }}>Повторить</button>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {done && deliverables.length ? (
        <div className="malik-os-result">
          <h3>{flow?.status === "completed" ? "Готово" : "Готово частично"}{brandName ? `: ${brandName}` : ""}</h3>
          <div className="malik-os-cards">
            {deliverables.map((item) => (
              <button key={item.id} type="button" className="malik-os-card" onClick={() => setOpenArtifact(item.id)}>
                <span className="malik-os-card-icon">
                  {item.kind === "image" && item.url ? <img src={item.url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : kindIcon(item.kind)}
                </span>
                <span className="malik-os-card-text">
                  <strong>{item.title}</strong>
                  <span>{fallbackLabel(item) || [KIND_WORD[item.kind] || item.kind, typeof item.validation?.score === "number" ? `проверка ${item.validation.score}/100` : ""].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <WorkJournal events={flow?.events || []} />
      <footer className="malik-os-foot">
        {error ? <span className="malik-os-note">{error}</span> : null}
        {startError && flow ? <span className="malik-os-note" role="alert">{startError.message}</span> : null}
        {flow?.interrupted ? <span className="malik-os-note">Работа прервалась при перезапуске сервера.</span> : null}
        {done && failedCount ? (
          <button type="button" className="malik-os-button" disabled={Boolean(busy)} onClick={() => void retry()}>
            <RotateCw aria-hidden="true" />{flow?.interrupted ? "Продолжить" : "Повторить неудавшиеся"}
          </button>
        ) : null}
        {flow?.status === "cancelled" && !failedCount ? <span className="malik-os-note">Остановлено.</span> : null}
        <button type="button" className="malik-os-button" onClick={() => openOs("tasks")} style={{ marginLeft: "auto" }}>Все задачи</button>
      </footer>

      {openArtifact ? <ArtifactViewer artifactId={openArtifact} onClose={() => setOpenArtifact(null)} /> : null}
    </section>
  )
}
