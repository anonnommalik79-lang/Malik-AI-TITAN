import type { AIPlan } from "@/lib/ai/types"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

function normalizeMediaUserId(id: string) {
  const value = id.trim().toLowerCase()
  if (!value || value === "guest" || value === "guest@local" || value === "guest@malik.ai") return "guest"
  return value
}

export async function resolveMediaUser(request: Request, body?: { userEmail?: string; email?: string; plan?: AIPlan }) {
  const entitlement = await resolveRequestEntitlement(request)
  const fromBody = body?.userEmail?.trim() || body?.email?.trim()
  const userId = normalizeMediaUserId(fromBody || entitlement.userId || "guest")
  const plan = body?.plan || entitlement.plan
  const authenticated = entitlement.authenticated || Boolean(fromBody && fromBody !== "guest")
  return { userId, plan, authenticated }
}
