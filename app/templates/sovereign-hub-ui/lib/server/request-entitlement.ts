import type { AIPlan } from "@/lib/ai/types"
import { entitledPlan } from "@/lib/server/billing-store"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"

export type RequestEntitlement = {
  authenticated: boolean
  userId: string
  plan: AIPlan
}

export async function resolveRequestEntitlement(_request: Request): Promise<RequestEntitlement> {
  const { user } = await getOptionalWorkOSAuth()
  if (!user?.email) {
    return { authenticated: false, userId: "guest", plan: "free" }
  }
  // Unverified email addresses must not inherit email-based owner/paid grants.
  if (!user.emailVerified) {
    return { authenticated: true, userId: `workos:${user.id}`, plan: "free" }
  }
  const email = user.email.trim().toLowerCase()
  return { authenticated: true, userId: email, plan: isVerifiedOwner(user) ? "owner" : await entitledPlan(email) }
}
