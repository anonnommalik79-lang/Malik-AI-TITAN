import type { AIPlan, AITaskType } from "./types"
import { canBypassLimits, getBypassStatus, getUserPlan, shouldShowPaywall, type AdminUserLike } from "./admin-bypass"

export type UsageKind = "chat" | "image" | "video" | "project"

export type UserUsage = {
  userId: string
  plan: AIPlan
  date: string
  chat: number
  image: number
  video: number
  project: number
  updatedAt: string
}

export const PLAN_LIMITS: Record<AIPlan, Record<UsageKind, number>> = {
  free: { chat: 15, image: 1, video: 0, project: 2 },
  pro: { chat: 300, image: 25, video: 5, project: 30 },
  ultra: { chat: 1000, image: 100, video: 20, project: 100 },
  owner: { chat: 999999, image: 999999, video: 999999, project: 999999 },
}

const usageStore = new Map<string, UserUsage>()

function today() {
  return new Date().toISOString().slice(0, 10)
}

function key(userId: string) {
  return `${userId || "guest"}:${today()}`
}

export function usageKind(task: AITaskType | UsageKind): UsageKind {
  if (task === "image") return "image"
  if (task === "video") return "video"
  if (task === "project") return "project"
  return "chat"
}

function resolveUserId(userId?: string, user?: AdminUserLike | string | null) {
  if (userId) return userId
  if (typeof user === "string") return user
  return user?.email || user?.userEmail || user?.username || user?.id || "guest"
}

export function getUserUsage(userId = "guest", plan: AIPlan = "free"): UserUsage {
  const storeKey = key(userId)
  const existing = usageStore.get(storeKey)
  if (existing) return existing

  const usage: UserUsage = {
    userId,
    plan,
    date: today(),
    chat: 0,
    image: 0,
    video: 0,
    project: 0,
    updatedAt: new Date().toISOString(),
  }
  usageStore.set(storeKey, usage)
  return usage
}

export function checkUsageLimit(input: {
  userId?: string
  user?: AdminUserLike | string | null
  plan?: AIPlan
  task: AITaskType | UsageKind
}) {
  const userId = resolveUserId(input.userId, input.user)
  const status = getBypassStatus(input.user || userId)
  const kind = usageKind(input.task)

  if (canBypassLimits(input.user || userId)) {
    const limit = PLAN_LIMITS.owner[kind]
    return {
      ok: true,
      bypass: true,
      userId,
      plan: "owner" as AIPlan,
      kind,
      used: 0,
      limit,
      remaining: limit,
      resetAt: `${today()}T23:59:59.999Z`,
      showPaywall: false,
      upgradeRequired: false,
      message: status.message,
      bypassStatus: status,
    }
  }

  const plan = input.plan || getUserPlan(input.user || userId)
  const usage = getUserUsage(userId, plan)
  const limit = PLAN_LIMITS[plan][kind]
  const used = usage[kind]
  const remaining = Math.max(0, limit - used)
  const ok = used < limit

  return {
    ok,
    bypass: false,
    userId,
    plan,
    kind,
    used,
    limit,
    remaining,
    resetAt: `${today()}T23:59:59.999Z`,
    showPaywall: shouldShowPaywall({ user: input.user || userId, limitReached: !ok, plan }),
    upgradeRequired: !ok && plan === "free",
    message: ok ? "Usage allowed." : `${kind} daily limit reached for ${plan} plan.`,
    bypassStatus: status,
  }
}

export function incrementUsage(input: {
  userId?: string
  user?: AdminUserLike | string | null
  plan?: AIPlan
  task: AITaskType | UsageKind
  amount?: number
}) {
  const userId = resolveUserId(input.userId, input.user)

  if (canBypassLimits(input.user || userId)) {
    return getUserUsage(userId, "owner")
  }

  const plan = input.plan || getUserPlan(input.user || userId)
  const kind = usageKind(input.task)
  const usage = getUserUsage(userId, plan)
  usage[kind] += input.amount || 1
  usage.updatedAt = new Date().toISOString()
  usageStore.set(key(userId), usage)
  return usage
}

export function getUsageSummary(userId = "guest", plan: AIPlan = "free", user?: AdminUserLike | string | null) {
  const status = getBypassStatus(user || userId)
  const effectivePlan = status.canBypass ? "owner" : plan || getUserPlan(user || userId)
  const usage = getUserUsage(userId, effectivePlan)
  const limits = PLAN_LIMITS[effectivePlan]

  return {
    userId,
    plan: effectivePlan,
    usage,
    limits,
    remaining: {
      chat: Math.max(0, limits.chat - usage.chat),
      image: Math.max(0, limits.image - usage.image),
      video: Math.max(0, limits.video - usage.video),
      project: Math.max(0, limits.project - usage.project),
    },
    bypassStatus: status,
    showUpgrade: false,
  }
}

export function resetDailyUsage(userId = "guest", plan: AIPlan = "free") {
  usageStore.delete(key(userId))
  return getUserUsage(userId, plan)
}

