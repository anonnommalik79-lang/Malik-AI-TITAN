import { PLAN_LIMITS } from "@/lib/ai/usage-limits"
import { requireMalikAdmin } from "@/lib/server/admin"

export async function GET(request: Request) {
  const guard = requireMalikAdmin(request)
  if (guard.response) return guard.response
  return Response.json({ ok: true, limits: PLAN_LIMITS })
}
