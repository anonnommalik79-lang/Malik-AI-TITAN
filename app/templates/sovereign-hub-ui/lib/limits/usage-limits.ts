import type { UserTier } from "./user-plan"

export type LimitKind = "chat" | "upload" | "video"

const configuredFreeDailyChatRequests = Number(process.env.FREE_DAILY_CHAT_REQUEST_LIMIT || 15)
const freeDailyChatRequests = Number.isFinite(configuredFreeDailyChatRequests)
  ? Math.max(1, Math.floor(configuredFreeDailyChatRequests))
  : 15

// Launch protection: anonymous and free accounts get a hard request cap in
// addition to the generated-token quota. This prevents a traffic spike from
// turning provider quotas into an unbounded fan-out.
export const TIER_LIMITS: Record<UserTier, Record<LimitKind, number> & { maxPromptChars: number }> = {
  guest: { chat: freeDailyChatRequests, upload: 3, video: 0, maxPromptChars: 3000 },
  free: { chat: freeDailyChatRequests, upload: 10, video: 0, maxPromptChars: 6000 },
  premium: { chat: 100000, upload: 50, video: 5, maxPromptChars: 12000 },
  owner: { chat: 999999, upload: 999999, video: 999999, maxPromptChars: 50000 },
}

export function getTierLimits(tier: UserTier) {
  return TIER_LIMITS[tier]
}

export function nextResetAt(): string {
  const now = new Date()
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return reset.toISOString()
}
