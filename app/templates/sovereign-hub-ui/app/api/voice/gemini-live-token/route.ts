import { NextResponse } from "next/server"

import { mintLiveToken } from "@/lib/server/gemini-live-token"
import { LIVE_WS_URL } from "@/lib/voice/gemini-live-setup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const minted = await mintLiveToken()
  if (!minted.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: minted.reason === "no_key" ? "voice_live_not_configured" : "voice_live_token_unavailable",
        reason: minted.reason,
        displayMessage: minted.message,
      },
      { status: minted.status },
    )
  }

  return NextResponse.json(
    { ok: true, accessToken: minted.token, model: minted.model, websocketUrl: LIVE_WS_URL },
    { headers: { "cache-control": "no-store, private" } },
  )
}
