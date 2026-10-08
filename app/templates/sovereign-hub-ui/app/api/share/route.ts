import { NextResponse } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { createSharedAnswer, sharedAnswersConfigured } from "@/lib/server/shared-answers"
import { SHARE_LIMITS, sanitizeShareInput, sharePath } from "@/lib/share/contract"
import { shareErrorText } from "@/lib/share/messages"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "private, no-store" }

const STATUS: Record<string, number> = {
  ACCOUNT_LIMIT: 409,
  CONFLICT: 409,
  DAILY_LIMIT: 429,
  STORAGE_UNAVAILABLE: 503,
  ANSWER_TOO_LARGE: 413,
}

function fail(code: string, status = STATUS[code] || 400) {
  return NextResponse.json({ ok: false, error: code, message: shareErrorText(code) }, { status, headers: NO_STORE })
}

/**
 * Publish one finished answer as a public page. Signed-in accounts only:
 * a page on malikaiworld.world always has an owner who can remove it.
 */
export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId.startsWith("guest")) return fail("AUTH_REQUIRED", 401)
  if (!takeRequestFrequency("share-create", entitlement.userId, 12)) return fail("TOO_FREQUENT", 429)
  if (!sharedAnswersConfigured()) return fail("STORAGE_UNAVAILABLE")

  let body: unknown
  try {
    body = await readJsonBodyLimited(request, SHARE_LIMITS.requestBytes)
  } catch (error) {
    if (error instanceof RequestSafetyError) return fail(error.code, error.status)
    return fail("INVALID_JSON")
  }

  const input = sanitizeShareInput(body)
  if (!input.ok) return fail(input.code)

  const result = await createSharedAnswer(entitlement.userId, input.value)
  if (!result.ok) return fail(result.code)
  return NextResponse.json({
    ok: true,
    existing: result.existing,
    share: {
      id: result.record.id,
      path: sharePath(result.record.id),
      discoverable: result.record.discoverable,
      createdAt: result.record.createdAt,
    },
  }, { status: result.existing ? 200 : 201, headers: NO_STORE })
}
