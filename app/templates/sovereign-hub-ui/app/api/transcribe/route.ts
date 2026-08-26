import { transcribeAudio, isTranscribeConfigured } from "@/lib/transcribe/groq-whisper"

export const runtime = "nodejs"

const MAX_BYTES = 25 * 1024 * 1024 // Groq Whisper free-tier file cap

export async function GET() {
  return Response.json({ ok: true, configured: isTranscribeConfigured() })
}

export async function POST(request: Request) {
  if (!isTranscribeConfigured()) {
    return Response.json(
      { ok: false, error: "Транскрипция не подключена. Добавьте GROQ_API_KEY в Render Environment" },
      { status: 503 },
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ ok: false, error: "ожидается multipart/form-data с полем file" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof Blob)) {
    return Response.json({ ok: false, error: "файл не передан" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "файл больше 25 МБ — разбейте на части" }, { status: 413 })
  }

  const language = String(form.get("language") || "auto") || "auto"
  const prompt = form.get("prompt") ? String(form.get("prompt")) : undefined
  const filename = file instanceof File ? file.name : "audio"
  const mime = file.type || "application/octet-stream"

  const result = await transcribeAudio(await file.arrayBuffer(), filename, mime, { language, prompt })
  if (!result.ok) return Response.json(result, { status: 502 })
  return Response.json(result)
}
