import { NextResponse } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { publishedSitesConfigured, publishSite } from "@/lib/server/published-sites"
import { PUBLISH_LIMITS, publishErrorText, sitePath } from "@/lib/sites/forge/publish"
import { getPublicUrl } from "@/lib/public-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "private, no-store" }
const STATUS: Record<string, number> = { ACCOUNT_LIMIT: 409, CONFLICT: 409, DAILY_LIMIT: 429, STORAGE_UNAVAILABLE: 503, SITE_TOO_LARGE: 413, NOT_A_SITE: 422, INVALID_SITE: 422 }

function fail(code: string, status = STATUS[code] || 400) {
  return NextResponse.json({ ok: false, error: code, message: publishErrorText(code) }, { status, headers: NO_STORE })
}

/**
 * Publish a Malik Site Forge page at /site/<id>. Signed-in accounts only, so
 * every public page has an owner who can take it down. The server renders
 * the page again from its plan; the posted HTML itself is never stored.
 */
export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId.startsWith("guest")) return fail("AUTH_REQUIRED", 401)
  if (!takeRequestFrequency("site-publish", entitlement.userId, 10)) return fail("TOO_FREQUENT", 429)
  if (!publishedSitesConfigured()) return fail("STORAGE_UNAVAILABLE")

  let body: Record<string, unknown>
  try {
    body = await readJsonBodyLimited(request, PUBLISH_LIMITS.requestBytes)
  } catch (error) {
    if (error instanceof RequestSafetyError) return fail(error.code, error.status)
    return fail("INVALID_JSON")
  }

  const result = await publishSite(entitlement.userId, body?.html)
  if (!result.ok) return fail(result.code)
  const path = sitePath(result.record.id)
  return NextResponse.json({
    ok: true,
    updated: result.updated,
    site: { id: result.record.id, path, url: getPublicUrl(path), title: result.record.title, updatedAt: result.record.updatedAt },
  }, { status: result.updated ? 200 : 201, headers: NO_STORE })
}
