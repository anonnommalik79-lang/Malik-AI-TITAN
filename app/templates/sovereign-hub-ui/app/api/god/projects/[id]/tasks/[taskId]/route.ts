import { getGodProject, retryGodTask, transitionGodTask } from "@/lib/god-mode/project-state"
import type { GodTaskStatus } from "@/lib/god-mode/contracts"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { readJsonBodyLimited } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string; taskId: string }> }
const STATUSES = new Set<GodTaskStatus>(["queued", "running", "waiting", "retrying", "completed", "failed", "cancelled"])

export async function PATCH(request: Request, context: Context) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  const { id, taskId } = await context.params
  const project = await getGodProject(id, entitlement.userId)
  if (!project?.tasks[taskId]) return withGodTraceHeaders(Response.json({ ok: false, code: "TASK_NOT_FOUND", error: "Задача не найдена." }, { status: 404 }), trace, { operation: "project-state", budgetMs: 1500 })

  const body = await readJsonBodyLimited<Record<string, unknown>>(request, 16 * 1024)
  const action = String(body.action || "").trim().toLowerCase()

  if (action === "retry") {
    const task = await retryGodTask(id, entitlement.userId, taskId, trace.traceId)
    return withGodTraceHeaders(Response.json(task ? { ok: true, task } : { ok: false, code: "RETRY_NOT_ALLOWED", error: "Повтор этой задачи сейчас невозможен." }, { status: task ? 200 : 409 }), trace, { operation: "project-state", budgetMs: 1500 })
  }

  const status = action === "cancel" ? "cancelled" : String(body.status || "") as GodTaskStatus
  if (!STATUSES.has(status)) return withGodTraceHeaders(Response.json({ ok: false, code: "INVALID_TASK_STATUS", error: "Недопустимый статус задачи." }, { status: 400 }), trace, { operation: "project-state", budgetMs: 1500 })

  try {
    const task = await transitionGodTask(id, entitlement.userId, taskId, {
      status,
      progress: typeof body.progress === "number" ? body.progress : undefined,
      stage: String(body.stage || "").trim() || undefined,
      provider: String(body.provider || "").trim() || undefined,
      errorCode: String(body.errorCode || "").trim() || undefined,
      errorMessage: String(body.errorMessage || "").trim() || undefined,
      traceId: trace.traceId,
    })
    return withGodTraceHeaders(Response.json({ ok: true, task }), trace, { operation: "project-state", budgetMs: 1500 })
  } catch {
    return withGodTraceHeaders(Response.json({ ok: false, code: "INVALID_TASK_TRANSITION", error: "Этот переход состояния задачи запрещён." }, { status: 409 }), trace, { operation: "project-state", budgetMs: 1500 })
  }
}
