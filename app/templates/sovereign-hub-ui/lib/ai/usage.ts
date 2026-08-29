import type { AIPlan, AITaskType } from "./types"

export type UsageSnapshot = {
  userId: string
  plan: AIPlan
  date: string
  chatCount: number
  imageCount: number
  videoCount: number
  projectCount: number
  tokensUsed: number
}

type MalikUsageGlobal = typeof globalThis & {
  __malikUsageMemory?: Map<string, UsageSnapshot>
}

function usageStore() {
  const scope = globalThis as MalikUsageGlobal
  if (!scope.__malikUsageMemory) scope.__malikUsageMemory = new Map<string, UsageSnapshot>()
  return scope.__malikUsageMemory
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function key(userId: string) {
  return `${userId}:${today()}`
}

export function getUsage(userId = "guest", plan: AIPlan = "free"): UsageSnapshot {
  const store = usageStore()
  const existing = store.get(key(userId))
  if (existing) return existing

  const initial: UsageSnapshot = {
    userId,
    plan,
    date: today(),
    chatCount: 0,
    imageCount: 0,
    videoCount: 0,
    projectCount: 0,
    tokensUsed: 0,
  }

  store.set(key(userId), initial)
  return initial
}

export function incrementUsage(userId: string, plan: AIPlan, task: AITaskType, tokens = 0) {
  const store = usageStore()
  const current = getUsage(userId, plan)
  if (task === "image") current.imageCount += 1
  else if (task === "video") current.videoCount += 1
  else if (task === "project") current.projectCount += 1
  else current.chatCount += 1

  current.tokensUsed += Math.max(0, Number(tokens) || 0)
  store.set(key(userId), current)
  return current
}

export function getUsageOverview() {
  const date = today()
  const snapshots = Array.from(usageStore().values()).filter((item) => item.date === date)
  const totals = snapshots.reduce(
    (acc, item) => {
      acc.chatCount += item.chatCount
      acc.imageCount += item.imageCount
      acc.videoCount += item.videoCount
      acc.projectCount += item.projectCount
      acc.tokensUsed += item.tokensUsed
      return acc
    },
    { chatCount: 0, imageCount: 0, videoCount: 0, projectCount: 0, tokensUsed: 0 },
  )

  return {
    date,
    userCount: snapshots.length,
    ...totals,
    topUsers: snapshots
      .filter((item) => item.userId && item.userId !== "guest")
      .sort((left, right) => right.tokensUsed - left.tokensUsed || right.chatCount - left.chatCount)
      .slice(0, 12)
      .map((item) => ({
        userId: item.userId,
        tokensUsed: item.tokensUsed,
        chatCount: item.chatCount,
        imageCount: item.imageCount,
        videoCount: item.videoCount,
        projectCount: item.projectCount,
      })),
  }
}
