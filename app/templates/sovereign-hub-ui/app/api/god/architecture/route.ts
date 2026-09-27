import { PUBLIC_MALIK_MODELS } from "@/lib/ai/malik-models"
import { providerHealthSnapshot } from "@/lib/god-mode/provider-health"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { renderBandwidthGuardEnabled, renderResponseBudgetBytes } from "@/lib/server/render-bandwidth"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (entitlement.plan !== "owner") {
    return withGodTraceHeaders(Response.json({ ok: false, code: "OWNER_ONLY", error: "Owner access required." }, { status: 403 }), trace, { operation: "god-architecture", budgetMs: 1500 })
  }

  const providers = [...new Set(PUBLIC_MALIK_MODELS.map((model) => model.provider))]
  return withGodTraceHeaders(Response.json({
    ok: true,
    topology: {
      account: "WorkOS AuthKit",
      orchestration: ["Malik Router", "God Mission / Project Graph", "Capability APIs"],
      capabilities: ["chat", "research", "code", "image", "video", "music", "sites", "presentations", "business", "translator", "analysis"],
      artifactLayer: "God Project Artifact Graph",
      delivery: {
        heavyMedia: "provider/CDN/object-storage → browser",
        render: "auth/orchestration/status/text/small artifacts",
        renderBandwidthGuard: renderBandwidthGuardEnabled(),
        maxRenderResponseBytes: renderResponseBudgetBytes(),
      },
      modelProviders: providers,
    },
    modelCatalog: PUBLIC_MALIK_MODELS.map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
      capabilities: model.capabilities,
      tier: model.tier,
    })),
    measuredProviderHealth: providerHealthSnapshot(),
    secretsExposed: false,
  }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "god-architecture", budgetMs: 1500 })
}
