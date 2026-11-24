import { durablePostgresConfigured, incrementPostgresQuota, sweepPostgresQuotas } from "@/lib/server/durable-postgres"

/** Operational endpoints have a separate minute budget, not the AI chat quota. */
const buckets = new Map<string, { count: number; until: number }>()
let lastSweepAt = 0
export function takeRequestFrequency(scope: string, ownerId: string, limit: number, now = Date.now()) {
  // Avoid an O(active-users) scan on every request. An expired bucket for
  // the current user is always handled immediately, even between sweeps.
  if (now < lastSweepAt || now - lastSweepAt >= 30_000 || buckets.size >= 10_000) {
    for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key)
    lastSweepAt = now
  }
  const key = `${scope}:${ownerId}`
  const existing = buckets.get(key)
  const current = existing && existing.until > now ? existing : undefined
  if (existing && !current) buckets.delete(key)
  if (current && current.count >= limit) return false
  if (!current && buckets.size >= 10000) return false
  buckets.set(key, { count: (current?.count || 0) + 1, until: current?.until || now + 60000 })
  return true
}

/** Sensitive endpoints fail closed when the configured shared counter is unavailable. */
export async function takeSharedRequestFrequency(scope: string, ownerId: string, limit: number) {
  if (!durablePostgresConfigured()) return takeRequestFrequency(scope, ownerId, limit)
  try {
    const allowed = await incrementPostgresQuota("minute:" + scope + ":" + ownerId, Math.floor(Date.now() / 60_000), 1, limit)
    sweepPostgresQuotas()
    return allowed
  } catch {
    return false
  }
}
