import { searchGodProjects, createGodProject, listGodProjects } from "@/lib/god-mode/project-state"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authError(traceId: string) {
  return Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт.", diagnosticId: traceId }, { status: 401, headers: { "cache-control": "private, no-store" } })
}

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return withGodTraceHeaders(authError(trace.diagnosticId), trace, { operation: "project-state", budgetMs: 1500 })

  const query = new URL(request.url).searchParams.get("q")?.trim() || ""
  const data = query
    ? await searchGodProjects(entitlement.userId, query, 20)
    : await listGodProjects(entitlement.userId)

  return withGodTraceHeaders(Response.json({
    ok: true,
    query: query || undefined,
    projects: data,
  }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
}

export async function POST(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return withGodTraceHeaders(authError(trace.diagnosticId), trace, { operation: "project-state", budgetMs: 1500 })

  try {
    const body = await readJsonBodyLimited<{ title?: unknown; goal?: unknown }>(request, 32 * 1024)
    const goal = String(body.goal || "").trim()
    if (!goal) return withGodTraceHeaders(Response.json({ ok: false, code: "GOAL_REQUIRED", error: "Опишите цель проекта." }, { status: 400 }), trace, { operation: "project-state", budgetMs: 1500 })
    const project = await createGodProject(entitlement.userId, { title: String(body.title || "").trim(), goal })
    return withGodTraceHeaders(Response.json({ ok: true, project }, { status: 201, headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
  } catch (error) {
    const status = error instanceof RequestSafetyError ? error.status : 500
    return withGodTraceHeaders(Response.json({ ok: false, code: error instanceof RequestSafetyError ? error.code : "PROJECT_CREATE_FAILED", error: error instanceof RequestSafetyError ? error.message : "Не удалось создать проект.", diagnosticId: trace.diagnosticId }, { status }), trace, { operation: "project-state", budgetMs: 1500 })
  }
}
