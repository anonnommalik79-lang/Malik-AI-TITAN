import type { FreshnessIntent } from "../ai/freshness-intent"

/** Provider filters narrow retrieval; only actual publication/event dates prove freshness. */
export function searchTimeFilters(intent: FreshnessIntent): {
  serper: { tbs?: string }; tavily: { time_range?: "day" | "week" | "month" | "year"; topic?: "news" }; brave?: string
} {
  if (!intent.needsSearch || intent.historical || !intent.window) return { serper: {}, tavily: {} }
  const from = Date.parse(intent.window.from), to = Date.parse(intent.checkedAt)
  const days = Math.max(0, (to - from) / 86400000)
  if (!Number.isFinite(days)) return { serper: {}, tavily: {} }
  // A whole 'yesterday' can begin more than 24 hours before the check. Retrieve
  // a broad enough provider period, then enforce the precise window locally.
  const period = days <= 1 ? "day" : days <= 7 ? "week" : days <= 31 ? "month" : "year"
  const short = { day: "d", week: "w", month: "m", year: "y" }[period]
  return {
    serper: { tbs: `qdr:${short}` }, tavily: { time_range: period, ...(intent.news ? { topic: "news" as const } : {}) },
    brave: `${intent.window.from.slice(0, 10)}to${intent.window.to.slice(0, 10)}`,
  }
}

export function datedNewsQuery(query: string, intent: FreshnessIntent): string {
  if (!intent.window || intent.historical) return query
  const until = new Date(Date.parse(intent.window.to) + 86400000).toISOString().slice(0, 10)
  return `${query} after:${intent.window.from.slice(0, 10)} before:${until}`
}
