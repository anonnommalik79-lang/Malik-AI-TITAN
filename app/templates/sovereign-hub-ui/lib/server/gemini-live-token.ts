import "server-only"

import { DEFAULT_LIVE_MODEL, LIVE_TOKEN_URL } from "@/lib/voice/gemini-live-setup"

/**
 * The permanent key, and which setting it came from.
 *
 * The name is reported by the self-check so a missing key is a one-line
 * answer - "поставь MALIK_VOICE_GEMINI_KEY" - instead of a 503 nobody can
 * explain. The key itself never leaves this module.
 */
const KEY_NAMES = [
  "MALIK_VOICE_GEMINI_KEY",
  "GEMINI_VOICE_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_AI_API_KEY",
] as const

export function voiceKeySource() {
  for (const name of KEY_NAMES) {
    const key = process.env[name]?.trim()
    if (key) return { name, key }
  }
  return { name: "", key: "" }
}

export function voiceKey() {
  return voiceKeySource().key
}

export function liveModel() {
  return process.env.MALIK_VOICE_MODEL?.trim() || DEFAULT_LIVE_MODEL
}

export type MintedToken =
  | { ok: true; token: string; model: string }
  | { ok: false; status: number; reason: "no_key" | "rate_limited" | "forbidden" | "upstream" | "network"; message: string }

/**
 * A short-lived token the browser may hold.
 *
 * One use, and only a couple of minutes to start a session with - long enough
 * for a phone that has just woken up or changed network, short enough that a
 * token caught in transit is worth nothing by the time anyone could use it.
 * The session it opens then lives for half an hour, and reconnects mint their
 * own.
 */
export async function mintLiveToken(uses = 1): Promise<MintedToken> {
  const { key } = voiceKeySource()
  if (!key) {
    return { ok: false, status: 503, reason: "no_key", message: "Ключ Gemini не настроен на сервере." }
  }

  const model = liveModel()
  try {
    const response = await fetch(LIVE_TOKEN_URL, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        uses,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      }),
    })
    const payload = await response.json().catch(() => ({})) as { name?: string; error?: { message?: string } }
    if (!response.ok || !payload.name) {
      // Google says why in plain words - "API key not valid", "quota
      // exceeded", "model not found". Swallowing that and printing a generic
      // 503 is what turns a two-minute fix into an afternoon.
      const upstream = String(payload.error?.message || "").slice(0, 200)
      console.error("[VOICE_GEMINI_LIVE_TOKEN_ERROR]", response.status, upstream || "token unavailable")
      const base = response.status === 429
        ? "Лимит Gemini исчерпан или сервис перегружен."
        : response.status === 403
          ? "Запрос отклонён с кодом 403 — обычно это ключ без доступа к Live API (реже — сеть, которая режет запрос)."
          : response.status === 400
            ? "Google не принял запрос (400) — проверь имя модели в MALIK_VOICE_MODEL."
            : `Google не выдал ключ для сессии (HTTP ${response.status}).`
      return {
        ok: false,
        status: 503,
        reason: response.status === 429 ? "rate_limited" : response.status === 403 ? "forbidden" : "upstream",
        message: upstream ? `${base} Ответ Google: ${upstream}` : base,
      }
    }
    return { ok: true, token: payload.name, model }
  } catch (error) {
    console.error("[VOICE_GEMINI_LIVE_TOKEN_ERROR]", error instanceof Error ? error.message : String(error))
    return { ok: false, status: 503, reason: "network", message: "Не получилось связаться с Google." }
  }
}
