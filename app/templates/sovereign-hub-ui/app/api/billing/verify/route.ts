import { findOrder } from "@/lib/server/billing-store"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"

export async function POST(request: Request) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user?.emailVerified) return Response.json({ ok: false, error: "secure_session_required" }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const order = await findOrder(String(body?.orderId || ""))
  if (!order || order.email !== user.email.trim().toLowerCase()) return Response.json({ ok: false, error: "order_not_found" }, { status: 404 })
  return Response.json({ ok: true, order: { id: order.id, plan: order.plan, status: order.status, createdAt: order.createdAt } })
}
