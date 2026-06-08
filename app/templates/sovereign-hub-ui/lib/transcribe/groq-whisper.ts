/**
 * Speech-to-text transcription via Groq Whisper (whisper-large-v3).
 * Isolated, additive feature — does not touch existing chat/business flows.
 * Free on Groq's tier; one synchronous request, no S3 required.
 */

export type TranscribeResult = {
  ok: boolean
  text?: string
  language?: string
  durationSec?: number
  error?: string
}

export function isTranscribeConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim())
}

export async function transcribeAudio(
  data: ArrayBuffer,
  filename: string,
  mime: string,
  opts: { language?: string; prompt?: string; signal?: AbortSignal } = {},
): Promise<TranscribeResult> {
  const key = process.env.GROQ_API_KEY?.trim()
  if (!key) return { ok: false, error: "GROQ_API_KEY не настроен" }
  if (!data || data.byteLength === 0) return { ok: false, error: "пустой файл" }

  const model = process.env.GROQ_WHISPER_MODEL?.trim() || "whisper-large-v3"
  const form = new FormData()
  form.append("file", new Blob([data], { type: mime || "application/octet-stream" }), filename || "audio")
  form.append("model", model)
  form.append("response_format", "verbose_json")
  if (opts.language && opts.language !== "auto") form.append("language", opts.language)
  if (opts.prompt) form.append("prompt", opts.prompt.slice(0, 800))

  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
      signal: opts.signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { ok: false, error: payload?.error?.message || `Groq Whisper ${response.status}` }
    }
    const text = String(payload?.text || "").trim()
    if (!text) return { ok: false, error: "пустой результат расшифровки" }
    return {
      ok: true,
      text,
      language: payload?.language ? String(payload.language) : undefined,
      durationSec: typeof payload?.duration === "number" ? payload.duration : undefined,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ошибка транскрипции" }
  }
}
