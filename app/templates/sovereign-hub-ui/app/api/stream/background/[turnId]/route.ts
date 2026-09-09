import { normalizeBackgroundTurnId, readBackgroundChatTurn } from "@/lib/server/background-chat-turns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ turnId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { turnId: rawTurnId } = await context.params
  const turnId = normalizeBackgroundTurnId(rawTurnId)
  if (!turnId) {
    return Response.json({ ok: false, error: "INVALID_BACKGROUND_TURN_ID" }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    })
  }

  const turn = await readBackgroundChatTurn(turnId)
  if (!turn) {
    return Response.json({ ok: false, error: "BACKGROUND_TURN_NOT_FOUND" }, {
      status: 404,
      headers: { "cache-control": "no-store" },
    })
  }

  return Response.json({
    ok: true,
    turn: {
      status: turn.status,
      content: turn.status === "complete" ? turn.content || "" : undefined,
      error: turn.status === "failed" ? turn.error || "Background chat failed" : undefined,
      provider: turn.provider,
      model: turn.model,
      completedAt: turn.completedAt,
      expiresAt: turn.expiresAt,
    },
  }, {
    headers: { "cache-control": "no-store" },
  })
}
