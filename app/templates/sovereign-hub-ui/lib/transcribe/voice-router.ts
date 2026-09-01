import { Buffer } from "node:buffer"

import { repairTranscript, speechHintPrompt } from "@/lib/voice/speech-vocabulary"
import { transcriptConfidence } from "@/lib/voice/transcript-choice"

export type VoiceTranscribeResult = {
  ok: boolean
  text?: string
  language?: string
  durationSec?: number
  /** -1 to 1; 0 when the provider reports nothing. */
  confidence?: number
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

async function geminiAttempt(data: ArrayBuffer, filename: string, mime: string, model: string, prompt?: string) {
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
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          // The vocabulary hint goes in first so the brand names in it are
          // spelled rather than sounded out.
          ...(prompt ? [{ type: "text", text: `Transcribe the audio verbatim. Expected vocabulary: ${prompt.slice(0, 800)}` }] : []),
          { type: "audio", uri, mime_type: mime || "audio/webm" },
        ],
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
      void fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, { method: "DELETE", headers: { "x-goog-api-key": key }, cache: "no-store" }).catch(() => {})
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
      // verbose_json was already being requested and only `text` was read out of
      // it. How sure the model was is the difference between trusting this
      // transcript and preferring the browser's second opinion.
      confidence: transcriptConfidence(payload),
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
  const body: Record<string, unknown> = { audio: Buffer.from(data).toString("base64"), task: "transcribe", vad_filter: true }
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

  // Every recognizer here conditions on a prompt. Without one they spell Latin
  // brand names by sound ("ChatGPT" -> "чат гпт") and the assistant is then
  // asked about a word that does not exist.
  const prompt = opts.prompt?.trim() || speechHintPrompt(opts.language)

  const geminiModel = env("GEMINI_TRANSCRIBE_MODEL") || "gemini-3.5-transcribe"
  const groqPrimary = env("GROQ_WHISPER_PRIMARY") || "whisper-large-v3-turbo"
  const groqFallback = env("GROQ_WHISPER_FALLBACK") || "whisper-large-v3"
  const cfPrimary = env("CLOUDFLARE_WHISPER_PRIMARY") || "@cf/openai/whisper-large-v3-turbo"
  const cfFallback = env("CLOUDFLARE_WHISPER_FALLBACK") || "@cf/openai/whisper"
  const attempts: NonNullable<VoiceTranscribeResult["attempts"]> = []

  // Fast Voice path first. Groq Whisper accepts the recorded blob directly,
  // while Gemini requires upload + finalize + interaction. Gemini remains the
  // last safety net instead of blocking every normal Russian turn up front.
  for (const [provider, model] of [
    ["groq", groqPrimary],
    ["groq", groqFallback],
    ["cloudflare", cfPrimary],
    ["cloudflare", cfFallback],
    ["gemini", geminiModel],
  ] as const) {
    const result = provider === "gemini"
      ? await geminiAttempt(data, filename, mime, model, prompt)
      : provider === "groq"
        ? await groqAttempt(data, filename, mime, model, opts.language, prompt)
        : await cloudflareAttempt(data, model, opts.language, prompt)

    if (result.ok) {
      return {
        ok: true,
        // Second line of defence: whatever the hint did not prevent gets
        // normalised before the assistant ever sees it.
        text: repairTranscript(result.text) || result.text,
        language: typeof (result as any).language === "string" ? (result as any).language : undefined,
        durationSec: typeof (result as any).durationSec === "number" ? (result as any).durationSec : undefined,
        confidence: typeof (result as any).confidence === "number" ? (result as any).confidence : undefined,
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
