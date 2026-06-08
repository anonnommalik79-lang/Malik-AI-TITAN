import { BILLING_PLANS } from "@/lib/server/runtime-store"

export async function GET() {
  return Response.json({ ok: true, plans: BILLING_PLANS })
}
