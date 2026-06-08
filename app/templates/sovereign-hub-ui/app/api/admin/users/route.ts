import { requireMalikAdmin } from "@/lib/server/admin"

export async function GET(request: Request) {
  const guard = requireMalikAdmin(request)
  if (guard.response) return guard.response
  return Response.json({ ok: true, users: [], mode: "database-sync-required" })
}
