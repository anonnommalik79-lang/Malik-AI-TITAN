import { getRuntimeHistory } from "@/lib/server/runtime-store"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) {
    return Response.json(
      { ok: false, error: "AUTH_REQUIRED", history: [] },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    )
  }

  return Response.json(
    { ok: true, history: getRuntimeHistory(entitlement.userId), mode: "memory-fallback" },
    { headers: { "cache-control": "private, no-store" } },
  )
}
