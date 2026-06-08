import type { AIPlan } from "@/lib/ai/types"
import { entitledPlan } from "@/lib/server/billing-store"
import { createSupabaseUserClient, isServerSupabaseConfigured } from "@/lib/server/supabase-user"

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") || ""
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : ""
}

export type RequestEntitlement = {
  authenticated: boolean
  userId: string
  plan: AIPlan
}

export async function resolveRequestEntitlement(request: Request): Promise<RequestEntitlement> {
  const token = bearerToken(request)
  if (!token || !isServerSupabaseConfigured()) {
    return { authenticated: false, userId: "guest", plan: "free" }
  }

  const client = createSupabaseUserClient(token)
  if (!client) return { authenticated: false, userId: "guest", plan: "free" }

  const { data, error } = await client.auth.getUser(token)
  const email = data.user?.email?.trim().toLowerCase()
  if (error || !email) return { authenticated: false, userId: "guest", plan: "free" }

  return { authenticated: true, userId: email, plan: await entitledPlan(email) }
}
