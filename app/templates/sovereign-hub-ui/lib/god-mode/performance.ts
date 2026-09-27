import "server-only"

import type { PerformanceSample } from "./contracts"

const MAX_SAMPLES_PER_OPERATION = 200

const DEFAULT_BUDGETS: Record<string, number> = {
  "generation-gateway": 300_000,
  "provider-status": 2_500,
  "project-state": 1_500,
  "health": 1_500,
  "chat-first-event": 3_000,
}

type PerformanceGlobal = typeof globalThis & {
  __malikGodPerformance?: Map<string, PerformanceSample[]>
}

function store() {
  const scope = globalThis as PerformanceGlobal
  if (!scope.__malikGodPerformance) scope.__malikGodPerformance = new Map()
  return scope.__malikGodPerformance
}

export function performanceBudgetMs(operation: string) {
  const key = String(operation || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")
  const override = Number(process.env[`MALIK_PERF_BUDGET_${key}_MS`])
  if (Number.isFinite(override) && override >= 50) return Math.floor(override)
  return DEFAULT_BUDGETS[operation] || 10_000
}

export function recordPerformance(sample: PerformanceSample) {
  const operation = String(sample.operation || "unknown").slice(0, 80)
  const list = store().get(operation) || []
  list.push({
    operation,
    durationMs: Math.max(0, Math.round(sample.durationMs)),
    ok: Boolean(sample.ok),
    at: Number.isFinite(sample.at) ? sample.at : Date.now(),
    traceId: sample.traceId,
  })
  if (list.length > MAX_SAMPLES_PER_OPERATION) list.splice(0, list.length - MAX_SAMPLES_PER_OPERATION)
  store().set(operation, list)
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

export function performanceSnapshot() {
  return [...store().entries()].map(([operation, samples]) => {
    const durations = samples.map((item) => item.durationMs)
    const successful = samples.filter((item) => item.ok).length
    const budgetMs = performanceBudgetMs(operation)
    const averageMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
    const p95Ms = Math.round(percentile(durations, 0.95))
    return {
      operation,
      samples: samples.length,
      successRate: samples.length ? Number((successful / samples.length).toFixed(4)) : 0,
      averageMs,
      p95Ms,
      budgetMs,
      withinBudget: p95Ms <= budgetMs,
    }
  }).sort((a, b) => a.operation.localeCompare(b.operation))
}

export async function measureOperation<T>(
  operation: string,
  run: () => Promise<T>,
  traceId?: string,
): Promise<T> {
  const startedAt = Date.now()
  try {
    const result = await run()
    recordPerformance({ operation, durationMs: Date.now() - startedAt, ok: true, at: Date.now(), traceId })
    return result
  } catch (error) {
    recordPerformance({ operation, durationMs: Date.now() - startedAt, ok: false, at: Date.now(), traceId })
    throw error
  }
}
