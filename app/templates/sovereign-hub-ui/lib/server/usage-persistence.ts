export type UsageEventType = "chat" | "upload" | "video" | "image"

type MalikPersistedUsageGlobal = typeof globalThis & {
  __malikPersistedUsageMemory?: Map<string, number>
}

function usageCache() {
  const scope = globalThis as MalikPersistedUsageGlobal
  if (!scope.__malikPersistedUsageMemory) scope.__malikPersistedUsageMemory = new Map<string, number>()
  return scope.__malikPersistedUsageMemory
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function cacheKey(userId: string, eventType: UsageEventType) {
  return `${today()}:${userId}:${eventType}`
}

export async function resolveAuthUserUuid(userId: string): Promise<string | null> {
  const value = userId.trim()
  return value && value !== "guest" ? value : null
}

export async function getPersistedUsage(userId: string, eventType: UsageEventType): Promise<number> {
  return usageCache().get(cacheKey(userId, eventType)) || 0
}

export async function incrementPersistedUsage(userId: string, eventType: UsageEventType, delta = 1) {
  const store = usageCache()
  const key = cacheKey(userId, eventType)
  store.set(key, (store.get(key) || 0) + delta)
}

export function getPersistedUsageOverview() {
  const date = today()
  const prefix = `${date}:`
  const totals: Record<UsageEventType, number> = { chat: 0, upload: 0, video: 0, image: 0 }
  const users = new Set<string>()

  for (const [key, value] of usageCache().entries()) {
    if (!key.startsWith(prefix)) continue
    const rest = key.slice(prefix.length)
    const separator = rest.lastIndexOf(":")
    if (separator < 0) continue
    const userId = rest.slice(0, separator)
    const eventType = rest.slice(separator + 1) as UsageEventType
    if (!(eventType in totals)) continue
    totals[eventType] += Number(value) || 0
    if (userId && userId !== "guest") users.add(userId)
  }

  return {
    date,
    userCount: users.size,
    chatCount: totals.chat,
    uploadCount: totals.upload,
    videoCount: totals.video,
    imageCount: totals.image,
  }
}
