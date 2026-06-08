import { findOrder } from "@/lib/server/billing-store"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const order = await findOrder(String(body?.orderId || ""))
  if (!order) return Response.json({ ok: false, error: "order_not_found" }, { status: 404 })
  return Response.json({ ok: true, order: { id: order.id, plan: order.plan, status: order.status, createdAt: order.createdAt } })
}
