import { Buffer } from "node:buffer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type VoiceLanguage = "kk" | "ru" | "en"

const DEEPGRAM_VOICES = new Set([
  "hannah", "kit", "alexis", "cliff", "sienna", "cole", "brooke", "colin", "gemma", "haley", "heather", "miles", "sean",
  "bree", "brittany", "bruce", "conor", "donovan", "drew", "elise", "jack", "kai", "kelsey", "maeve", "marcelo", "marcus",
  "meena", "meghan", "naveen", "paige", "priya", "rufus", "sharon", "tanner", "wade", "wes",
])
const FLUX_SPEEDS = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15] as const

const GEMINI_VOICE_BY_PROFILE: Record<string, string> = {
  cliff: "Charon",
  kit: "Puck",
  cole: "Iapetus",
  colin: "Rasalgethi",
  miles: "Schedar",
  sean: "Gacrux",
  bruce: "Orus",
  conor: "Algenib",
  donovan: "Sadaltager",
  drew: "Achird",
  jack: "Alnilam",
  kai: "Zubenelgenubi",
  marcelo: "Laomedeia",
  marcus: "Algieba",
  naveen: "Enceladus",
  rufus: "Fenrir",
  tanner: "Iapetus",
  wade: "Orus",
  wes: "Charon",
  hannah: "Kore",
  alexis: "Autonoe",
  sienna: "Vindemiatrix",
  brooke: "Sadachbia",
  gemma: "Aoede",
  haley: "Achernar",
  heather: "Zephyr",
  bree: "Leda",
  brittany: "Callirrhoe",
  elise: "Erinome",
  kelsey: "Despina",
  maeve: "Pulcherrima",
  meena: "Sulafat",
  meghan: "Laomedeia",
  paige: "Umbriel",
  priya: "Autonoe",
  sharon: "Vindemiatrix",
  charon: "Charon",
  puck: "Puck",
  kore: "Kore",
  aoede: "Aoede",
  fenrir: "Fenrir",
}

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

function fluxSpeed(value: unknown) {
  const raw = Number(value)
  const target = Number.isFinite(raw) ? raw : 1
  return FLUX_SPEEDS.reduce((best, item) => Math.abs(item - target) < Math.abs(best - target) ? item : best, 1)
}

function fluxExpressivity(value: unknown) {
  const raw = Number(value)
  return Math.max(-2, Math.min(2, Math.round(Number.isFinite(raw) ? raw : 0)))
}

function deepgramModelFor(voice: string) {
  const normalized = String(voice || "Cliff").trim().toLowerCase()
  const id = DEEPGRAM_VOICES.has(normalized) ? normalized : "cliff"
  return `flux-${id}-en`
}

function geminiVoiceFor(voice: string) {
  return GEMINI_VOICE_BY_PROFILE[String(voice || "Cliff").trim().toLowerCase()] || "Charon"
}

function pcm16ToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1) {
  const bitsPerSample = 16
  const byteRate = sampleRate * channels * bitsPerSample / 8
  const blockAlign = channels * bitsPerSample / 8
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + pcm.byteLength, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write("data", 36)
  header.writeUInt32LE(pcm.byteLength, 40)
  return Buffer.concat([header, Buffer.from(pcm)])
}

function geminiAudioData(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ""
  for (const part of parts) {
    const data = part?.inlineData?.data || part?.inline_data?.data
    if (typeof data === "string" && data) return data
  }
  return ""
}

async function deepgramTts(text: string, voice: string, speed: number, expressivity: number) {
  const keys = unique([env("DEEPGRAM_VOICE_API_KEY"), env("DEEPGRAM_API_KEY")])
  if (!keys.length) return null

  const model = deepgramModelFor(voice)
  const query = new URLSearchParams({
    model,
    encoding: "mp3",
    speed: String(speed),
    expressivity: String(expressivity),
  })
  const url = `https://api.deepgram.com/v2/speak?${query.toString()}`

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
          "x-malik-tts-provider": "deepgram",
          "x-malik-tts-engine": "deepgram-flux-batch",
          "x-malik-tts-voice": model,
        },
      })
    } catch (error) {
      console.warn("[VOICE_DEEPGRAM_TTS_ERROR]", error instanceof Error ? error.message : error)
    }
  }

  return null
}

