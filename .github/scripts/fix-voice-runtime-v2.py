from pathlib import Path

root = Path("app/templates/sovereign-hub-ui")

# -----------------------------------------------------------------------------
# 1) High-quality TTS routing.
# Exact Deepgram Flux voice stays for English. Russian uses Gemini 3.1 Flash TTS
# with a deterministic high-quality voice mapped from the selected Flux profile.
# Kazakh keeps the multilingual fallback until a native supported TTS route is
# available. Browser speech synthesis is only the last-resort client fallback.
# -----------------------------------------------------------------------------
tts_path = root / "app/api/voice/tts/route.ts"
tts_path.write_text(r'''import { Buffer } from "node:buffer"

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
  const language = detectLanguage(text)
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
''', encoding="utf-8")

# -----------------------------------------------------------------------------
# 2) STT: Gemini 3.5 Transcribe first (85+ languages incl. kk-KZ), then the
# existing Groq + Cloudflare Whisper fallback chain.
# -----------------------------------------------------------------------------
router_path = root / "lib/transcribe/voice-router.ts"
router_path.write_text(r'''import { Buffer } from "node:buffer"

export type VoiceTranscribeResult = {
  ok: boolean
  text?: string
  language?: string
  durationSec?: number
  provider?: "gemini" | "groq" | "cloudflare"
  model?: string
  latencyMs?: number
  error?: string
  attempts?: Array<{ provider: string; model: string; status?: number; error?: string; latencyMs: number }>
}

const timeoutMs = () => Math.max(3000, Number(process.env.VOICE_PROVIDER_TIMEOUT_MS || 15000))

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ""
}

export function isVoiceTranscribeConfigured() {
  const gemini = env("GEMINI_VOICE_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY")
  const groq = env("GROQ_VOICE_API_KEY", "GROQ_API_KEY")
  const cfToken = env("CLOUDFLARE_VOICE_API_TOKEN", "CLOUDFLARE_API_TOKEN")
  const cfAccount = env("CLOUDFLARE_VOICE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")
  return Boolean(gemini || groq || (cfToken && cfAccount))
}

async function withTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs())
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
  } finally {
    clearTimeout(timer)
  }
}

function interactionText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim()
  const steps = Array.isArray(payload?.steps) ? payload.steps : []
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index]
    if (step?.type !== "model_output" || !Array.isArray(step?.content)) continue
    const text = step.content
      .map((part: any) => part?.type === "text" && typeof part?.text === "string" ? part.text : "")
      .join("")
      .trim()
    if (text) return text
  }
  return ""
}

async function geminiAttempt(data: ArrayBuffer, filename: string, mime: string, model: string) {
  const key = env("GEMINI_VOICE_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY")
  if (!key) return { ok: false as const, skipped: true as const, error: "missing key" }
  const started = Date.now()
  let fileName = ""

  try {
    const startUpload = await withTimeout("https://generativelanguage.googleapis.com/upload/v1beta/files", {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "x-goog-upload-protocol": "resumable",
        "x-goog-upload-command": "start",
        "x-goog-upload-header-content-length": String(data.byteLength),
        "x-goog-upload-header-content-type": mime || "audio/webm",
        "content-type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: filename || "malik-voice" } }),
    })

    if (!startUpload.ok) {
      const detail = await startUpload.text().catch(() => "")
      return { ok: false as const, status: startUpload.status, error: `Gemini upload start: ${detail.slice(0, 220)}`, latencyMs: Date.now() - started }
    }

    const uploadUrl = startUpload.headers.get("x-goog-upload-url")
    if (!uploadUrl) return { ok: false as const, status: 502, error: "Gemini upload URL missing", latencyMs: Date.now() - started }

    const upload = await withTimeout(uploadUrl, {
      method: "POST",
      headers: {
        "content-length": String(data.byteLength),
        "x-goog-upload-offset": "0",
        "x-goog-upload-command": "upload, finalize",
        "content-type": mime || "audio/webm",
      },
      body: Buffer.from(data),
    })
    const filePayload = await upload.json().catch(() => ({}))
    if (!upload.ok) return { ok: false as const, status: upload.status, error: String(filePayload?.error?.message || `Gemini upload ${upload.status}`), latencyMs: Date.now() - started }

    const uri = String(filePayload?.file?.uri || "")
    fileName = String(filePayload?.file?.name || "")
    if (!uri) return { ok: false as const, status: 502, error: "Gemini uploaded file URI missing", latencyMs: Date.now() - started }

    const response = await withTimeout("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [{ type: "audio", uri, mime_type: mime || "audio/webm" }],
      }),
    })
    const payload = await response.json().catch(() => ({}))
    const latencyMs = Date.now() - started
    if (!response.ok) return { ok: false as const, status: response.status, error: String(payload?.error?.message || `Gemini ${response.status}`), latencyMs }
    const text = interactionText(payload)
    if (!text) return { ok: false as const, status: response.status, error: "empty transcript", latencyMs }
    return { ok: true as const, text, latencyMs }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Gemini network error", latencyMs: Date.now() - started }
  } finally {
    if (fileName) {
      void fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
        method: "DELETE",
        headers: { "x-goog-api-key": key },
        cache: "no-store",
      }).catch(() => {})
    }
  }
}

async function groqAttempt(data: ArrayBuffer, filename: string, mime: string, model: string, language?: string, prompt?: string) {
  const key = env("GROQ_VOICE_API_KEY", "GROQ_API_KEY")
  if (!key) return { ok: false as const, skipped: true as const, error: "missing key" }
  const form = new FormData()
  form.append("file", new Blob([data], { type: mime || "application/octet-stream" }), filename || "voice-audio")
  form.append("model", model)
  form.append("response_format", "verbose_json")
  if (language && language !== "auto") form.append("language", language)
  if (prompt) form.append("prompt", prompt.slice(0, 800))

  const started = Date.now()
  try {
    const response = await withTimeout("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
    })
    const payload = await response.json().catch(() => ({}))
    const latencyMs = Date.now() - started
    if (!response.ok) return { ok: false as const, status: response.status, error: String(payload?.error?.message || `Groq ${response.status}`), latencyMs }
    const text = String(payload?.text || "").trim()
    if (!text) return { ok: false as const, status: response.status, error: "empty transcript", latencyMs }
    return {
      ok: true as const,
      text,
      language: payload?.language ? String(payload.language) : undefined,
      durationSec: typeof payload?.duration === "number" ? payload.duration : undefined,
      latencyMs,
    }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Groq network error", latencyMs: Date.now() - started }
  }
}

async function cloudflareAttempt(data: ArrayBuffer, model: string, language?: string, prompt?: string) {
  const token = env("CLOUDFLARE_VOICE_API_TOKEN", "CLOUDFLARE_API_TOKEN")
  const account = env("CLOUDFLARE_VOICE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")
  if (!token || !account) return { ok: false as const, skipped: true as const, error: "missing credentials" }

  const started = Date.now()
  const body: Record<string, unknown> = {
    audio: Buffer.from(data).toString("base64"),
    task: "transcribe",
    vad_filter: true,
  }
  if (language && language !== "auto") body.language = language
  if (prompt) body.initial_prompt = prompt.slice(0, 800)

  try {
    const response = await withTimeout(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    const latencyMs = Date.now() - started
    if (!response.ok || payload?.success === false) {
      const message = payload?.errors?.[0]?.message || payload?.error || `Cloudflare ${response.status}`
      return { ok: false as const, status: response.status, error: String(message), latencyMs }
    }
    const result = payload?.result ?? payload
    const text = String(result?.text || result?.transcription || result?.response || "").trim()
    if (!text) return { ok: false as const, status: response.status, error: "empty transcript", latencyMs }
    const duration = Number(result?.transcription_info?.duration || result?.duration || 0)
    return {
      ok: true as const,
      text,
      language: result?.language ? String(result.language) : undefined,
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : undefined,
      latencyMs,
    }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Cloudflare network error", latencyMs: Date.now() - started }
  }
}

export async function transcribeVoiceAudio(
  data: ArrayBuffer,
  filename: string,
  mime: string,
  opts: { language?: string; prompt?: string } = {},
): Promise<VoiceTranscribeResult> {
  if (!data?.byteLength) return { ok: false, error: "пустой файл" }

  const geminiModel = env("GEMINI_TRANSCRIBE_MODEL") || "gemini-3.5-transcribe"
  const groqPrimary = env("GROQ_WHISPER_PRIMARY") || "whisper-large-v3-turbo"
  const groqFallback = env("GROQ_WHISPER_FALLBACK") || "whisper-large-v3"
  const cfPrimary = env("CLOUDFLARE_WHISPER_PRIMARY") || "@cf/openai/whisper-large-v3-turbo"
  const cfFallback = env("CLOUDFLARE_WHISPER_FALLBACK") || "@cf/openai/whisper"
  const attempts: NonNullable<VoiceTranscribeResult["attempts"]> = []

  for (const [provider, model] of [
    ["gemini", geminiModel],
    ["groq", groqPrimary],
    ["groq", groqFallback],
    ["cloudflare", cfPrimary],
    ["cloudflare", cfFallback],
  ] as const) {
    const result = provider === "gemini"
      ? await geminiAttempt(data, filename, mime, model)
      : provider === "groq"
        ? await groqAttempt(data, filename, mime, model, opts.language, opts.prompt)
        : await cloudflareAttempt(data, model, opts.language, opts.prompt)

    if (result.ok) {
      return {
        ok: true,
        text: result.text,
        language: "language" in result ? result.language : undefined,
        durationSec: "durationSec" in result ? result.durationSec : undefined,
        provider,
        model,
        latencyMs: result.latencyMs,
        attempts,
      }
    }
    if (!("skipped" in result && result.skipped)) {
      attempts.push({
        provider,
        model,
        status: "status" in result ? result.status : undefined,
        error: result.error,
        latencyMs: "latencyMs" in result ? result.latencyMs || 0 : 0,
      })
    }
  }

  return { ok: false, error: "Не удалось распознать голос. Попробуйте ещё раз.", attempts }
}
''', encoding="utf-8")

