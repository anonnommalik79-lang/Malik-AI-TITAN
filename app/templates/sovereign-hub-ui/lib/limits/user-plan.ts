import type { AIPlan } from "@/lib/ai/types"

export type UserTier = "guest" | "free" | "premium" | "owner"

export function resolveUserTier(userId: string | undefined, plan: AIPlan = "free"): UserTier {
  if (plan === "owner") return "owner"
  if (plan === "pro" || plan === "ultra") return "premium"
  if (!userId || userId === "guest") return "guest"
  return "free"
}

export function tierLabel(tier: UserTier): string {
  if (tier === "guest") return "guest"
  if (tier === "premium") return "premium"
  if (tier === "owner") return "owner"
  return "free"
}
