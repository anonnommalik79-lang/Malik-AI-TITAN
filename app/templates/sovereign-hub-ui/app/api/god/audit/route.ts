import { readGodAudit } from "@/lib/god-mode/audit-log"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (entitlement.plan !== "owner") {
    return withGodTraceHeaders(Response.json({ ok: false, code: "OWNER_ONLY", error: "Owner access required." }, { status: 403 }), trace, { operation: "god-audit", budgetMs: 1500 })
  }
  const date = new URL(request.url).searchParams.get("date") || undefined
  const events = await readGodAudit(entitlement.userId, date)
  return withGodTraceHeaders(Response.json({ ok: true, events: events.slice(-250), secretsExposed: false }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "god-audit", budgetMs: 1500 })
}
