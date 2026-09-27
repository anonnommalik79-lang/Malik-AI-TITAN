import { createGodTask } from "@/lib/god-mode/project-state"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { readJsonBodyLimited } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  const { id } = await context.params
  const body = await readJsonBodyLimited<Record<string, unknown>>(request, 32 * 1024)
  const type = String(body.type || "").trim()
  const label = String(body.label || "").trim()
  if (!type || !label) return withGodTraceHeaders(Response.json({ ok: false, code: "TASK_INPUT_REQUIRED", error: "type и label обязательны." }, { status: 400 }), trace, { operation: "project-state", budgetMs: 1500 })

  const task = await createGodTask(id, entitlement.userId, {
    type,
    label,
    dependencies: Array.isArray(body.dependencies) ? body.dependencies.map(String).slice(0, 32) : [],
    idempotencyKey: String(request.headers.get("idempotency-key") || body.idempotencyKey || "").trim(),
    maxAttempts: Number(body.maxAttempts || 3),
    provider: String(body.provider || "").trim() || undefined,
  })
  if (!task) return withGodTraceHeaders(Response.json({ ok: false, code: "PROJECT_NOT_FOUND", error: "Проект не найден." }, { status: 404 }), trace, { operation: "project-state", budgetMs: 1500 })
  return withGodTraceHeaders(Response.json({ ok: true, task }, { status: 201, headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
}
