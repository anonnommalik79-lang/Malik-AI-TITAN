import { compareGodArtifacts } from "@/lib/god-mode/project-state"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  }
  const { id } = await context.params
  const query = new URL(request.url).searchParams
  const left = String(query.get("left") || "").trim()
  const right = String(query.get("right") || "").trim()
  if (!left || !right) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "ARTIFACT_IDS_REQUIRED", error: "Укажите left и right." }, { status: 400 }), trace, { operation: "project-state", budgetMs: 1500 })
  }
  const comparison = await compareGodArtifacts(id, entitlement.userId, left, right)
  return withGodTraceHeaders(Response.json(comparison
    ? { ok: true, comparison }
    : { ok: false, code: "ARTIFACT_NOT_FOUND", error: "Не удалось сравнить эти версии." },
  { status: comparison ? 200 : 404, headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
}
