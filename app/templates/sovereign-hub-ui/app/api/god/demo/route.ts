import { GOD_DEMO_SCENARIOS } from "@/lib/god-mode/demo"
import { demoModeEnabled } from "@/lib/god-mode/feature-flags"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { privateJsonStoreConfigured } from "@/lib/server/private-json-store"
import { renderBandwidthGuardEnabled, renderResponseBudgetBytes } from "@/lib/server/render-bandwidth"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  const owner = entitlement.plan === "owner"
  if (!owner && !demoModeEnabled()) {
    return withGodTraceHeaders(Response.json({
      ok: false,
      code: "DEMO_MODE_DISABLED",
      error: "Digital Bridge demo mode is disabled.",
    }, { status: 403 }), trace, { operation: "god-demo", budgetMs: 1500 })
  }

  return withGodTraceHeaders(Response.json({
    ok: true,
    liveGeneration: true,
    cachedResultsPresentedAsLive: false,
    scenarios: GOD_DEMO_SCENARIOS,
    preflight: {
      authenticated: entitlement.authenticated,
      owner,
      privateStateConfigured: privateJsonStoreConfigured(),
      renderBandwidthGuard: renderBandwidthGuardEnabled(),
      maxRenderResponseBytes: renderResponseBudgetBytes(),
    },
  }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "god-demo", budgetMs: 1500 })
}
