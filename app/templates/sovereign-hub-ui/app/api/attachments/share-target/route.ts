import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { consumeShareTarget } from "@/lib/server/share-target-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId === "guest") {
    return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const token = new URL(request.url).searchParams.get("token")
  const payload = consumeShareTarget(token, entitlement.userId)
  if (!payload) {
    return Response.json({ ok: false, error: "SHARE_TARGET_NOT_FOUND" }, { status: 404 })
  }

  return Response.json({
    ok: true,
    title: payload.title,
    text: payload.text,
    url: payload.url,
    files: payload.files,
  }, { headers: { "cache-control": "no-store" } })
}