async function geminiTts(text: string, voice: string, language: "ru" | "en", speed: number, expressivity: number) {
  const keys = unique([
    env("GEMINI_VOICE_API_KEY"),
    env("GEMINI_API_KEY"),
    env("GOOGLE_GENERATIVE_AI_API_KEY"),
    env("GOOGLE_AI_API_KEY"),
  ])
  if (!keys.length) return null

  const model = env("GEMINI_TTS_MODEL") || "gemini-3.1-flash-tts-preview"
  const mappedVoice = geminiVoiceFor(voice)
  const languageName = language === "ru" ? "Russian" : "English"
  const languageCode = language === "ru" ? "ru-RU" : "en-US"
  const pace = speed <= 0.9 ? "slightly slower than normal" : speed >= 1.1 ? "slightly faster than normal" : "natural conversational speed"
  const emotion = expressivity <= -1 ? "restrained and calm" : expressivity >= 1 ? "expressive and lively" : "natural and warm"
  const prompt = `Speak in ${languageName}. Use a ${emotion} delivery at ${pace}. Do not translate, summarize, explain, or add any words. Read only the text after TEXT.\nTEXT:\n${text}`

  for (const key of keys) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              languageCode,
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: mappedVoice },
              },
            },
          },
        }),
        cache: "no-store",
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        console.warn(`[VOICE_GEMINI_TTS_ERROR] status=${response.status} voice=${mappedVoice} ${String(payload?.error?.message || "").slice(0, 300)}`)
        continue
      }

      const encoded = geminiAudioData(payload)
      if (!encoded) continue
      const pcm = Buffer.from(encoded, "base64")
      if (pcm.byteLength < 128) continue
      const wav = pcm16ToWav(pcm)

      return new Response(wav, {
        headers: {
          "content-type": "audio/wav",
          "cache-control": "no-store",
          "x-malik-tts-provider": "gemini",
          "x-malik-tts-engine": model,
          "x-malik-tts-voice": `${voice}:${mappedVoice}`,
        },
      })
    } catch (error) {
      console.warn("[VOICE_GEMINI_TTS_ERROR]", error instanceof Error ? error.message : error)
    }
  }
  return null
}

async function multilingualTts(text: string, language: VoiceLanguage, speed: number) {
  const keys = unique([env("XAI_VOICE_API_KEY"), env("XAI_API_KEY")])
  if (!keys.length) return null

  const voiceId = "leo"
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
          speed,
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
  const requestedLanguage = body?.language === "kk" || body?.language === "ru" || body?.language === "en" ? body.language as VoiceLanguage : null
  const language = requestedLanguage || detectLanguage(text)
  const speed = fluxSpeed(body?.speed)
  const expressivity = fluxExpressivity(body?.expressivity)

  if (!text) return Response.json({ ok: false, error: "Пустой текст" }, { status: 400 })

  if (language === "en") {
    const deepgram = await deepgramTts(text, voice, speed, expressivity)
    if (deepgram) return deepgram
    const geminiEnglish = await geminiTts(text, voice, "en", speed, expressivity)
    if (geminiEnglish) return geminiEnglish
  }

  if (language === "ru") {
    const geminiRussian = await geminiTts(text, voice, "ru", speed, expressivity)
    if (geminiRussian) return geminiRussian
  }

  if (language === "kk") {
    return Response.json({ ok: false, language, error: "Kazakh Kokoro TTS is served by the Flask production runtime" }, { status: 503, headers: { "cache-control": "no-store" } })
  }

  const multilingual = await multilingualTts(text, language, speed)
  if (multilingual) return multilingual

  return Response.json(
    {
      ok: false,
      fallback: "browser-language-aware",
      language,
      error: language === "en" ? "Voice TTS unavailable" : "Multilingual TTS unavailable",
    },
    { status: 503, headers: { "cache-control": "no-store" } },
  )
}