# -----------------------------------------------------------------------------
# 3) VoiceMode: accept Gemini audio and auto-submit after the user stops speaking.
# -----------------------------------------------------------------------------
mode_path = root / "components/voice/VoiceMode.tsx"
mode = mode_path.read_text(encoding="utf-8")

old_ref = '''  const replyInterruptedRef = useRef(false)\n  const fluxSessionRef = useRef<FluxTtsSession | null>(null)\n'''
new_ref = '''  const replyInterruptedRef = useRef(false)\n  const fluxSessionRef = useRef<FluxTtsSession | null>(null)\n  const autoSubmitRef = useRef<(() => void) | null>(null)\n  const speechDetectedRef = useRef(false)\n  const lastSpeechAtRef = useRef(0)\n'''
if old_ref not in mode:
    raise SystemExit("VoiceMode refs anchor not found")
mode = mode.replace(old_ref, new_ref, 1)

old_provider = 'if (response.ok && (provider === "deepgram" || provider === "xai")) {'
new_provider = 'if (response.ok && (provider === "deepgram" || provider === "gemini" || provider === "xai")) {'
if old_provider not in mode:
    raise SystemExit("VoiceMode provider acceptance anchor not found")
mode = mode.replace(old_provider, new_provider, 1)

old_loop = '''  const startAudioLoop = useCallback((analyser: AnalyserNode) => {\n    const values = new Uint8Array(analyser.frequencyBinCount)\n    function tick() {\n      if (!micActiveRef.current || analyserRef.current !== analyser) return\n      analyser.getByteFrequencyData(values)\n      let sum = 0\n      let peak = 0\n      for (let index = 0; index < values.length; index += 1) {\n        const value = values[index]\n        sum += value\n        if (value > peak) peak = value\n      }\n      const average = sum / values.length / 255\n      energyRef.current = Math.min(1, average * 4.9 + peak / 255 * .36)\n      audioFrameRef.current = requestAnimationFrame(tick)\n    }\n    audioFrameRef.current = requestAnimationFrame(tick)\n  }, [])\n'''
new_loop = '''  const startAudioLoop = useCallback((analyser: AnalyserNode) => {\n    const values = new Uint8Array(analyser.frequencyBinCount)\n    const waveform = new Uint8Array(analyser.fftSize)\n    function tick() {\n      if (!micActiveRef.current || analyserRef.current !== analyser) return\n      analyser.getByteFrequencyData(values)\n      analyser.getByteTimeDomainData(waveform)\n      let sum = 0\n      let peak = 0\n      for (let index = 0; index < values.length; index += 1) {\n        const value = values[index]\n        sum += value\n        if (value > peak) peak = value\n      }\n      let squareSum = 0\n      for (let index = 0; index < waveform.length; index += 1) {\n        const sample = (waveform[index] - 128) / 128\n        squareSum += sample * sample\n      }\n      const rms = Math.sqrt(squareSum / waveform.length)\n      const average = sum / values.length / 255\n      energyRef.current = Math.min(1, average * 4.9 + peak / 255 * .36)\n\n      const now = performance.now()\n      if (rms >= .016) {\n        speechDetectedRef.current = true\n        lastSpeechAtRef.current = now\n      } else if (speechDetectedRef.current && now - lastSpeechAtRef.current >= 1050 && Date.now() - recordingStartedAtRef.current >= 700) {\n        speechDetectedRef.current = false\n        autoSubmitRef.current?.()\n        return\n      }\n\n      audioFrameRef.current = requestAnimationFrame(tick)\n    }\n    audioFrameRef.current = requestAnimationFrame(tick)\n  }, [])\n'''
if old_loop not in mode:
    raise SystemExit("VoiceMode audio loop anchor not found")
