import type { AIPlan } from "@/lib/ai/types"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

function normalizeMediaUserId(id: string) {
  const value = id.trim().toLowerCase()
  if (!value || value === "guest" || value === "guest@local" || value === "guest@malik.ai") return "guest"
  return value
}

export async function resolveMediaUser(_request: Request, _body?: { userEmail?: string; email?: string; plan?: AIPlan }) {
  // Identity and plan are server-authoritative. Never trust body.userEmail/body.plan
  // for owner bypasses or daily quota decisions.
  const entitlement = await resolveRequestEntitlement(_request)
  const userId = normalizeMediaUserId(entitlement.userId || "guest")
  return {
    userId,
    plan: entitlement.plan,
    authenticated: entitlement.authenticated,
  }
}
