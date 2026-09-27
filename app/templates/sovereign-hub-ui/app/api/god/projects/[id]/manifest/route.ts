import { getGodProject, projectManifest } from "@/lib/god-mode/project-state"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { renderBandwidthBlocked, renderResponseFitsBudget } from "@/lib/server/render-bandwidth"
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
  const project = await getGodProject(id, entitlement.userId)
  if (!project) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "PROJECT_NOT_FOUND", error: "Проект не найден." }, { status: 404 }), trace, { operation: "project-state", budgetMs: 1500 })
  }

  const body = JSON.stringify({
    exportedAt: new Date().toISOString(),
    format: "malik-project-manifest-v1",
    project: projectManifest(project),
  }, null, 2)
  const bytes = new TextEncoder().encode(body)
  if (!renderResponseFitsBudget(bytes.byteLength)) return renderBandwidthBlocked("project-manifest", bytes.byteLength)

  return withGodTraceHeaders(new Response(bytes, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="malik-project-${project.id.slice(0, 8)}.json"`,
      "cache-control": "private, no-store",
      "content-length": String(bytes.byteLength),
    },
  }), trace, { operation: "project-state", budgetMs: 1500 })
}
