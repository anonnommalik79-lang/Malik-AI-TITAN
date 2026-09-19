import { getImageCreditStatus } from "@/lib/media/limits"
import { resolveMediaUser } from "@/lib/media/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const user = await resolveMediaUser(request)
  const status = await getImageCreditStatus({ userId: user.userId, plan: user.plan })

  return Response.json({
    ok: true,
    remaining: status.remaining,
    daily: status.daily,
    used: status.used,
    costs: status.costs,
    max4kPerDay: status.max4kPerDay,
    used4k: status.used4k,
    remaining4k: status.remaining4k,
    resetAt: status.resetAt,
    plan: status.plan,
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  })
}
