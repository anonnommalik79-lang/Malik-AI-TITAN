import type { AIPlan, AITaskType } from "./types"
import { canBypassLimits, getUserPlan, isDevBypassEnabled, type AdminUserLike } from "./admin-bypass"
import { getUsage } from "./usage"

const DAILY_LIMITS: Record<AIPlan, Record<"chat" | "image" | "video" | "project", number>> = {
  free: { chat: 15, image: 1, video: 0, project: 2 },
  pro: { chat: 300, image: 25, video: 5, project: 30 },
  ultra: { chat: 1000, image: 100, video: 20, project: 100 },
  owner: { chat: 999999, image: 999999, video: 999999, project: 999999 },
}

const minuteBuckets = new Map<string, { count: number; resetAt: number }>()

function category(task: AITaskType): "chat" | "image" | "video" | "project" {
  if (task === "image") return "image"
  if (task === "video") return "video"
  if (task === "project") return "project"
  return "chat"
}

export function checkRateLimit(input: { userId?: string; ip?: string; plan?: AIPlan; task: AITaskType; user?: AdminUserLike | string | null }) {
  const userId = input.userId || input.ip || (typeof input.user === "string" ? input.user : input.user?.email || input.user?.userEmail) || "guest"
  const trustedUser = typeof input.user === "object" && input.user ? input.user : null

  if ((trustedUser && canBypassLimits(trustedUser)) || isDevBypassEnabled()) {
    return {
      ok: true,
      bypass: true,
      code: "BYPASS_ACTIVE",
      message: "Admin/dev bypass active.",
      remaining: 999999,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  const plan = input.plan || (trustedUser ? getUserPlan(trustedUser) : "free")
  const taskCategory = category(input.task)
  const usage = getUsage(userId, plan)
  const dailyLimit = DAILY_LIMITS[plan][taskCategory]
  const used =
    taskCategory === "image" ? usage.imageCount :
    taskCategory === "video" ? usage.videoCount :
    taskCategory === "project" ? usage.projectCount :
    usage.chatCount

  if (used >= dailyLimit) {
    return {
      ok: false,
      bypass: false,
      code: "DAILY_LIMIT_REACHED",
      message: "Daily limit reached. Upgrade plan or try again tomorrow.",
      remaining: 0,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  const bucketKey = `${userId}:${taskCategory}`
  const now = Date.now()
  const current = minuteBuckets.get(bucketKey)
  const minuteLimit = plan === "free" ? 20 : plan === "pro" ? 120 : 600

  if (!current || current.resetAt <= now) {
    minuteBuckets.set(bucketKey, { count: 1, resetAt: now + 60_000 })
    return { ok: true, bypass: false, remaining: dailyLimit - used - 1, resetAt: usage.date }
  }

  if (current.count >= minuteLimit) {
    return {
      ok: false,
      bypass: false,
      code: "RATE_LIMIT_REACHED",
      message: "Too many requests. Please slow down.",
      remaining: 0,
      resetAt: new Date(current.resetAt).toISOString(),
    }
  }

  current.count += 1
  return { ok: true, bypass: false, remaining: dailyLimit - used - 1, resetAt: usage.date }
}

