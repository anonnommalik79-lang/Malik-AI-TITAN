import { requireMalikAdminAsync } from "@/lib/server/admin"
import { approveOrder } from "@/lib/server/billing-store"

export async function POST(request: Request) {
  const guard = await requireMalikAdminAsync(request)
  if (guard.response) return guard.response
  const body = await request.json().catch(() => ({}))
  const order = await approveOrder(String(body?.orderId || ""), guard.access.email)
  if (!order) return Response.json({ ok: false, error: "order_not_found" }, { status: 404 })
  return Response.json({ ok: true, order })
}
