import type { AIPlan } from "@/lib/ai/types"
import { entitledPlan } from "@/lib/server/billing-store"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"

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
  const email = user.email.trim().toLowerCase()
  return { authenticated: true, userId: email, plan: await entitledPlan(email) }
}
