import { normalizeBackgroundTurnId, readBackgroundChatTurn } from "@/lib/server/background-chat-turns"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { z } from "zod"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { stopRunningTurn } from "@/lib/server/turn-cancellation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ turnId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { turnId: rawTurnId } = await context.params
  const parsed = z.string().uuid().safeParse(rawTurnId)
  const turnId = parsed.success ? normalizeBackgroundTurnId(parsed.data) : ""
  if (!turnId) {
    return Response.json({ ok: false, error: "INVALID_BACKGROUND_TURN_ID" }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    })
  }

  const entitlement = await resolveRequestEntitlement(request)
  if (!takeRequestFrequency("background-read", entitlement.userId, 120)) return Response.json({ ok: false, error: "Слишком много запросов. Попробуйте через минуту." }, { status: 429, headers: { "cache-control": "private, no-store", "retry-after": "60" } })
  const turn = await readBackgroundChatTurn(turnId)
  // Fail closed: historical records without an owner must never be exposed
  // to whoever knows or obtains their UUID, even before their TTL expires.
  if (!turn || !turn.ownerId || !entitlement.authenticated || turn.ownerId !== entitlement.userId) {
    return Response.json({ ok: false, error: "BACKGROUND_TURN_NOT_FOUND" }, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    })
  }

  return Response.json({
    ok: true,
    turn: {
      ...turn.responseMetadata,
      status: turn.status,
      // Failed jobs may carry partial text, but never a false success status.
      content: turn.status === "complete" || turn.status === "failed" ? turn.content || "" : undefined,
      error: turn.status === "failed" ? turn.error || "Background chat failed" : undefined,
      provider: turn.provider,
      model: turn.model,
      execution: turn.execution,
      completedAt: turn.completedAt,
      expiresAt: turn.expiresAt,
    },
  }, {
    headers: { "cache-control": "private, no-store" },
  })
}

/**
 * The owner's «Стоп»: aborts the generation still running for this turn and
 * keeps what was written. Another account's turn is reported as not found.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const { turnId: rawTurnId } = await context.params
  const parsed = z.string().uuid().safeParse(rawTurnId)
  const turnId = parsed.success ? normalizeBackgroundTurnId(parsed.data) : ""
  if (!turnId) {
    return Response.json({ ok: false, error: "INVALID_BACKGROUND_TURN_ID" }, { status: 400, headers: { "cache-control": "no-store" } })
  }
  const entitlement = await resolveRequestEntitlement(request)
  if (!takeRequestFrequency("background-stop", entitlement.userId, 60)) {
    return Response.json({ ok: false, error: "Слишком много запросов. Попробуйте через минуту." }, { status: 429, headers: { "cache-control": "private, no-store", "retry-after": "60" } })
  }
  const result = stopRunningTurn(turnId, entitlement.userId)
  if (result === "forbidden") {
    return Response.json({ ok: false, error: "BACKGROUND_TURN_NOT_FOUND" }, { status: 404, headers: { "cache-control": "private, no-store" } })
  }
  return Response.json({ ok: true, stopped: result === "stopped" }, { headers: { "cache-control": "private, no-store" } })
}
