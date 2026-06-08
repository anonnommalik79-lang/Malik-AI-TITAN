import { awsSynthesizeSpeech, isAwsPollyConfigured, type PollyVoice } from "@/lib/aws/polly"

export const runtime = "nodejs"

const VOICES = new Set(["Tatyana", "Maxim", "Joanna", "Matthew"])

type TtsBody = {
  text?: string
  voice?: string
}

export async function GET() {
  return Response.json({ ok: true, configured: isAwsPollyConfigured() })
}

export async function POST(request: Request) {
  if (!isAwsPollyConfigured()) {
    return Response.json({ ok: false, error: "AWS не настроен (нет ключей)" }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as TtsBody
  const text = String(body.text || "").trim()
  const voice = (String(body.voice || "Tatyana").trim() || "Tatyana") as PollyVoice

  if (!text) return Response.json({ ok: false, error: "text required" }, { status: 400 })
  if (!VOICES.has(voice)) return Response.json({ ok: false, error: "invalid voice" }, { status: 400 })

  const result = await awsSynthesizeSpeech(text, voice)
  if (!result.ok || !result.audioBase64) {
    return Response.json({ ok: false, error: result.error || "tts failed" }, { status: 502 })
  }

  return Response.json({ ok: true, audio: `data:audio/mpeg;base64,${result.audioBase64}` })
}
