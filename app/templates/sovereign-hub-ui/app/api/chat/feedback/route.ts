import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import {
  cleanModelId,
  isFeedbackMessageId,
  readAnswerFeedback,
  readFeedbackSummary,
  recordAnswerFeedback,
} from "@/lib/server/answer-feedback"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PRIVATE = { "cache-control": "private, no-store" }
const MAX_BODY = 2_048

/** The viewer's own marks; the owner can also ask for the daily totals (?summary=14). */
export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!takeRequestFrequency("answer-feedback-read", entitlement.userId, 30)) {
    return Response.json({ ok: false, error: "Слишком много запросов. Попробуйте через минуту." }, { status: 429, headers: { ...PRIVATE, "retry-after": "60" } })
  }
  const summary = new URL(request.url).searchParams.get("summary")
  if (summary !== null) {
    if (entitlement.plan !== "owner") return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403, headers: PRIVATE })
    return Response.json({ ok: true, days: await readFeedbackSummary(Number(summary) || 14) }, { headers: PRIVATE })
  }
  const feedback = await readAnswerFeedback({ userId: entitlement.userId, authenticated: entitlement.authenticated })
  return Response.json({ ok: true, feedback }, { headers: PRIVATE })
}

/** Set or clear (value: null) the mark on one answer. */
export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!takeRequestFrequency("answer-feedback", entitlement.userId, 60)) {
    return Response.json({ ok: false, error: "Слишком много оценок. Попробуйте через минуту." }, { status: 429, headers: { ...PRIVATE, "retry-after": "60" } })
  }
  // JSON only: a cross-site form cannot send it without a CORS preflight.
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return Response.json({ ok: false, error: "JSON_REQUIRED" }, { status: 415, headers: PRIVATE })
  }
  const raw = await request.text().catch(() => "")
  if (raw.length > MAX_BODY) return Response.json({ ok: false, error: "BODY_TOO_LARGE" }, { status: 413, headers: PRIVATE })
  let body: { messageId?: unknown; value?: unknown; modelId?: unknown } = {}
  try { body = JSON.parse(raw || "{}") } catch {
    return Response.json({ ok: false, error: "INVALID_JSON" }, { status: 400, headers: PRIVATE })
  }
  const value = body.value === "up" || body.value === "down" ? body.value : body.value === null ? null : undefined
  if (!isFeedbackMessageId(body.messageId) || value === undefined) {
    return Response.json({ ok: false, error: "INVALID_FEEDBACK" }, { status: 400, headers: PRIVATE })
  }
  const result = await recordAnswerFeedback(
    { userId: entitlement.userId, authenticated: entitlement.authenticated },
    { messageId: body.messageId, value, modelId: cleanModelId(body.modelId) },
  )
  if (!result.stored) return Response.json({ ok: false, error: "STORAGE_UNAVAILABLE" }, { status: 503, headers: PRIVATE })
  return Response.json({ ok: true, value, where: result.where }, { headers: PRIVATE })
}
