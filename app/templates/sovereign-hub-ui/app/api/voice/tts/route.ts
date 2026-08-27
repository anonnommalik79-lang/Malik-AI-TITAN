export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function detectLanguage(text: string) {
  if (/[а-яёәіңғүұқөһ]/i.test(text)) return "ru"
  return "en"
}

async function xaiTts(text: string, language: string) {
  // Rex is intentionally fixed for now: it is the clean, confident Malik AI
  // male-style voice. Do not fall through to synthetic/noisy provider voices.
  const voiceId = "rex"
  const keys = unique([env("XAI_VOICE_API_KEY"), env("XAI_API_KEY")])
  if (!keys.length) return null

  for (const key of keys) {
    try {
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
            sample_rate: 44100,
            bit_rate: 192000,
          },
          speed: 1,
          text_normalization: true,
          optimize_streaming_latency: 0,
        }),
        cache: "no-store",
      })

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 500)
        console.warn(`[VOICE_XAI_TTS_ERROR] status=${response.status} voice=${voiceId} ${detail}`)
        continue
      }

      const bytes = await response.arrayBuffer()
      if (bytes.byteLength < 128) {
        console.warn(`[VOICE_XAI_TTS_ERROR] empty audio voice=${voiceId} bytes=${bytes.byteLength}`)
        continue
      }

      return new Response(bytes, {
        headers: {
          "content-type": response.headers.get("content-type") || "audio/mpeg",
          "cache-control": "no-store",
          "x-malik-tts-provider": "xai",
          "x-malik-tts-voice": voiceId,
        },
      })
    } catch (error) {
      console.warn("[VOICE_XAI_TTS_ERROR]", error instanceof Error ? error.message : error)
    }
  }

  return null
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const text = String(body?.text || "").trim().slice(0, 3500)
  const language = String(body?.language || detectLanguage(text))

  if (!text) {
    return Response.json({ ok: false, error: "Пустой текст" }, { status: 400 })
  }

  const xai = await xaiTts(text, language)
  if (xai) return xai

  // No Cloudflare MeloTTS or other synthetic audio fallback here. VoiceMode
  // will use the device's clean male speech voice only if xAI is unavailable.
  return Response.json(
    { ok: false, fallback: "browser-male", error: "xAI TTS unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } },
  )
}
