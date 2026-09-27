import { listGodNotifications, markAllGodNotificationsRead, markGodNotificationRead } from "@/lib/god-mode/notifications"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"
import { readJsonBodyLimited } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  const items = await listGodNotifications(entitlement.userId)
  return withGodTraceHeaders(Response.json({
    ok: true,
    unread: items.filter((item) => !item.read).length,
    notifications: items.slice(0, 80),
  }, { headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
}

export async function PATCH(request: Request) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  const body = await readJsonBodyLimited<Record<string, unknown>>(request, 8 * 1024)
  const all = body.all === true
  const id = String(body.id || "").trim()
  const changed = all ? await markAllGodNotificationsRead(entitlement.userId) : id ? Number(await markGodNotificationRead(entitlement.userId, id)) : 0
  return withGodTraceHeaders(Response.json({ ok: true, changed }), trace, { operation: "project-state", budgetMs: 1500 })
}
