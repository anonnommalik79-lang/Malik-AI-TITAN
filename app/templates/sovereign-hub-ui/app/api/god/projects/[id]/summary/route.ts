import { getGodProject } from "@/lib/god-mode/project-state"
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
  const project = await getGodProject(id, entitlement.userId)
  if (!project) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "PROJECT_NOT_FOUND", error: "Проект не найден." }, { status: 404 }), trace, { operation: "project-state", budgetMs: 1500 })
  }

  const tasks = Object.values(project.tasks)
  const artifacts = Object.values(project.artifacts)
  const providers = [...new Set(tasks.map((task) => task.provider).filter(Boolean))]
  const completed = tasks.filter((task) => task.status === "completed")
  const firstStart = tasks.map((task) => task.startedAt).filter(Boolean).map((value) => Date.parse(value as string)).filter(Number.isFinite).sort((a,b)=>a-b)[0]
  const lastFinish = tasks.map((task) => task.finishedAt).filter(Boolean).map((value) => Date.parse(value as string)).filter(Number.isFinite).sort((a,b)=>b-a)[0]
  const activeDurationMs = Number.isFinite(firstStart) && Number.isFinite(lastFinish) && lastFinish >= firstStart
    ? lastFinish - firstStart
    : null

  return withGodTraceHeaders(Response.json({
    ok: true,
    summary: {
      id: project.id,
      title: project.title,
      status: project.status,
      tasks: {
        total: tasks.length,
        queued: tasks.filter((task) => task.status === "queued").length,
        active: tasks.filter((task) => ["running", "waiting", "retrying"].includes(task.status)).length,
        completed: completed.length,
        failed: tasks.filter((task) => task.status === "failed").length,
        cancelled: tasks.filter((task) => task.status === "cancelled").length,
      },
      artifacts: {
        total: artifacts.length,
        byKind: Object.fromEntries([...new Set(artifacts.map((artifact) => artifact.kind))].sort().map((kind) => [kind, artifacts.filter((artifact) => artifact.kind === kind).length])),
        pinned: project.pinnedArtifactIds.length,
      },
      providersUsed: providers,
      activeDurationMs,
      ready: project.status === "completed" && tasks.length > 0 && completed.length === tasks.length,
      updatedAt: project.updatedAt,
    },
  }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
}
