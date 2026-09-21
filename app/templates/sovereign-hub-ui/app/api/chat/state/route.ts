import { NextResponse } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import {
  accountChatStateConfigured,
  readAccountChatState,
  writeAccountChatState,
} from "@/lib/server/account-chat-state"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function unauthorized() {
  return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId === "guest") return unauthorized()

  const result = await readAccountChatState(entitlement.userId)
  return NextResponse.json({
    ok: true,
    configured: result.configured,
    savedAt: result.savedAt,
    state: result.state,
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function PUT(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId === "guest") return unauthorized()

  let body: any
  try {
    body = await readJsonBodyLimited(request, 8 * 1024 * 1024)
  } catch (error) {
    const status = error instanceof RequestSafetyError ? error.status : 400
    return NextResponse.json({ ok: false, error: error instanceof RequestSafetyError ? error.code : "INVALID_JSON" }, { status })
  }

  const state = body?.state
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return NextResponse.json({ ok: false, error: "INVALID_CHAT_STATE" }, { status: 400 })
  }

  if (!accountChatStateConfigured()) {
    return NextResponse.json({ ok: true, configured: false, stored: false, savedAt: "" }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  }

  try {
    const result = await writeAccountChatState(entitlement.userId, state)
    return NextResponse.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "PRIVATE_STATE_TOO_LARGE"
    return NextResponse.json({
      ok: false,
      error: tooLarge ? "CHAT_STATE_TOO_LARGE" : "CHAT_STATE_PERSISTENCE_FAILED",
    }, { status: tooLarge ? 413 : 503 })
  }
}
