import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TOKEN_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens"
const WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained"

function voiceKey() {
  return process.env.MALIK_VOICE_GEMINI_KEY?.trim()
    || process.env.GEMINI_VOICE_API_KEY?.trim()
    || process.env.GEMINI_API_KEY?.trim()
    || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
    || process.env.GOOGLE_AI_API_KEY?.trim()
    || ""
}

export async function GET() {
  const key = voiceKey()
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        error: "voice_live_not_configured",
        reason: "no_key",
        displayMessage: "Голосовой ключ Gemini не настроен на сервере.",
      },
      { status: 503 },
    )
  }

  const model = process.env.MALIK_VOICE_MODEL?.trim() || "gemini-3.8-live"
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  // A minute was not enough on a phone that has just woken up or switched
  // network: the token expired between being minted and the websocket opening,
  // and Voice looked broken for no reason the person could see.
  const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString()

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "content-type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        uses: 1,
        expireTime,
        newSessionExpireTime,
      }),
    })
    const payload = await response.json().catch(() => ({})) as { name?: string; error?: { message?: string } }
    if (!response.ok || !payload.name) {
      console.error("[VOICE_GEMINI_LIVE_TOKEN_ERROR]", response.status, payload.error?.message || "token unavailable")
      return NextResponse.json(
        {
          ok: false,
          error: "voice_live_token_unavailable",
          reason: response.status === 429 ? "rate_limited" : response.status === 403 ? "forbidden" : "upstream",
          displayMessage: response.status === 429
            ? "Gemini Live сейчас перегружен. Попробуй через минуту."
            : "Google не выдал ключ для голосовой сессии.",
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { ok: true, accessToken: payload.name, model, websocketUrl: WS_URL },
      { headers: { "cache-control": "no-store, private" } },
    )
  } catch (error) {
    console.error("[VOICE_GEMINI_LIVE_TOKEN_ERROR]", error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      {
        ok: false,
        error: "voice_live_token_unavailable",
        reason: "network",
        displayMessage: "Не получилось связаться с Google для голосовой сессии.",
      },
      { status: 503 },
    )
  }
}
