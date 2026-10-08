export type WorkWindow = { limit: number | null; used: number; remaining: number | null; resetAt: string | null }
export type WorkQuotaWindows = { fiveHour: WorkWindow; weekly: WorkWindow }
export type WorkUsageEvent = { id: string; at: number }

const FIVE_HOURS = 5 * 60 * 60 * 1000
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

/** Rolling windows are based on accepted requests, not calendar resets. */
export function evaluateWorkQuota(
  input: WorkUsageEvent[],
  limits: { fiveHour: number | null; weekly: number | null },
  now = Date.now(),
): WorkQuotaWindows {
  const events = input.filter((event) => event && Number.isFinite(event.at) && event.at <= now && event.at > now - SEVEN_DAYS)
  const windowFor = (duration: number, limit: number | null): WorkWindow => {
    if (limit === null) return { limit: null, used: 0, remaining: null, resetAt: null }
    const active = events.filter((event) => event.at > now - duration)
    const oldest = active.reduce((value, event) => Math.min(value, event.at), Number.POSITIVE_INFINITY)
    return {
      limit,
      used: active.length,
      remaining: Math.max(0, limit - active.length),
      resetAt: Number.isFinite(oldest) ? new Date(oldest + duration).toISOString() : null,
    }
  }
  return { fiveHour: windowFor(FIVE_HOURS, limits.fiveHour), weekly: windowFor(SEVEN_DAYS, limits.weekly) }
}
