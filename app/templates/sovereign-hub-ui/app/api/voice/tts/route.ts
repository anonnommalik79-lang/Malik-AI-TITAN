import { Buffer } from "node:buffer"

import { withCompute } from "@/lib/malik-compute/runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type VoiceLanguage = "kk" | "ru" | "en"

const FLUX_SPEEDS = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15] as const
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
  if (/[әіңғүұқөһ]/i.test(text) || /\b(сәлем|салем|қалай|калай|жақсы|жаксы|қазақ|казак|қазақстан|казахстан|рахмет|рақмет|керек|болады|болмайды|иә|ия|жоқ|жок|менің|сенің|біздің|сіздің|қайда|кайда|қанша|канша|неге|осы|бұл|бул)\b/i.test(normalized)) return "kk"
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

function isAudio(response: Response, bytes: ArrayBuffer) {
  return bytes.byteLength > 128 && /^(audio\/|application\/octet-stream)/i.test(response.headers.get("content-type") || "")
}

function pcm16ToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1) {
  const bits = 16
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + pcm.byteLength, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * bits / 8, 28)
  header.writeUInt16LE(channels * bits / 8, 32)
  header.writeUInt16LE(bits, 34)
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
  const id = String(voice || "Cliff").trim().toLowerCase()
  const model = `flux-${DEEPGRAM_VOICES.has(id) ? id : "cliff"}-en`
  const query = new URLSearchParams({ model, encoding: "mp3", speed: String(speed), expressivity: String(expressivity) })

  for (const key of keys) {
    try {
      const response = await fetch(`https://api.deepgram.com/v2/speak?${query}`, {
        method: "POST",
        headers: { authorization: `Token ${key}`, "content-type": "application/json", accept: "audio/mpeg,application/octet-stream;q=0.9,*/*;q=0.8" },
        body: JSON.stringify({ text }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) continue
      const bytes = await response.arrayBuffer()
      if (!isAudio(response, bytes)) continue
      return new Response(bytes, { headers: {
        "content-type": response.headers.get("content-type") || "audio/mpeg", "cache-control": "no-store",
        "x-malik-tts-provider": "deepgram", "x-malik-tts-engine": "deepgram-flux-batch", "x-malik-tts-voice": model,
      } })
    } catch (error) {
      console.warn("[VOICE_DEEPGRAM_TTS_ERROR]", error instanceof Error ? error.message : error)
    }
  }
  return null
}

async function geminiTts(text: string, language: "ru" | "en", speed: number, expressivity: number) {
  const keys = unique([env("GEMINI_VOICE_API_KEY"), env("GEMINI_API_KEY"), env("GOOGLE_GENERATIVE_AI_API_KEY"), env("GOOGLE_AI_API_KEY")])
  if (!keys.length) return null

  // Russian uses one consistent high-quality voice. 2.5 Flash TTS is tried
  // first, then configured/3.1 models. This protects Voice from a single
  // preview-model outage or regression.
  const voiceName = language === "ru" ? "Puck" : "Charon"
  const models = language === "ru"
    ? unique([env("GEMINI_RUSSIAN_TTS_MODEL"), "gemini-2.5-flash-preview-tts", env("GEMINI_TTS_MODEL"), "gemini-3.1-flash-tts-preview"])
    : unique([env("GEMINI_TTS_MODEL"), "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"])
  const languageName = language === "ru" ? "Russian" : "English"
  const languageCode = language === "ru" ? "ru-RU" : "en-US"
  const pace = speed <= .9 ? "slightly slower than normal" : speed >= 1.1 ? "slightly faster than normal" : "natural conversational speed"
  const emotion = expressivity <= -1 ? "restrained and calm" : expressivity >= 1 ? "expressive and lively" : "natural and warm"
  const prompt = `Speak in ${languageName}. Use a ${emotion} delivery at ${pace}. Do not translate, summarize, explain, or add words. Read only TEXT.\nTEXT:\n${text}`

  for (const model of models) {
    for (const key of keys) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": key, "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { languageCode, voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(18000),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          console.warn(`[VOICE_GEMINI_TTS_ERROR] status=${response.status} model=${model} voice=${voiceName}`)
          continue
        }
        const encoded = geminiAudioData(payload)
        if (!encoded) continue
        const pcm = Buffer.from(encoded, "base64")
        if (pcm.byteLength < 128) continue
        return new Response(pcm16ToWav(pcm), { headers: {
          "content-type": "audio/wav", "cache-control": "no-store",
          "x-malik-tts-provider": "gemini", "x-malik-tts-engine": model, "x-malik-tts-voice": language === "ru" ? "Malik Russian Puck" : voiceName,
        } })
      } catch (error) {
        console.warn(`[VOICE_GEMINI_TTS_ERROR] model=${model}`, error instanceof Error ? error.message : error)
      }
    }
  }
  return null
}

