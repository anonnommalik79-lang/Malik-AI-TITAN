import { getAwsCreds, signAwsRequest } from "./sigv4"

/**
 * AWS Polly — text-to-speech voiceover for TV / video scripts.
 * Note: Polly has no native Kazakh voice. Russian (Tatyana/Maxim) and
 * English neural voices are supported and cover most newsroom voiceover needs.
 */

export type PollyVoice = "Tatyana" | "Maxim" | "Joanna" | "Matthew"

export type PollyResult = {
  ok: boolean
  /** base64 mp3 audio */
  audioBase64?: string
  contentType?: string
  error?: string
}

export function isAwsPollyConfigured(): boolean {
  return getAwsCreds() !== null
}

const NEURAL_VOICES = new Set<PollyVoice>(["Joanna", "Matthew"])

export async function awsSynthesizeSpeech(
  text: string,
  voice: PollyVoice = "Tatyana",
  signal?: AbortSignal,
): Promise<PollyResult> {
  const creds = getAwsCreds()
  if (!creds) return { ok: false, error: "AWS credentials missing" }
  const clean = (text || "").trim()
  if (!clean) return { ok: false, error: "empty text" }

  const body = JSON.stringify({
    Text: clean.slice(0, 3000),
    OutputFormat: "mp3",
    VoiceId: voice,
    Engine: NEURAL_VOICES.has(voice) ? "neural" : "standard",
  })

  const signed = signAwsRequest(creds, {
    service: "polly",
    host: `polly.${creds.region}.amazonaws.com`,
    path: "/v1/speech",
    body,
    contentType: "application/json",
  })

  try {
    const response = await fetch(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
      signal,
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return { ok: false, error: data?.message || data?.Message || `AWS Polly ${response.status}` }
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      ok: true,
      audioBase64: buffer.toString("base64"),
      contentType: "audio/mpeg",
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "polly failed" }
  }
}
