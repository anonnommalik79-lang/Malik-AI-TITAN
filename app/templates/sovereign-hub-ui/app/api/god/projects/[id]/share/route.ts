import { appendGodAudit } from "@/lib/god-mode/audit-log"
import { createProjectShare, revokeProjectShare } from "@/lib/god-mode/share"
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
  const body = await readJsonBodyLimited<Record<string, unknown>>(request, 8 * 1024)
  const ttlHours = Number(body.ttlHours || 24)
  const share = await createProjectShare(entitlement.userId, id, ttlHours)
  if (!share) return withGodTraceHeaders(Response.json({ ok: false, code: "SHARE_UNAVAILABLE", error: "Не удалось создать ссылку. Проверьте private object storage." }, { status: 503 }), trace, { operation: "project-state", budgetMs: 1500 })

  await appendGodAudit(entitlement.userId, {
    category: "project",
    action: "project.share.create",
    success: true,
    traceId: trace.traceId,
    resourceId: id,
    metadata: { shareId: share.id, expiresAt: share.expiresAt },
  }).catch(() => undefined)

  return withGodTraceHeaders(Response.json({
    ok: true,
    shareId: share.id,
    shareUrl: `/api/god/share/${encodeURIComponent(share.token)}`,
    expiresAt: share.expiresAt,
  }, { status: 201, headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-state", budgetMs: 1500 })
}

export async function DELETE(request: Request, context: Context) {
  const trace = createGodTrace(request)
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return withGodTraceHeaders(Response.json({ ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт." }, { status: 401 }), trace, { operation: "project-state", budgetMs: 1500 })
  const { id } = await context.params
  const shareId = String(new URL(request.url).searchParams.get("shareId") || "").trim()
  const revoked = await revokeProjectShare(entitlement.userId, shareId)
  await appendGodAudit(entitlement.userId, {
    category: "project",
    action: "project.share.revoke",
    success: revoked,
    traceId: trace.traceId,
    resourceId: id,
    metadata: { shareId },
  }).catch(() => undefined)
  return withGodTraceHeaders(Response.json(revoked ? { ok: true, revoked: shareId } : { ok: false, code: "SHARE_NOT_FOUND", error: "Ссылка не найдена." }, { status: revoked ? 200 : 404 }), trace, { operation: "project-state", budgetMs: 1500 })
}
