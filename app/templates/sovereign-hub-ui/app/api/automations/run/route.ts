import { DEFAULT_MALIK_MODEL_ID } from "@/lib/ai/malik-models"
import { malikGodAnswer } from "@/lib/malik-god-router"
import { listDueScheduledTasks, recordScheduledTaskRun, scheduledTasksStatus, type MalikScheduledTask } from "@/lib/server/scheduled-tasks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(request: Request) {
  const expected = String(process.env.MALIK_SCHEDULER_SECRET || "").trim()
  const supplied = String(request.headers.get("x-malik-scheduler-secret") || "").trim()
  if (!expected || !supplied) return false
  if (expected.length !== supplied.length) return false
  let mismatch = 0
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index)
  return mismatch === 0
}

async function executeTask(task: MalikScheduledTask) {
  const startedAt = Date.now()
  const conditionInstruction = task.mode === "condition"
    ? [
        "",
        "AUTOMATION CONDITION MODE:",
        "Check the requested condition using fresh evidence when the prompt requires current information.",
        "If the condition is NOT satisfied and there is no meaningful change, return exactly MALIK_SILENT.",
        "If the condition IS satisfied, return the concise user-facing notification with the evidence needed to act.",
      ].join("\n")
    : ""

  try {
    const answer = await malikGodAnswer({
      prompt: [
        task.prompt,
        conditionInstruction,
        "",
        "AUTOMATION SAFETY:",
        "This is an unattended cloud run. Do not purchase, send, publish, delete, install software, change permissions, or perform another externally visible/destructive action. Produce the result only.",
      ].filter(Boolean).join("\n"),
      responseDepth: task.mode === "condition" ? "deep" : "balanced",
      metadata: { superpowerId: task.mode === "condition" ? "monitoring" : "scheduled-tasks" },
    }, { modelId: DEFAULT_MALIK_MODEL_ID })

    const content = String(answer.content || "").trim()
    const silent = /^MALIK_SILENT[.!]*$/i.test(content)
    const stored = await recordScheduledTaskRun(task, {
      status: silent ? "silent" : "complete",
      result: silent ? "" : content,
      ranAt: startedAt,
    })
    return {
      id: task.id,
      ok: true,
      silent,
      nextRunAt: stored.nextRunAt,
      provider: answer.provider,
      model: answer.model,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stored = await recordScheduledTaskRun(task, {
      status: "failed",
      error: message,
      ranAt: startedAt,
    }).catch(() => task)
    return {
      id: task.id,
      ok: false,
      error: message.slice(0, 700),
      nextRunAt: stored.nextRunAt,
    }
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  return Response.json({ ok: true, runtime: scheduledTasksStatus() }, {
    headers: { "cache-control": "no-store" },
  })
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  if (!scheduledTasksStatus().configured) {
    return Response.json({ ok: false, error: "SCHEDULER_STORAGE_NOT_CONFIGURED" }, { status: 503 })
  }

  const due = await listDueScheduledTasks(Date.now(), 24)
  const results: Array<Record<string, unknown>> = []
  for (let index = 0; index < due.length; index += 3) {
    results.push(...await Promise.all(due.slice(index, index + 3).map(executeTask)))
  }

  return Response.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    due: due.length,
    completed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    surfaced: results.filter((item) => item.ok && !item.silent).length,
    results,
  }, { headers: { "cache-control": "no-store" } })
}
