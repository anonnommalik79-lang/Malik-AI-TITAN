import { requireMalikAdminAsync } from "@/lib/server/admin"
import { runtimeStats } from "@/lib/server/runtime-store"

export async function GET(request: Request) {
  const guard = await requireMalikAdminAsync(request)
  if (guard.response) return guard.response
  return Response.json({ ok: true, stats: runtimeStats() })
}