async function elevenlabsTts(text: string, voice: string, language: "ru" | "kk", speed: number, expressivity: number) {
  const key = env("ELEVENLABS_VOICE_API_KEY") || env("ELEVENLABS_API_KEY")
  if (!key) return null
  const profile = voice.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")
  const voiceId = env(`ELEVENLABS_VOICE_ID_${profile}`) || env(`ELEVENLABS_VOICE_ID_${language.toUpperCase()}`) || env("ELEVENLABS_VOICE_ID") || "JBFqnCBsd6RMkjVDRZzb"
  const calm = voice.endsWith(" Calm")
  const strong = voice.endsWith(" Strong")
  const adjustedSpeed = Math.max(.85, Math.min(1.15, speed * (calm ? .93 : strong ? 1.05 : 1)))
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_v3", language_code: language, voice_settings: { stability: calm || expressivity < 0 ? 1 : .5, similarity_boost: .75, speed: adjustedSpeed } }),
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    })
    if (!response.ok) return null
    const bytes = await response.arrayBuffer()
    const audio = new Uint8Array(bytes)
    const mp3 = (audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)
    if (!isAudio(response, bytes) || !mp3) return null
    return new Response(bytes, { headers: {
      "content-type": "audio/mpeg", "cache-control": "no-store", "x-malik-tts-provider": "elevenlabs", "x-malik-tts-engine": "eleven_v3", "x-malik-tts-voice": voiceId,
    } })
  } catch {
    return null
  }
}

async function multilingualTts(text: string, language: VoiceLanguage, speed: number) {
  const keys = unique([env("XAI_VOICE_API_KEY"), env("XAI_API_KEY")])
  if (!keys.length) return null
  for (const key of keys) {
    try {
      const response = await fetch("https://api.x.ai/v1/tts", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "audio/mpeg,application/octet-stream;q=0.9,*/*;q=0.8" },
        body: JSON.stringify({ text, voice_id: "leo", language: language === "kk" ? "auto" : language, output_format: { codec: "mp3", sample_rate: 44100, bit_rate: 192000 }, speed, text_normalization: true, optimize_streaming_latency: 0 }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) continue
      const bytes = await response.arrayBuffer()
      if (!isAudio(response, bytes)) continue
      return new Response(bytes, { headers: {
        "content-type": response.headers.get("content-type") || "audio/mpeg", "cache-control": "no-store", "x-malik-tts-provider": "xai", "x-malik-tts-engine": "xai-multilingual", "x-malik-tts-voice": "leo",
      } })
    } catch {
      continue
    }
  }
  return null
}

async function kazakhTts(request: Request, text: string, voice: string, speed: number) {
  const backend = env("KOKORO_TTS_URL") || env("MALIK_BACKEND_URL")
  if (!backend) return null
  try {
    const target = new URL("/api/voice/tts", backend)
    if (!/^https?:$/.test(target.protocol) || target.origin === new URL(request.url).origin) return null
    const response = await fetch(target, {
      method: "POST", headers: { "content-type": "application/json", "x-malik-voice-proxy": "1" },
      body: JSON.stringify({ text, voice, language: "kk", speed }), cache: "no-store", signal: AbortSignal.timeout(45000),
    })
    const bytes = await response.arrayBuffer()
    if (!response.ok || !isAudio(response, bytes)) return null
    return new Response(bytes, { headers: { "content-type": response.headers.get("content-type") || "audio/wav", "cache-control": "no-store", "x-malik-tts-provider": "kokoro-kazakh", "x-malik-tts-voice": voice } })
  } catch {
    return null
  }
}

export const POST = withCompute(handlePOST, "voice")

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const text = String(body?.text || "").trim().slice(0, 3500)
  const voice = String(body?.voice || "Cliff")
  const requested = body?.language === "kk" || body?.language === "ru" || body?.language === "en" ? body.language as VoiceLanguage : null
  const language = requested || detectLanguage(text)
  const speed = fluxSpeed(body?.speed)
  const expressivity = fluxExpressivity(body?.expressivity)
  if (!text) return Response.json({ ok: false, error: "Пустой текст" }, { status: 400 })

  if (language === "ru") {
    // Fast dependable Russian path: Gemini 2.5/Puck -> configured Gemini ->
    // ElevenLabs (when configured) -> xAI. The client still has browser TTS.
    const gemini = await geminiTts(text, "ru", speed, expressivity)
    if (gemini) return gemini
    const eleven = await elevenlabsTts(text, voice, "ru", speed, expressivity)
    if (eleven) return eleven
    const xai = await multilingualTts(text, "ru", speed)
    if (xai) return xai
  } else if (language === "en") {
    const deepgram = await deepgramTts(text, voice, speed, expressivity)
    if (deepgram) return deepgram
    const gemini = await geminiTts(text, "en", speed, expressivity)
    if (gemini) return gemini
    const xai = await multilingualTts(text, "en", speed)
    if (xai) return xai
  } else {
    const eleven = await elevenlabsTts(text, voice, "kk", speed, expressivity)
    if (eleven) return eleven
    const kokoro = request.headers.get("x-malik-voice-proxy") ? null : await kazakhTts(request, text, voice, speed)
    if (kokoro) return kokoro
    const xai = await multilingualTts(text, "kk", speed)
    if (xai) return xai
  }

  return Response.json({
    ok: false,
    fallback: "browser-language-aware",
    language,
    code: "VOICE_TTS_UNAVAILABLE",
    error: language === "en" ? "Voice audio is unavailable. Please try again later." : "Сейчас не удалось озвучить ответ. Попробуйте ещё раз позже.",
  }, { status: 503, headers: { "cache-control": "no-store" } })
}
