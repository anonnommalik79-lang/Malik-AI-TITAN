import "server-only"

import { randomUUID } from "node:crypto"

const TRACE_RE = /^[a-zA-Z0-9._:-]{8,96}$/

function safeTraceId(value: string | null | undefined) {
  const raw = String(value || "").trim()
  return TRACE_RE.test(raw) ? raw : ""
}

export type GodTrace = {
  traceId: string
  diagnosticId: string
  startedAt: number
}

export function createGodTrace(request?: Request): GodTrace {
  const supplied = safeTraceId(
    request?.headers.get("x-malik-trace-id")
      || request?.headers.get("x-malik-request-id"),
  )
  const traceId = supplied || `malik-${randomUUID()}`
  return {
    traceId,
    diagnosticId: traceId.replace(/[^a-zA-Z0-9]/g, "").slice(-10) || randomUUID().slice(0, 10),
    startedAt: Date.now(),
  }
}

export function withGodTraceHeaders(
  response: Response,
  trace: GodTrace,
  options: { durationMs?: number; operation?: string; budgetMs?: number } = {},
) {
  const headers = new Headers(response.headers)
  headers.set("X-Malik-Trace-Id", trace.traceId)
  headers.set("X-Malik-Diagnostic-Id", trace.diagnosticId)

  const durationMs = Number.isFinite(options.durationMs)
    ? Math.max(0, Math.round(options.durationMs as number))
    : Math.max(0, Date.now() - trace.startedAt)

  headers.set("X-Malik-Duration-Ms", String(durationMs))
  if (options.operation) headers.set("X-Malik-Operation", options.operation)
  if (Number.isFinite(options.budgetMs)) {
    const budget = Math.max(1, Math.round(options.budgetMs as number))
    headers.set("X-Malik-Budget-Ms", String(budget))
    headers.set("X-Malik-Budget", durationMs <= budget ? "ok" : "slow")
  }
  headers.append("Server-Timing", `malik;dur=${durationMs}`)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
