import { godCapabilityCatalog } from "@/lib/god-mode/capabilities"
import { demoModeEnabled } from "@/lib/god-mode/feature-flags"
import { providerHealthSnapshot } from "@/lib/god-mode/provider-health"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { privateJsonStoreConfigured } from "@/lib/server/private-json-store"
import { renderBandwidthGuardEnabled } from "@/lib/server/render-bandwidth"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (entitlement.plan !== "owner" && !demoModeEnabled()) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "DEMO_MODE_DISABLED", error: "Demo warmup is disabled." }, { status: 403 }), trace, { operation: "god-demo-warmup", budgetMs: 1500 })
  }

  const health = providerHealthSnapshot()
  const unstable = health.filter((item) => item.disabled || item.cooldownUntil || (item.samples >= 3 && (item.successRate < .7 || item.p95LatencyMs > 25_000)))
  const response = Response.json({
    ok: true,
    makesGenerationCalls: false,
    consumesMediaQuota: false,
    checks: {
      authenticated: entitlement.authenticated,
      privateProjectState: privateJsonStoreConfigured(),
      renderBandwidthGuard: renderBandwidthGuardEnabled(),
      capabilityCount: godCapabilityCatalog().length,
      measuredProviders: health.length,
    },
    networkGuard: {
      conservative: unstable.length > 0,
      avoidProviders: unstable.map((item) => item.provider),
      reason: unstable.length
        ? "One or more providers are disabled, cooling down, failing often, or measured above the demo latency threshold."
        : health.length
          ? "No measured provider currently crosses the demo guard threshold."
          : "No provider measurements exist yet; health is unknown, not assumed green.",
    },
    providerHealth: health,
  }, { headers: { "cache-control": "private, no-store" } })

  return withGodTraceHeaders(response, trace, { operation: "god-demo-warmup", budgetMs: 1500 })
}
