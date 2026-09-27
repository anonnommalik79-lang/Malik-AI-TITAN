/**
 * Performance budget: real timings of real runs, compared with the budget
 * each step should meet. Nothing here is estimated — an empty sample says
 * "no data yet".
 */

export type PerfMetric =
  | "flow.total"
  | "flow.first-task"
  | `tool.${string}`

export const PERF_BUDGETS_MS: Record<string, number> = {
  "flow.first-task": 2_000,
  "flow.total": 600_000,
  "tool.goal.understand": 45_000,
  "tool.research.web": 90_000,
  "tool.brand.create": 60_000,
  "tool.image.generate": 90_000,
  "tool.business.plan": 180_000,
  "tool.site.generate": 180_000,
  "tool.presentation.generate": 300_000,
  "tool.video.script": 90_000,
  "tool.document.write": 150_000,
  "tool.code.project": 420_000,
  "tool.data.analyze": 90_000,
  "tool.artifact.edit": 120_000,
  "tool.result.assemble": 5_000,
}

type Sample = { ms: number; ok: boolean; at: number }

type PerfGlobal = typeof globalThis & { __malikOsPerf?: Map<string, Sample[]> }

const MAX_SAMPLES = 200

function samples() {
  const scope = globalThis as PerfGlobal
  if (!scope.__malikOsPerf) scope.__malikOsPerf = new Map()
  return scope.__malikOsPerf
}

export function recordPerf(metric: PerfMetric, ms: number, ok = true, at = Date.now()) {
  if (!Number.isFinite(ms) || ms < 0) return
  const list = samples().get(metric) || []
  list.push({ ms: Math.round(ms), ok, at })
  if (list.length > MAX_SAMPLES) list.splice(0, list.length - MAX_SAMPLES)
  samples().set(metric, list)
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export type PerfRow = {
  metric: string
  budgetMs: number | null
  count: number
  successRate: number | null
  p50: number | null
  p95: number | null
  withinBudget: boolean | null
}

export function perfReport(): PerfRow[] {
  const metrics = new Set([...Object.keys(PERF_BUDGETS_MS), ...samples().keys()])
  return [...metrics].sort().map((metric) => {
    const list = samples().get(metric) || []
    const times = list.filter((sample) => sample.ok).map((sample) => sample.ms)
    const budget = PERF_BUDGETS_MS[metric] ?? null
    const p95 = times.length ? percentile(times, 95) : null
    return {
      metric,
      budgetMs: budget,
      count: list.length,
      successRate: list.length ? Math.round((list.filter((sample) => sample.ok).length / list.length) * 100) / 100 : null,
      p50: times.length ? percentile(times, 50) : null,
      p95,
      withinBudget: budget !== null && p95 !== null ? p95 <= budget : null,
    }
  })
}

export function resetPerf() {
  samples().clear()
}
