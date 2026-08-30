import type { AITaskType, AIPlan } from "@/lib/ai/types"
import { canBypassLimits, isDevBypassEnabled, type AdminUserLike } from "@/lib/ai/admin-bypass"
import { getUsage, incrementUsage as incrementCoreUsage } from "@/lib/ai/usage"
import { getPersistedUsage, incrementPersistedUsage, type UsageEventType } from "@/lib/server/usage-persistence"
import { resolveUserTier } from "./user-plan"
import { getTierLimits, nextResetAt, type LimitKind } from "./usage-limits"

const uploadCounters = new Map<string, number>()
const minuteBuckets = new Map<string, { count: number; resetAt: number }>()
const MAX_RUNTIME_BUCKETS = 10_000
let lastCleanupAt = 0

function currentDay() {
  return new Date().toISOString().slice(0, 10)
}

function dayKey(userId: string) {
  return currentDay() + ":" + userId
}

function cleanupRuntimeCounters(now = Date.now()) {
  // At most once a minute; keeps long-running Render instances bounded.
  if (now - lastCleanupAt < 60_000 && minuteBuckets.size < MAX_RUNTIME_BUCKETS && uploadCounters.size < MAX_RUNTIME_BUCKETS) return
  lastCleanupAt = now

  for (const [key, bucket] of minuteBuckets) {
    if (bucket.resetAt <= now) minuteBuckets.delete(key)
  }

  const todayPrefix = currentDay() + ":"
  for (const key of uploadCounters.keys()) {
    if (!key.startsWith(todayPrefix)) uploadCounters.delete(key)
  }

  if (minuteBuckets.size > MAX_RUNTIME_BUCKETS) {
    const overflow = minuteBuckets.size - MAX_RUNTIME_BUCKETS
    let removed = 0
    for (const key of minuteBuckets.keys()) {
      minuteBuckets.delete(key)
      removed += 1
      if (removed >= overflow) break
    }
  }
}

function category(task: AITaskType): LimitKind {
  if (task === "image" || task === "file_analysis") return "upload"
  if (task === "video") return "video"
  return "chat"
}

export function getUploadUsage(userId: string) {
  cleanupRuntimeCounters()
  return uploadCounters.get(dayKey(userId)) || 0
}

export function incrementUploadUsage(userId: string, count = 1) {
  cleanupRuntimeCounters()
  const key = dayKey(userId)
  uploadCounters.set(key, Math.max(0, getUploadUsage(userId) + Math.max(0, count)))
}

export function checkPromptLength(prompt: string, tier: ReturnType<typeof resolveUserTier>) {
  const max = getTierLimits(tier).maxPromptChars
  if (prompt.length <= max) return { ok: true as const, max }
  return {
    ok: false as const,
    max,
    error: `Prompt too long (${prompt.length}/${max} chars).`,
    code: "PROMPT_TOO_LONG",
  }
}

function taskToEvent(task: AITaskType): UsageEventType {
  if (task === "image") return "image"
  if (task === "video") return "video"
  if (task === "file_analysis") return "upload"
  return "chat"
}

export async function checkUsageLimit(input: {
  userId?: string
  plan?: AIPlan
  task: AITaskType
  user?: AdminUserLike | string | null
  uploadCount?: number
}) {
  cleanupRuntimeCounters()
  const userId = input.userId || "guest"
  const trustedUser = typeof input.user === "object" && input.user ? input.user : null

  if ((trustedUser && canBypassLimits(trustedUser)) || isDevBypassEnabled()) {
    return { ok: true, bypass: true, code: "BYPASS_ACTIVE", remaining: 999999, resetAt: nextResetAt(), plan: "owner" }
  }

  const tier = resolveUserTier(userId, input.plan || "free")
  const limits = getTierLimits(tier)
  const kind = category(input.task)
  const usage = getUsage(userId, input.plan || "free")
  const persisted = await getPersistedUsage(userId, taskToEvent(input.task))

  const usedChat = Math.max(usage.chatCount, input.task === "chat" ? persisted : 0)
  const usedUpload = Math.max(getUploadUsage(userId), input.task === "file_analysis" ? persisted : 0) + Math.max(0, input.uploadCount || 0)
  const usedVideo = input.task === "video" ? Math.max(usage.videoCount, persisted) : usage.videoCount

  if (kind === "chat" && usedChat >= limits.chat) {
    return { ok: false, code: "DAILY_LIMIT_REACHED", error: "Daily limit reached", resetAt: nextResetAt(), plan: tier, remaining: 0 }
  }
  if ((kind === "upload" || input.uploadCount) && usedUpload >= limits.upload) {
    return { ok: false, code: "DAILY_LIMIT_REACHED", error: "Daily upload limit reached", resetAt: nextResetAt(), plan: tier, remaining: 0 }
  }
  if (kind === "video" && limits.video <= 0) {
    return { ok: false, code: "VIDEO_NOT_ALLOWED", error: "Video not available on current plan", resetAt: nextResetAt(), plan: tier, remaining: 0 }
  }
  if (kind === "video" && usedVideo >= limits.video) {
    return { ok: false, code: "DAILY_LIMIT_REACHED", error: "Daily video limit reached", resetAt: nextResetAt(), plan: tier, remaining: 0 }
  }

  const bucketKey = `${userId}:${kind}`
  const now = Date.now()
  const minuteLimit = tier === "guest" ? 8 : tier === "free" ? 20 : tier === "premium" ? 60 : 600
  const current = minuteBuckets.get(bucketKey)
  if (!current || current.resetAt <= now) {
    minuteBuckets.set(bucketKey, { count: 1, resetAt: now + 60_000 })
  } else if (current.count >= minuteLimit) {
    return { ok: false, code: "RATE_LIMIT_REACHED", error: "Too many requests. Please slow down.", resetAt: new Date(current.resetAt).toISOString(), plan: tier, remaining: 0 }
  } else {
    current.count += 1
  }

  const remaining = kind === "upload"
    ? limits.upload - usedUpload - 1
    : kind === "video"
      ? limits.video - usedVideo - 1
      : limits.chat - usedChat - 1
  return { ok: true, bypass: false, remaining: Math.max(0, remaining), resetAt: nextResetAt(), plan: tier }
}

export async function recordChatUsage(userId: string, plan: AIPlan, task: AITaskType, tokens = 0) {
  incrementCoreUsage(userId, plan, task, Math.max(0, tokens))
  await incrementPersistedUsage(userId, taskToEvent(task))
}
