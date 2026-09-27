import { appendGodAudit } from "@/lib/god-mode/audit-log"
import { resetPerformanceMetrics } from "@/lib/god-mode/performance"
import { resetProviderHealth } from "@/lib/god-mode/provider-health"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (entitlement.plan !== "owner") {
    return withGodTraceHeaders(Response.json({ ok: false, code: "OWNER_ONLY", error: "Owner access required." }, { status: 403 }), trace, { operation: "god-demo-recovery", budgetMs: 1500 })
  }

  // Recovery resets only transient diagnostics. It intentionally never deletes
  // projects, artifacts, auth sessions, quotas or provider credentials.
  resetPerformanceMetrics()
  resetProviderHealth()
  await appendGodAudit(entitlement.userId, {
    category: "admin",
    action: "demo.recovery",
    success: true,
    traceId: trace.traceId,
    metadata: { reset: ["performance", "provider-health"], destructive: false },
  })

  return withGodTraceHeaders(Response.json({
    ok: true,
    reset: ["performance", "provider-health"],
    projectsDeleted: false,
    quotasChanged: false,
    sessionsChanged: false,
  }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "god-demo-recovery", budgetMs: 1500 })
}
