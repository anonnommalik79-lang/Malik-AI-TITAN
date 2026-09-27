import { listActiveGodTasks } from "@/lib/god-mode/project-state"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  }
  const limit = Number(new URL(request.url).searchParams.get("limit") || 50)
  const jobs = await listActiveGodTasks(entitlement.userId, limit)
  return withGodTraceHeaders(Response.json({
    ok: true,
    jobs,
    durableWhenPrivateStateConfigured: true,
  }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
}
