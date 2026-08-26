export type UsageEventType = "chat" | "upload" | "video" | "image"

const memoryCache = new Map<string, number>()

function cacheKey(userId: string, eventType: UsageEventType) {
  return `${new Date().toISOString().slice(0, 10)}:${userId}:${eventType}`
}

export async function resolveAuthUserUuid(userId: string): Promise<string | null> {
  const value = userId.trim()
  return value && value !== "guest" ? value : null
}

export async function getPersistedUsage(userId: string, eventType: UsageEventType): Promise<number> {
  return memoryCache.get(cacheKey(userId, eventType)) || 0
}

export async function incrementPersistedUsage(userId: string, eventType: UsageEventType, delta = 1) {
  const key = cacheKey(userId, eventType)
  memoryCache.set(key, (memoryCache.get(key) || 0) + delta)
}
