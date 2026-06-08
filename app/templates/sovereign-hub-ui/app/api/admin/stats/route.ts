import { requireMalikAdmin } from "@/lib/server/admin"
import { runtimeStats } from "@/lib/server/runtime-store"

export async function GET(request: Request) {
  const guard = requireMalikAdmin(request)
  if (guard.response) return guard.response
  return Response.json({ ok: true, stats: runtimeStats() })
}
