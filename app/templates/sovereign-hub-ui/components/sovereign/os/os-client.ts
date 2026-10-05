"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { humanizeError } from "@/lib/os/failures"
import type { ArtifactSummary, OsError, TaskStatus, WorkEvent } from "@/lib/os/types"

/**
 * The browser side of Malik AI OS: typed calls to /api/os/*, a live flow
 * hook (Server-Sent Events with a polling fallback), and the reference a
 * chat message keeps to its flow. Errors always arrive as one human
 * sentence — never "Load failed".
 */

export type SuperflowRef = {
  workspaceMode?: "chat" | "work"
  clientRequestId: string
  goal: string
  flowId?: string
  status?: string
  projectId?: string
}

export type TaskView = {
  id: string
  type: string
  label: string
  activity?: string
  status: TaskStatus
  progress: number
  dependencies: string[]
  startedAt?: number
  finishedAt?: number
  artifactIds: string[]
  error?: OsError
  retry: { attempts: number; maxAttempts: number; nextRetryAt?: number }
  provider?: string
  optional?: boolean
}

export type FlowView = {
  events?: WorkEvent[]
  id: string
  projectId: string
  goal: string
  status: "planned" | "running" | "completed" | "partial" | "failed" | "cancelled"
  createdAt: number
  updatedAt: number
  finishedAt?: number
  clientRequestId: string
  chatId?: string
  quality: string
  capabilities: string[]
  demo?: boolean
  interrupted?: boolean
  tasks: TaskView[]
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string; action?: string }

export const SUPERFLOW_UPDATE_EVENT = "malik-superflow-update"
export const OS_OPEN_EVENT = "malik-os-open"

export function newRequestId(prefix = "sf") {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `${prefix}_${random.slice(0, 24)}`
}

export async function osFetch<T>(path: string, init: RequestInit & { json?: unknown; timeoutMs?: number; context?: Parameters<typeof humanizeError>[1] } = {}): Promise<ApiResult<T>> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), init.timeoutMs || 30_000)
  const signal = init.signal
  signal?.addEventListener("abort", () => controller.abort(), { once: true })
  try {
    const response = await fetch(path, {
      ...init,
      body: init.json === undefined ? init.body : JSON.stringify(init.json),
      headers: init.json === undefined ? init.headers : { "content-type": "application/json", ...(init.headers || {}) },
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data || data.ok === false) {
      const message = typeof data?.error === "string" && data.error.length < 300 && !/load failed|failed to fetch/i.test(data.error)
        ? data.error
        : humanizeError({ status: response.status, message: String(data?.error || response.statusText) }, init.context || "general").message
      return { ok: false, status: response.status, code: String(data?.code || `HTTP_${response.status}`), message, action: data?.action }
    }
    return { ok: true, data: data as T }
  } catch (error) {
    const human = humanizeError(error, init.context || "general")
    return { ok: false, status: 0, code: human.code, message: human.message, action: human.action }
  } finally {
    window.clearTimeout(timer)
  }
}

export function openOs(tab: "tasks" | "library" | "data" | "plugins" | "health" = "tasks") {
  window.dispatchEvent(new CustomEvent(OS_OPEN_EVENT, { detail: { tab } }))
}

export function updateSuperflowMessage(messageId: string, patch: Partial<SuperflowRef>) {
  window.dispatchEvent(new CustomEvent(SUPERFLOW_UPDATE_EVENT, { detail: { messageId, patch } }))
}

const TERMINAL = new Set(["completed", "partial", "failed", "cancelled"])

export function isFlowDone(flow: FlowView | null) {
  return Boolean(flow && TERMINAL.has(flow.status) && flow.finishedAt)
}

/**
 * A flow, live. Opens the event stream; if the stream cannot be kept (a
 * proxy that buffers, a phone that sleeps), falls back to polling every few
 * seconds until the flow is finished. Reconnects on visibility.
 */
