import { appendGodAudit } from "@/lib/god-mode/audit-log"
import { createOrResumeMission } from "@/lib/god-mode/mission"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { readJsonBodyLimited } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт, чтобы миссия пережила перезагрузку." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  }

  const body = await readJsonBodyLimited<Record<string, unknown>>(request, 64 * 1024)
  const goal = String(body.goal || body.prompt || "").trim()
  if (!goal) return withGodTraceHeaders(Response.json({ ok: false, code: "GOAL_REQUIRED", error: "Опишите цель." }, { status: 400 }), trace, { operation: "project-state", budgetMs: 1500 })
  const idempotencyKey = String(request.headers.get("idempotency-key") || body.idempotencyKey || "").trim()
  if (idempotencyKey.length < 8) {
    return withGodTraceHeaders(Response.json({ ok: false, code: "IDEMPOTENCY_KEY_REQUIRED", error: "Для большой миссии нужен стабильный Idempotency-Key." }, { status: 400 }), trace, { operation: "project-state", budgetMs: 1500 })
  }

  const mission = await createOrResumeMission(entitlement.userId, {
    goal: goal.slice(0, 8_000),
    title: String(body.title || "").trim().slice(0, 120) || undefined,
    idempotencyKey: idempotencyKey.slice(0, 180),
  })

  await appendGodAudit(entitlement.userId, {
    category: "project",
    action: mission.reused ? "mission.resume" : "mission.create",
    success: true,
    traceId: trace.traceId,
    resourceId: mission.project.id,
    metadata: { tasks: mission.plan.length },
  }).catch(() => undefined)

  return withGodTraceHeaders(Response.json({
    ok: true,
    reused: mission.reused,
    project: mission.project,
    plan: mission.plan,
    execution: {
      state: "planned",
      note: "Tasks are real durable project tasks. Capability executors mark them running/completed; the planner never fakes completion.",
    },
  }, { status: mission.reused ? 200 : 201, headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
}
