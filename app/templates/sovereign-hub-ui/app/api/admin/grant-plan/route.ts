import type { AIPlan } from "@/lib/ai/types"
import { requireMalikAdminAsync } from "@/lib/server/admin"
import { grantPlan } from "@/lib/server/billing-store"

export async function POST(request: Request) {
  const guard = await requireMalikAdminAsync(request)
  if (guard.response) return guard.response
  const body = await request.json().catch(() => ({}))
  const email = String(body?.email || "").trim().toLowerCase()
  const plan = String(body?.plan || "").trim().toLowerCase() as AIPlan
  if (!email.includes("@") || !["free", "pro"].includes(plan)) {
    return Response.json({ ok: false, error: "invalid_grant" }, { status: 400 })
  }
  const result = await grantPlan(email, plan, guard.access.email)
  return Response.json({ ok: true, email, plan, storage: result.storage })
}