export function useLiveFlow(flowId: string | undefined) {
  const [flow, setFlow] = useState<FlowView | null>(null)
  const [artifacts, setArtifacts] = useState<Record<string, ArtifactSummary>>({})
  const [error, setError] = useState("")
  const flowRef = useRef<FlowView | null>(null)
  const [tick, setTick] = useState(0)

  const apply = useCallback((next: FlowView) => {
    flowRef.current = next
    setFlow(next)
  }, [])

  const refresh = useCallback(async () => {
    if (!flowId) return null
    const result = await osFetch<{ flow: FlowView; artifacts: ArtifactSummary[] }>(`/api/os/flows/${flowId}`)
    if (result.ok) {
      apply(result.data.flow)
      setArtifacts((previous) => ({ ...previous, ...Object.fromEntries(result.data.artifacts.map((item) => [item.id, item])) }))
      setError("")
      return result.data.flow
    }
    if (result.status === 404) setError("Задача не найдена — возможно, она была в другом аккаунте.")
    else setError(result.message)
    return null
  }, [apply, flowId])

  useEffect(() => {
    if (!flowId) return
    let closed = false
    let source: EventSource | null = null
    let poll: number | null = null

    const startPolling = () => {
      if (poll !== null || closed) return
      const run = async () => {
        const current = await refresh()
        if (closed) return
        if (isFlowDone(current)) return
        poll = window.setTimeout(() => {
          poll = null
          void run()
        }, document.visibilityState === "visible" ? 2_500 : 8_000)
      }
      void run()
    }

    try {
      source = new EventSource(`/api/os/flows/${flowId}/events`, { withCredentials: true })
      source.addEventListener("snapshot", (event) => {
        const data = JSON.parse((event as MessageEvent).data)
        if (data.flow) apply(data.flow)
        if (Array.isArray(data.artifacts)) setArtifacts((previous) => ({ ...previous, ...Object.fromEntries(data.artifacts.map((item: ArtifactSummary) => [item.id, item])) }))
        setError("")
      })
      source.addEventListener("task", (event) => {
        const data = JSON.parse((event as MessageEvent).data)
        const current = flowRef.current
        if (!current || !data.task) return
        apply({ ...current, status: data.status || current.status, updatedAt: Date.now(), tasks: current.tasks.map((task) => (task.id === data.task.id ? data.task : task)) })
      })
      source.addEventListener("artifact", (event) => {
        const data = JSON.parse((event as MessageEvent).data)
        if (data.artifact?.id) setArtifacts((previous) => ({ ...previous, [data.artifact.id]: data.artifact }))
      })
      source.addEventListener("work", (event) => {
        const entry = JSON.parse((event as MessageEvent).data) as WorkEvent
        const current = flowRef.current
        if (!current || !entry.id || (current.events || []).some((item) => item.id === entry.id)) return
        apply({ ...current, events: [...(current.events || []), entry].slice(-200) })
      })
      source.addEventListener("done", () => {
        source?.close()
        source = null
        // One final read so status, times and every artifact are exact.
        void refresh()
      })
      source.onerror = () => {
        source?.close()
        source = null
        if (!closed && !isFlowDone(flowRef.current)) startPolling()
      }
    } catch {
      startPolling()
    }

    const onVisible = () => {
      if (document.visibilityState === "visible" && !isFlowDone(flowRef.current)) void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      closed = true
      source?.close()
      if (poll !== null) window.clearTimeout(poll)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [apply, flowId, refresh, tick])

  const reconnect = useCallback(() => setTick((value) => value + 1), [])
  return { flow, artifacts, error, refresh, reconnect }
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return ""
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} с`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes} мин ${rest} с` : `${minutes} мин`
}

export function flowProgressOf(flow: FlowView | null) {
  if (!flow?.tasks.length) return 0
  const done = flow.tasks.reduce((total, task) => total + (TERMINAL.has(task.status) ? 1 : Math.max(0, Math.min(1, task.progress || 0))), 0)
  return done / flow.tasks.length
}
