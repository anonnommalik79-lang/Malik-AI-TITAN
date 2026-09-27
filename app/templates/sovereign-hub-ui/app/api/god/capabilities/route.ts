import { godCapabilityCatalog } from "@/lib/god-mode/capabilities"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "god-capabilities", budgetMs: 1500 })
  }
  return withGodTraceHeaders(Response.json({
    ok: true,
    capabilities: godCapabilityCatalog(),
    note: "Heavy media outputs are references/URLs, not binary relays through this gateway.",
  }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "god-capabilities", budgetMs: 1500 })
}
