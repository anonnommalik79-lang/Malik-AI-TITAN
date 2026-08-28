import { transcribeVoiceAudio, isVoiceTranscribeConfigured } from "@/lib/transcribe/voice-router"
import { getVoiceUsage, consumeVoiceUsage } from "@/lib/voice/usage"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

import { withCompute } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BYTES = 25 * 1024 * 1024

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  const quota = getVoiceUsage(entitlement.userId)
  return Response.json({ ok: true, configured: isVoiceTranscribeConfigured(), quota })
}

export const POST = withCompute(handlePOST, "voice")

async function handlePOST(request: Request) {
  if (!isVoiceTranscribeConfigured()) {
    return Response.json({ ok: false, error: "Voice STT ещё не настроен в Environment." }, { status: 503 })
  }

  const entitlement = await resolveRequestEntitlement(request)
  const before = getVoiceUsage(entitlement.userId)
  if (before.remainingSeconds <= 0) {
    return Response.json({ ok: false, error: "Лимит Voice на сегодня использован. Доступ восстановится завтра.", quota: before }, { status: 429 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ ok: false, error: "ожидается multipart/form-data с полем file" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof Blob)) return Response.json({ ok: false, error: "файл не передан" }, { status: 400 })
  if (!file.size) return Response.json({ ok: false, error: "пустой аудиофайл" }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ ok: false, error: "файл больше 25 МБ — разбейте на части" }, { status: 413 })

  const language = String(form.get("language") || "auto") || "auto"
  const prompt = form.get("prompt") ? String(form.get("prompt")) : undefined
  const filename = file instanceof File ? file.name : "voice-audio"
  const mime = file.type || "application/octet-stream"
  const claimedDuration = Math.max(0, Number(form.get("durationSec") || 0))

  if (claimedDuration > before.remainingSeconds + .5) {
    return Response.json({ ok: false, error: `Осталось ${Math.ceil(before.remainingSeconds)} сек. Voice на сегодня.`, quota: before }, { status: 429 })
  }

  const result = await transcribeVoiceAudio(await file.arrayBuffer(), filename, mime, { language, prompt })
  if (!result.ok) {
    console.warn("[VOICE_STT_FAILED]", result.attempts)
    return Response.json({ ok: false, error: result.error || "Не удалось распознать голос. Попробуйте ещё раз." }, { status: 502 })
  }

  const measuredDuration = Math.max(1, Math.min(120, claimedDuration || result.durationSec || 10))
  const quota = consumeVoiceUsage(entitlement.userId, measuredDuration)
  if (!quota.ok) {
    return Response.json({ ok: false, error: "Лимит Voice на сегодня использован. Доступ восстановится завтра.", quota }, { status: 429 })
  }

  console.info("[VOICE_STT_OK]", { provider: result.provider, model: result.model, latencyMs: result.latencyMs, durationSec: measuredDuration })
  return Response.json({
    ok: true,
    text: result.text,
    language: result.language,
    durationSec: measuredDuration,
    remainingSeconds: quota.remainingSeconds,
  })
}
