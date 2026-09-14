import type { AIPlan } from "@/lib/ai/types"
import { getUsage, incrementUsage } from "@/lib/ai/usage"

export const DAILY_TEXT_TOKEN_LIMIT = 8_000

export type DailyTextTokenQuota = {
  unlimited: boolean
  used: number
  limit: number | null
  remaining: number | null
  resetAt: string
}

function nextUtcResetAt() {
  const now = new Date()
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0,
  )).toISOString()
}

/**
 * Text quota is measured from generated assistant output. Some free providers
 * do not return reliable usage objects, so output text is estimated at roughly
 * three characters per token. This is intentionally conservative for code,
 * Russian and Kazakh.
 */
export function estimateGeneratedTokens(text: unknown) {
  const value = typeof text === "string" ? text : ""
  if (!value) return 0
  return Math.max(1, Math.ceil(value.length / 3))
}

export function getDailyTextTokenQuota(userId: string, plan: AIPlan): DailyTextTokenQuota {
  if (plan === "owner") {
    return {
      unlimited: true,
      used: getUsage(userId, plan).tokensUsed,
      limit: null,
      remaining: null,
      resetAt: nextUtcResetAt(),
    }
  }

  const used = Math.max(0, getUsage(userId, plan).tokensUsed || 0)
  return {
    unlimited: false,
    used,
    limit: DAILY_TEXT_TOKEN_LIMIT,
    remaining: Math.max(0, DAILY_TEXT_TOKEN_LIMIT - used),
    resetAt: nextUtcResetAt(),
  }
}

export function recordGeneratedTextTokens(userId: string, plan: AIPlan, text: unknown) {
  const tokens = estimateGeneratedTokens(text)
  if (tokens <= 0) return getDailyTextTokenQuota(userId, plan)

  incrementUsage(userId, plan, "chat", tokens)
  return getDailyTextTokenQuota(userId, plan)
}
