import { demoModeEnabled } from "@/lib/god-mode/feature-flags"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { privateJsonStoreConfigured } from "@/lib/server/private-json-store"
import { renderBandwidthGuardEnabled, renderResponseBudgetBytes } from "@/lib/server/render-bandwidth"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function enabled(name: string, fallback = false) {
  const raw = String(process.env[name] || "").trim()
  if (!raw) return fallback
  return /^(1|true|yes|on)$/i.test(raw)
}

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  const response = Response.json({
    ok: true,
    authenticated: entitlement.authenticated,
    storage: {
      projectPrivateStateConfigured: privateJsonStoreConfigured(),
      projectMemoryStores: ["goal", "tasks", "artifact metadata", "relationships", "activity"],
      projectMemoryDoesNotIntentionallyStore: ["provider API keys", "raw authentication cookies", "large generated media binaries"],
    },
    delivery: {
      imageProviderDirectPreferred: enabled("MALIK_IMAGE_EPHEMERAL_DIRECT", true),
      videoRenderProxyBlocked: enabled("MALIK_VIDEO_RENDER_BANDWIDTH_GUARD", true),
      globalRenderBandwidthGuard: renderBandwidthGuardEnabled(),
      maxRenderResponseBytes: renderResponseBudgetBytes(),
    },
    controls: {
      projectDeletionAvailable: entitlement.authenticated,
      readOnlyProjectSharingUsesExpiringSecretTokens: true,
      demoMode: demoModeEnabled(),
    },
    note: "Generated media retention can still depend on the external provider or configured object storage.",
    secretsExposed: false,
  }, { headers: { "cache-control": "private, no-store" } })
  return withGodTraceHeaders(response, trace, { operation: "god-privacy", budgetMs: 1500 })
}
