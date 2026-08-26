import { Buffer } from "node:buffer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// xAI currently exposes the built-in voice ids ara/eve/leo/rex/sal. Malik AI
// keeps ten UI profiles, but every profile must resolve to a real xAI voice id
// so selecting an extra profile never sends an invalid voice_id to /v1/tts.
const XAI_VOICES: Record<string, string> = {
  Sola: "ara",
  Eve: "eve",
  Leo: "leo",
  Rex: "rex",
  Sal: "sal",
  Carina: "ara",
  Luna: "eve",
  Orion: "leo",
  Aurora: "eve",
  Atlas: "rex",
}

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ""
}

function detectLanguage(text: string) {
  if (/[а-яё]/i.test(text)) return "ru"
  if (/[әіңғүұқөһ]/i.test(text)) return "ru"
  return "en"
}

async function xaiTts(text: string, voice: string, language: string) {
  const key = env("XAI_VOICE_API_KEY", "XAI_API_KEY")
  if (!key) return null
  const voiceId = XAI_VOICES[voice] || "ara"
  const response = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "audio/mpeg,application/octet-stream;q=0.9,*/*;q=0.8",
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language: language || "auto",
      output_format: {
        codec: "mp3",
        sample_rate: 24000,
        bit_rate: 128000,
      },
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500)
    console.warn(`[VOICE_XAI_TTS_ERROR] status=${response.status} voice=${voiceId} ${detail}`)
    return null
  }

  const bytes = await response.arrayBuffer()
  if (bytes.byteLength < 128) {
    console.warn(`[VOICE_XAI_TTS_ERROR] empty audio voice=${voiceId} bytes=${bytes.byteLength}`)
    return null
  }

  return new Response(bytes, {
    headers: {
      "content-type": response.headers.get("content-type") || "audio/mpeg",
      "cache-control": "no-store",
      "x-malik-tts-provider": "xai",
      "x-malik-tts-voice": voiceId,
    },
  })
}

function extractCloudflareAudio(payload: any): Buffer | null {
  const result = payload?.result ?? payload
  const candidates = [result, result?.audio, result?.data, result?.mp3, result?.response]
  for (const value of candidates) {
    if (typeof value !== "string" || value.length < 32) continue
    const clean = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value
    try {
      const decoded = Buffer.from(clean, "base64")
      if (decoded.byteLength > 128) return decoded
    } catch {}
  }
  return null
}

async function cloudflareTts(text: string, language: string) {
  const token = env("CLOUDFLARE_VOICE_API_TOKEN", "CLOUDFLARE_API_TOKEN")
  const account = env("CLOUDFLARE_VOICE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")
  if (!token || !account) return null
  const model = env("CLOUDFLARE_TTS_MODEL") || "@cf/myshell-ai/melotts"
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ prompt: text, lang: language === "ru" ? "ru" : "en" }),
    cache: "no-store",
  })
  if (!response.ok) {
    console.warn(`[VOICE_CF_TTS_ERROR] status=${response.status}`)
    return null
  }
  const contentType = response.headers.get("content-type") || ""
  if (contentType.startsWith("audio/")) {
    return new Response(await response.arrayBuffer(), { headers: { "content-type": contentType, "cache-control": "no-store", "x-malik-tts-provider": "cloudflare" } })
  }
  const payload = await response.json().catch(() => null)
  const audio = extractCloudflareAudio(payload)
  if (!audio) return null
  return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-malik-tts-provider": "cloudflare" } })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const text = String(body?.text || "").trim().slice(0, 3500)
  const voice = String(body?.voice || "Sola")
  const language = String(body?.language || detectLanguage(text))
  if (!text) return Response.json({ ok: false, error: "Пустой текст" }, { status: 400 })

  try {
    const xai = await xaiTts(text, voice, language)
    if (xai) return xai

    // Zero-cost fallback if xAI is unavailable. VoiceMode then either plays the
    // returned audio or uses the device SpeechSynthesis fallback.
    const cloudflare = await cloudflareTts(text, language)
    if (cloudflare) return cloudflare
  } catch (error) {
    console.warn("[VOICE_TTS_PROVIDER_ERROR]", error instanceof Error ? error.message : error)
  }

  return Response.json({ ok: false, fallback: "browser", error: "Use browser speech synthesis" }, { status: 503 })
}
