import {
  createScheduledTask,
  deleteScheduledTask,
  listScheduledTasks,
  scheduledTasksStatus,
  setScheduledTaskEnabled,
} from "@/lib/server/scheduled-tasks"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

type CreateBody = {
  title?: string
  prompt?: string
  schedule?: unknown
  mode?: "task" | "condition"
}

type UpdateBody = {
  id?: string
  enabled?: boolean
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  const tasks = await listScheduledTasks(entitlement.userId)
  return Response.json({ ok: true, runtime: scheduledTasksStatus(), tasks }, {
    headers: { "cache-control": "no-store" },
  })
}

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  const body = await request.json().catch(() => ({})) as CreateBody

  try {
    const task = await createScheduledTask({
      userId: entitlement.userId,
      title: body.title,
      prompt: String(body.prompt || ""),
      schedule: body.schedule,
      mode: body.mode,
    })
    return Response.json({ ok: true, task }, {
      status: 201,
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ ok: false, error: "SCHEDULE_CREATE_FAILED", message: message.slice(0, 900), runtime: scheduledTasksStatus() }, {
      status: /not configured/i.test(message) ? 503 : 400,
      headers: { "cache-control": "no-store" },
    })
  }
}

export async function PATCH(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  const body = await request.json().catch(() => ({})) as UpdateBody
  const id = String(body.id || "").trim()
  if (!id || typeof body.enabled !== "boolean") {
    return Response.json({ ok: false, error: "INVALID_AUTOMATION_UPDATE" }, { status: 400 })
  }
  try {
    const task = await setScheduledTaskEnabled(entitlement.userId, id, body.enabled)
    if (!task) return Response.json({ ok: false, error: "AUTOMATION_NOT_FOUND" }, { status: 404 })
    return Response.json({ ok: true, task }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    return Response.json({
      ok: false,
      error: "SCHEDULE_UPDATE_FAILED",
      message: (error instanceof Error ? error.message : String(error)).slice(0, 900),
    }, { status: 400, headers: { "cache-control": "no-store" } })
  }
}

export async function DELETE(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  const id = new URL(request.url).searchParams.get("id") || ""
  try {
    const deleted = await deleteScheduledTask(entitlement.userId, id)
    return Response.json({ ok: true, deleted }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    return Response.json({
      ok: false,
      error: "SCHEDULE_DELETE_FAILED",
      message: (error instanceof Error ? error.message : String(error)).slice(0, 900),
    }, { status: 400, headers: { "cache-control": "no-store" } })
  }
}
