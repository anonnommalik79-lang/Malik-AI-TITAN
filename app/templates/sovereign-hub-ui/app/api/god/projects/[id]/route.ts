import { artifactQuickActions } from "@/lib/god-mode/actions"
import { deleteGodProject, getGodProject, projectManifest } from "@/lib/god-mode/project-state"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

async function owner(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  return entitlement.authenticated ? entitlement.userId : ""
}

export async function GET(request: Request, context: Context) {
  const trace = createGodTrace(request)
  const userId = await owner(request)
  if (!userId) return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  const { id } = await context.params
  const project = await getGodProject(id, userId)
  if (!project) return withGodTraceHeaders(Response.json({ ok: false, code: "PROJECT_NOT_FOUND", error: "Проект не найден." }, { status: 404 }), trace, { operation: "project-state", budgetMs: 1500 })

  const manifest = projectManifest(project)
  const artifacts = manifest.artifacts.map((artifact) => ({ ...artifact, actions: artifactQuickActions(artifact) }))
  return withGodTraceHeaders(Response.json({ ok: true, project: { ...manifest, artifacts } }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
}

export async function DELETE(request: Request, context: Context) {
  const trace = createGodTrace(request)
  const userId = await owner(request)
  if (!userId) return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  const { id } = await context.params
  const deleted = await deleteGodProject(id, userId)
  return withGodTraceHeaders(Response.json(deleted
    ? { ok: true, deleted: id }
    : { ok: false, code: "PROJECT_NOT_FOUND", error: "Проект не найден." },
  { status: deleted ? 200 : 404, headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
}
