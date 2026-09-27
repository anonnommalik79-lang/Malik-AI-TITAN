import { demoModeEnabled, safeFeatureSnapshot } from "@/lib/god-mode/feature-flags"
import { performanceSnapshot } from "@/lib/god-mode/performance"
import { providerHealthSnapshot } from "@/lib/god-mode/provider-health"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { renderResponseBudgetBytes, renderBandwidthGuardEnabled } from "@/lib/server/render-bandwidth"
import { requestSafetySnapshot } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GOD_FLAGS = [
  "god_mode",
  "demo_mode",
  "provider_health",
  "artifact_graph",
  "global_retry",
  "global_search",
  "owner_console",
]

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (entitlement.plan !== "owner") {
    return withGodTraceHeaders(Response.json({
      ok: false,
      code: "OWNER_ONLY",
      error: "Owner diagnostics are not available for this account.",
      diagnosticId: trace.diagnosticId,
    }, { status: 403, headers: { "cache-control": "private, no-store" } }), trace, { operation: "god-status", budgetMs: 1500 })
  }

  const response = Response.json({
    ok: true,
    product: "Malik AI",
    mode: "GOD_MODE_CONTROL_PLANE",
    demoMode: demoModeEnabled(),
    traceId: trace.traceId,
    diagnosticId: trace.diagnosticId,
    bandwidth: {
      guard: renderBandwidthGuardEnabled(),
      maxRenderResponseBytes: renderResponseBudgetBytes(),
    },
    requestSafety: requestSafetySnapshot(),
    features: safeFeatureSnapshot(GOD_FLAGS, {
      userId: entitlement.userId,
      owner: true,
      demo: demoModeEnabled(),
    }),
    providerHealth: providerHealthSnapshot(),
    performance: performanceSnapshot(),
    secretsExposed: false,
  }, { headers: { "cache-control": "private, no-store" } })

  return withGodTraceHeaders(response, trace, { operation: "god-status", budgetMs: 1500 })
}
