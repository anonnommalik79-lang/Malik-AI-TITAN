import { malikProviderHealthSnapshot } from "@/lib/server/malik-model-router"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (entitlement.plan !== "owner") {
    return Response.json({ ok: false, code: "OWNER_ONLY", error: "Founder telemetry is owner-only." }, { status: 403 })
  }

  const providers = malikProviderHealthSnapshot()
  const observed = providers.filter((item) => item.requestsObserved > 0)
  const healthy = providers.filter((item) => item.healthy).length
  const coolingDown = providers.filter((item) => item.cooldownMs > 0).length

  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      models: providers.length,
      observed: observed.length,
      healthy,
      coolingDown,
    },
    providers,
  }, { headers: { "cache-control": "private, no-store" } })
}
