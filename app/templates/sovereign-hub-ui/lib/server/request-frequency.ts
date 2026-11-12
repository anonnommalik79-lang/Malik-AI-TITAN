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
