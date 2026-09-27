import { OsToolError } from "@/lib/os/failures"
import { osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { artifactIndex, getProject, listFlows, updateProject } from "@/lib/os/store"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/** A project's memory: goal, facts, decisions, sources, artifacts, flows. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    const project = await getProject(owner.userId, id)
    if (!project) throw new OsToolError("NOT_FOUND", "Проект не найден.", { retryable: false })
    const artifacts = (await artifactIndex(owner.userId)).filter((entry) => entry.projectId === project.id)
    const flows = await listFlows(owner.userId, { projectId: project.id, limit: 20 })
    const { ownerId: _owner, ...visible } = project
    void _owner
    return osJson({ ok: true, project: visible, artifacts, flows })
  } catch (error) {
    return osError(error)
  }
}

/**
 * The person adds to the project's memory: a decision ("целевая аудитория —
 * фермеры Туркестана"), a fact, or a new title. Every later step reads it.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 16 * 1024)
    const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 120) : ""
    const decision = typeof body.decision === "string" ? body.decision.replace(/\s+/g, " ").trim().slice(0, 300) : ""
    const source = body.source === "voice" ? "voice" : "user"
    if (!title && !decision) throw new OsToolError("INVALID_REQUEST", "Нечего сохранить.", { retryable: false })
    const project = await updateProject(owner.userId, id, (target) => {
      if (title) target.title = title
      if (decision) target.decisions.push({ id: `dec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, text: decision, at: Date.now(), source })
    })
    if (!project) throw new OsToolError("NOT_FOUND", "Проект не найден.", { retryable: false })
    return osJson({ ok: true, project: { id: project.id, title: project.title, decisions: project.decisions.slice(-20) } })
  } catch (error) {
    return osError(error)
  }
}
