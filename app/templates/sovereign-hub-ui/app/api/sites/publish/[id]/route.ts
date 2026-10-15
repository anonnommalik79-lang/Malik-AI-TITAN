import { NextResponse } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { unpublishSite } from "@/lib/server/published-sites"
import { publishErrorText } from "@/lib/sites/forge/publish"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }
const NO_STORE = { "Cache-Control": "private, no-store" }
const STATUS: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, STORAGE_UNAVAILABLE: 503 }

function fail(code: string, status = STATUS[code] || 400) {
  return NextResponse.json({ ok: false, error: code, message: publishErrorText(code) }, { status, headers: NO_STORE })
}

/** Take a published site down: the link stops working at once. Its author or the founder account. */
export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId.startsWith("guest")) return fail("AUTH_REQUIRED", 401)
  if (!takeRequestFrequency("site-unpublish", entitlement.userId, 30)) return fail("TOO_FREQUENT", 429)
  const result = await unpublishSite(id, { userId: entitlement.userId, moderator: entitlement.plan === "owner" })
  if (!result.ok) return fail(result.code)
  return NextResponse.json({ ok: true, deleted: id }, { headers: NO_STORE })
}