mode = mode.replace(old_loop, new_loop, 1)

old_start = '''      setTitle("Слушаю")\n      setSubtitle("Қазақша · Русский · English")\n      startAudioLoop(analyser)\n      startSpeech()\n      startRecorder(stream)\n'''
new_start = '''      setTitle("Слушаю")\n      setSubtitle("Говори — после паузы я отвечу сам · Қазақша · Русский · English")\n      speechDetectedRef.current = false\n      lastSpeechAtRef.current = 0\n      startRecorder(stream)\n      startAudioLoop(analyser)\n      startSpeech()\n'''
if old_start not in mode:
    raise SystemExit("VoiceMode microphone start anchor not found")
mode = mode.replace(old_start, new_start, 1)

anchor = '''  const toggleScreen = useCallback(async () => {\n'''
effect = '''  useEffect(() => {\n    autoSubmitRef.current = () => { void toggleMicrophone() }\n    return () => { autoSubmitRef.current = null }\n  }, [toggleMicrophone])\n\n'''
if anchor not in mode:
    raise SystemExit("VoiceMode toggleScreen anchor not found")
mode = mode.replace(anchor, effect + anchor, 1)
mode_path.write_text(mode, encoding="utf-8")

# -----------------------------------------------------------------------------
# 4) Environment documentation.
# -----------------------------------------------------------------------------
env_path = root / ".env.example"
env_text = env_path.read_text(encoding="utf-8")
needle = "GEMINI_MULTIMODAL_TIMEOUT_MS=60000\n"
addition = "GEMINI_MULTIMODAL_TIMEOUT_MS=60000\nGEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview\nGEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe\n"
if needle in env_text and "GEMINI_TTS_MODEL=" not in env_text:
    env_text = env_text.replace(needle, addition, 1)
