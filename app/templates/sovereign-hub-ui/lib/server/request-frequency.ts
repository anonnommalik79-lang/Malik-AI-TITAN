/** Operational endpoints have a separate minute budget, not the AI chat quota. */
const buckets = new Map<string, { count: number; until: number }>()
export function takeRequestFrequency(scope: string, ownerId: string, limit: number, now = Date.now()) {
  for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key)
  const key = `${scope}:${ownerId}`
  const current = buckets.get(key)
  if (current && current.count >= limit) return false
  if (!current && buckets.size >= 10000) return false
  buckets.set(key, { count: (current?.count || 0) + 1, until: current?.until || now + 60000 })
  return true
}
