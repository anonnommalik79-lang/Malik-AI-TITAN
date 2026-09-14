import type { AIPlan } from "@/lib/ai/types"
import { PLAN_LIMITS } from "@/lib/ai/usage-limits"
import { getUsage } from "@/lib/ai/usage"
import { DAILY_TEXT_TOKEN_LIMIT, getDailyTextTokenQuota } from "@/lib/server/daily-text-token-quota"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  const userId = entitlement.userId
  const plan = entitlement.plan as AIPlan
  const snapshot = getUsage(userId, plan)
  const usage = { chat: snapshot.chatCount, image: snapshot.imageCount, video: snapshot.videoCount, project: snapshot.projectCount }
  const limits = PLAN_LIMITS[plan]
  const textTokens = getDailyTextTokenQuota(userId, plan)

  return Response.json({
    ok: true,
    plan,
    usage,
    limits,
    textTokens: {
      used: textTokens.used,
      limit: textTokens.limit,
      remaining: textTokens.remaining,
      unlimited: textTokens.unlimited,
      resetAt: textTokens.resetAt,
      defaultDailyLimit: DAILY_TEXT_TOKEN_LIMIT,
    },
    remaining: {
      chat: Math.max(0, limits.chat - usage.chat),
      image: Math.max(0, limits.image - usage.image),
      video: Math.max(0, limits.video - usage.video),
      project: Math.max(0, limits.project - usage.project),
    },
  })
}
