import { getGodProject, pinGodArtifact, rollbackGodArtifact } from "@/lib/god-mode/project-state"
import { appendGodAudit } from "@/lib/god-mode/audit-log"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { readJsonBodyLimited } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string; artifactId: string }> }

export async function PATCH(request: Request, context: Context) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  const { id, artifactId } = await context.params
  const project = await getGodProject(id, entitlement.userId)
  if (!project?.artifacts[artifactId]) return withGodTraceHeaders(Response.json({ ok: false, code: "ARTIFACT_NOT_FOUND", error: "Артефакт не найден." }, { status: 404 }), trace, { operation: "project-state", budgetMs: 1500 })

  const body = await readJsonBodyLimited<Record<string, unknown>>(request, 8 * 1024)
  const action = String(body.action || "").trim().toLowerCase()
  if (action === "pin") {
    const next = await pinGodArtifact(id, entitlement.userId, artifactId)
    await appendGodAudit(entitlement.userId, {
      category: "project", action: "artifact.pin", success: Boolean(next), traceId: trace.traceId,
      resourceId: artifactId, metadata: { projectId: id },
    }).catch(() => undefined)
    return withGodTraceHeaders(Response.json({ ok: true, project: next }), trace, { operation: "project-state", budgetMs: 1500 })
  }
  if (action === "rollback") {
    const artifact = await rollbackGodArtifact(id, entitlement.userId, artifactId)
    await appendGodAudit(entitlement.userId, {
      category: "project", action: "artifact.rollback", success: Boolean(artifact), traceId: trace.traceId,
      resourceId: artifactId, metadata: { projectId: id, rolledBackTo: artifact?.id },
    }).catch(() => undefined)
    return withGodTraceHeaders(Response.json(artifact ? { ok: true, artifact } : { ok: false, code: "ROLLBACK_NOT_AVAILABLE", error: "У этой версии нет предыдущей версии." }, { status: artifact ? 200 : 409 }), trace, { operation: "project-state", budgetMs: 1500 })
  }
  return withGodTraceHeaders(Response.json({ ok: false, code: "INVALID_ACTION", error: "Поддерживаются действия pin и rollback." }, { status: 400 }), trace, { operation: "project-state", budgetMs: 1500 })
}
