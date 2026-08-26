import { Buffer } from "node:buffer"

export type VoiceTranscribeResult = {
  ok: boolean
  text?: string
  language?: string
  durationSec?: number
  provider?: "groq" | "cloudflare"
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
  const groq = env("GROQ_VOICE_API_KEY", "GROQ_API_KEY")
  const cfToken = env("CLOUDFLARE_VOICE_API_TOKEN", "CLOUDFLARE_API_TOKEN")
  const cfAccount = env("CLOUDFLARE_VOICE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")
  return Boolean(groq || (cfToken && cfAccount))
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

  const groqPrimary = env("GROQ_WHISPER_PRIMARY") || "whisper-large-v3-turbo"
  const groqFallback = env("GROQ_WHISPER_FALLBACK") || "whisper-large-v3"
  const cfPrimary = env("CLOUDFLARE_WHISPER_PRIMARY") || "@cf/openai/whisper-large-v3-turbo"
  const cfFallback = env("CLOUDFLARE_WHISPER_FALLBACK") || "@cf/openai/whisper"
  const attempts: NonNullable<VoiceTranscribeResult["attempts"]> = []

  for (const [provider, model] of [
    ["groq", groqPrimary],
    ["groq", groqFallback],
    ["cloudflare", cfPrimary],
    ["cloudflare", cfFallback],
  ] as const) {
    const result = provider === "groq"
      ? await groqAttempt(data, filename, mime, model, opts.language, opts.prompt)
      : await cloudflareAttempt(data, model, opts.language, opts.prompt)

    if (result.ok) {
      return { ok: true, text: result.text, language: result.language, durationSec: result.durationSec, provider, model, latencyMs: result.latencyMs, attempts }
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