env_path.write_text(env_text, encoding="utf-8")

# -----------------------------------------------------------------------------
# 5) Update Voice regression test to reflect real runtime behavior.
# -----------------------------------------------------------------------------
test_path = root / "scripts/verify-voice-mode.mjs"
test = test_path.read_text(encoding="utf-8")

old_promise = '''const [home, chat, dashboard, sidebar, mode, dock, orb, settings, sound, tts, turn, flux, token, css, homeCss, chatCss] = await Promise.all([\n'''
new_promise = '''const [home, chat, dashboard, sidebar, mode, dock, orb, settings, sound, tts, turn, flux, token, transcribe, css, homeCss, chatCss] = await Promise.all([\n'''
if old_promise not in test:
    raise SystemExit("Voice test promise anchor not found")
test = test.replace(old_promise, new_promise, 1)

old_token_read = '''  read("app/api/voice/deepgram-token/route.ts"),\n  read("components/voice/VoiceMode.module.css"),\n'''
new_token_read = '''  read("app/api/voice/deepgram-token/route.ts"),\n  read("lib/transcribe/voice-router.ts"),\n  read("components/voice/VoiceMode.module.css"),\n'''
if old_token_read not in test:
    raise SystemExit("Voice test transcribe read anchor not found")
test = test.replace(old_token_read, new_token_read, 1)

