export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type VoiceLanguage = "kk" | "ru" | "en"

const DEEPGRAM_VOICES = new Set([
  "hannah", "kit", "alexis", "cliff", "sienna", "cole", "brooke", "colin", "gemma", "haley", "heather", "miles", "sean",
  "bree", "brittany", "bruce", "conor", "donovan", "drew", "elise", "jack", "kai", "kelsey", "maeve", "marcelo", "marcus",
  "meena", "meghan", "naveen", "paige", "priya", "rufus", "sharon", "tanner", "wade", "wes",
])

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function detectLanguage(text: string): VoiceLanguage {
  const normalized = text.toLowerCase()
  if (
    /[әіңғүұқөһ]/i.test(text) ||
    /\b(сәлем|салем|қалай|калай|жақсы|жаксы|қазақ|казак|қазақстан|казахстан|рахмет|рақмет|керек|болады|болмайды|иә|ия|жоқ|жок|менің|сенің|біздің|сіздің|қайда|кайда|қанша|канша|неге|осы|бұл|бул)\b/i.test(normalized)
  ) return "kk"
  if (/[а-яё]/i.test(text)) return "ru"
  return "en"
}

function deepgramModelFor(voice: string) {
  const normalized = String(voice || "Cliff").trim().toLowerCase()
  const id = DEEPGRAM_VOICES.has(normalized) ? normalized : "cliff"
  return `flux-${id}-en`
}

async function deepgramTts(text: string, voice: string) {
  const keys = unique([env("DEEPGRAM_VOICE_API_KEY"), env("DEEPGRAM_API_KEY")])
  if (!keys.length) return null

  const model = deepgramModelFor(voice)
  const url = `https://api.deepgram.com/v2/speak?model=${encodeURIComponent(model)}&encoding=mp3&speed=1.0&expressivity=0`

  for (const key of keys) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Token ${key}`,
          "content-type": "application/json",
          accept: "audio/mpeg,application/octet-stream;q=0.9,*/*;q=0.8",
        },
        body: JSON.stringify({ text }),
        cache: "no-store",
      })

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 400)
        console.warn(`[VOICE_DEEPGRAM_TTS_ERROR] status=${response.status} model=${model} ${detail}`)
        continue
      }

      const bytes = await response.arrayBuffer()
      if (bytes.byteLength < 128) continue

      return new Response(bytes, {
        headers: {
          "content-type": response.headers.get("content-type") || "audio/mpeg",
          "cache-control": "no-store",
          // VoiceMode currently accepts the legacy provider header values.
          // Keep compatibility while exposing the real engine separately.
          "x-malik-tts-provider": "xai",
          "x-malik-tts-engine": "deepgram",
          "x-malik-tts-voice": model,
        },
      })
    } catch (error) {
      console.warn("[VOICE_DEEPGRAM_TTS_ERROR]", error instanceof Error ? error.message : error)
    }
  }

  return null
}

async function multilingualTts(text: string, language: VoiceLanguage) {
  const keys = unique([env("XAI_VOICE_API_KEY"), env("XAI_API_KEY")])
  if (!keys.length) return null

  // Deepgram Flux voices are English-only today. For Russian and Kazakh keep
  // one neutral, clear fallback instead of forcing an English Flux voice to
  // pronounce Cyrillic. Russian is explicitly supported; Kazakh uses auto.
  const voiceId = "perseus"
  const ttsLanguage = language === "ru" ? "ru" : language === "en" ? "en" : "auto"

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
          language: ttsLanguage,
          output_format: { codec: "mp3", sample_rate: 44100, bit_rate: 192000 },
          speed: 1,
          text_normalization: true,
          optimize_streaming_latency: 0,
        }),
        cache: "no-store",
      })

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 400)
        console.warn(`[VOICE_MULTILINGUAL_TTS_ERROR] status=${response.status} lang=${ttsLanguage} ${detail}`)
        continue
      }

      const bytes = await response.arrayBuffer()
      if (bytes.byteLength < 128) continue

      return new Response(bytes, {
        headers: {
          "content-type": response.headers.get("content-type") || "audio/mpeg",
          "cache-control": "no-store",
          "x-malik-tts-provider": "xai",
          "x-malik-tts-engine": "xai-multilingual",
          "x-malik-tts-voice": voiceId,
        },
      })
    } catch (error) {
      console.warn("[VOICE_MULTILINGUAL_TTS_ERROR]", error instanceof Error ? error.message : error)
    }
  }

  return null
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const text = String(body?.text || "").trim().slice(0, 3500)
  const voice = String(body?.voice || "Cliff")
  const language = detectLanguage(text)

  if (!text) return Response.json({ ok: false, error: "Пустой текст" }, { status: 400 })

  if (language === "en") {
    const deepgram = await deepgramTts(text, voice)
    if (deepgram) return deepgram
  }

  const multilingual = await multilingualTts(text, language)
  if (multilingual) return multilingual

  return Response.json(
    {
      ok: false,
      fallback: "browser-language-aware",
      language,
      error: language === "en" ? "Deepgram TTS unavailable" : "Multilingual TTS unavailable",
    },
    { status: 503, headers: { "cache-control": "no-store" } },
  )
}
