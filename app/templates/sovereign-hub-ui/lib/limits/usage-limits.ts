import type { UserTier } from "./user-plan"

export type LimitKind = "chat" | "upload" | "video"

// Daily text usage is governed by the server-side generated-token quota.
// Keep this legacy request-count ceiling out of the way; per-minute abuse
// protection in rate-limit.ts remains active.
export const TIER_LIMITS: Record<UserTier, Record<LimitKind, number> & { maxPromptChars: number }> = {
  guest: { chat: 100000, upload: 3, video: 0, maxPromptChars: 3000 },
  free: { chat: 100000, upload: 10, video: 0, maxPromptChars: 6000 },
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
