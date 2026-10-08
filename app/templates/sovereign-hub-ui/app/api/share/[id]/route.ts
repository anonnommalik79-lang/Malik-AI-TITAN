import { NextResponse } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { deleteSharedAnswer, setSharedAnswerDiscoverable, type ShareActor } from "@/lib/server/shared-answers"
import { isShareId } from "@/lib/share/contract"
import { shareErrorText } from "@/lib/share/messages"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

const NO_STORE = { "Cache-Control": "private, no-store" }
const STATUS: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409, STORAGE_UNAVAILABLE: 503 }

function fail(code: string, status = STATUS[code] || 400) {
  return NextResponse.json({ ok: false, error: code, message: shareErrorText(code) }, { status, headers: NO_STORE })
}

/** The author, or the founder account for moderation; never a visitor. */
async function actorFor(request: Request): Promise<ShareActor | NextResponse> {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId.startsWith("guest")) return fail("AUTH_REQUIRED", 401)
  if (!takeRequestFrequency("share-change", entitlement.userId, 30)) return fail("TOO_FREQUENT", 429)
  return { userId: entitlement.userId, moderator: entitlement.plan === "owner" }
}

/** Show the page in search engines, or hide it again. */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params
  if (!isShareId(id)) return fail("NOT_FOUND")
  const actor = await actorFor(request)
  if (actor instanceof NextResponse) return actor

  let body: Record<string, unknown>
  try {
    body = await readJsonBodyLimited(request, 4096)
  } catch (error) {
    if (error instanceof RequestSafetyError) return fail(error.code, error.status)
    return fail("INVALID_JSON")
  }
  if (typeof body?.discoverable !== "boolean") return fail("INVALID_BODY")

  const result = await setSharedAnswerDiscoverable(id, actor, body.discoverable)
  if (!result.ok) return fail(result.code)
  return NextResponse.json({ ok: true, share: { id, discoverable: Boolean(result.record?.discoverable) } }, { headers: NO_STORE })
}

/** Remove the page: the link stops working at once. */
export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params
  if (!isShareId(id)) return fail("NOT_FOUND")
  const actor = await actorFor(request)
  if (actor instanceof NextResponse) return actor
  const result = await deleteSharedAnswer(id, actor)
  if (!result.ok) return fail(result.code)
  return NextResponse.json({ ok: true, deleted: id }, { headers: NO_STORE })
}
