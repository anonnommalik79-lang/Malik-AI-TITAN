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

const usageMemory = new Map<string, UsageSnapshot>()

function today() {
  return new Date().toISOString().slice(0, 10)
}

function key(userId: string) {
  return `${userId}:${today()}`
}

export function getUsage(userId = "guest", plan: AIPlan = "free"): UsageSnapshot {
  const existing = usageMemory.get(key(userId))
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

  usageMemory.set(key(userId), initial)
  return initial
}

export function incrementUsage(userId: string, plan: AIPlan, task: AITaskType, tokens = 0) {
  const current = getUsage(userId, plan)
  if (task === "image") current.imageCount += 1
  else if (task === "video") current.videoCount += 1
  else if (task === "project") current.projectCount += 1
  else current.chatCount += 1

  current.tokensUsed += tokens
  usageMemory.set(key(userId), current)
  return current
}