old_07 = '''  ["07 microphone uses real audio analyser and noise controls", () => { assert.match(mode, /getUserMedia/); assert.match(mode, /echoCancellation:\\s*true/); assert.match(mode, /noiseSuppression:\\s*true/); assert.match(mode, /createAnalyser/); assert.match(mode, /getByteFrequencyData/) }],\n'''
new_07 = '''  ["07 microphone uses analyser, VAD and automatic silence submit", () => { assert.match(mode, /getUserMedia/); assert.match(mode, /echoCancellation:\\s*true/); assert.match(mode, /noiseSuppression:\\s*true/); assert.match(mode, /createAnalyser/); assert.match(mode, /getByteTimeDomainData/); assert.match(mode, /rms >= \\.016/); assert.match(mode, /autoSubmitRef\\.current/); assert.match(mode, /1050/) }],\n'''
if old_07 not in test:
    raise SystemExit("Voice test 07 anchor not found")
test = test.replace(old_07, new_07, 1)

old_09 = '''  ["09 server STT remains language auto", () => assert.match(mode, /form\\.append\\(\"language\", \"auto\"\\)/)],\n'''
new_09 = '''  ["09 server STT is auto-language with Gemini 3.5 primary and Whisper fallbacks", () => { assert.match(mode, /form\\.append\\(\"language\", \"auto\"\\)/); assert.match(transcribe, /gemini-3\\.5-transcribe/); assert.match(transcribe, /\[\"gemini\", geminiModel\]/); assert.match(transcribe, /whisper-large-v3-turbo/); assert.match(transcribe, /@cf\\/openai\\/whisper/) }],\n'''
if old_09 not in test:
    raise SystemExit("Voice test 09 anchor not found")
test = test.replace(old_09, new_09, 1)

old_17 = '''  ["17 English uses Flux and RU\\/KK stay multilingual", () => { assert.match(mode, /language === \"en\"/); assert.match(tts, /deepgram-flux-batch/); assert.match(tts, /voiceId = \"leo\"/); assert.match(tts, /language === \"ru\" \\? \"ru\"/); assert.match(tts, /language === \"en\" \\? \"en\" : \"auto\"/) }],\n'''
new_17 = '''  ["17 selected voice is honored: Flux EN, Gemini RU, multilingual KK fallback", () => { assert.match(mode, /language === \"en\"/); assert.match(tts, /deepgram-flux-batch/); assert.match(tts, /gemini-3\\.1-flash-tts-preview/); assert.match(tts, /GEMINI_VOICE_BY_PROFILE/); assert.match(tts, /language === \"ru\"/); assert.match(tts, /voiceId = \"leo\"/) }],\n'''
if old_17 not in test:
    raise SystemExit("Voice test 17 anchor not found")
test = test.replace(old_17, new_17, 1)

test_path.write_text(test, encoding="utf-8")

print("Voice runtime v2 patch applied: selected RU voices, Gemini STT, auto VAD submit.")
