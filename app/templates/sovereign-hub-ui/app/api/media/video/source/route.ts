import "server-only"

import { resolveMediaUser } from "@/lib/media/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"])
const VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"])
const MAX_IMAGE_BYTES = Number(process.env.MAX_UPLOAD_IMAGE_MB || 12) * 1024 * 1024
const MAX_VIDEO_BYTES = Number(process.env.MAX_UPLOAD_VIDEO_MB || 50) * 1024 * 1024

function apiBase() {
  return String(process.env.MAGIC_HOUR_BASE_URL || "https://api.magichour.ai").trim().replace(/\/+$/, "")
}

function apiKey() {
  return String(process.env.MAGIC_HOUR_API_KEY || "").trim()
}

function extension(name: string, mime: string) {
  const raw = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (raw && raw.length <= 5) {
    if (raw === "jpeg") return "jpg"
    if (raw === "m4v") return "m4v"
    return raw
  }
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/avif") return "avif"
  if (mime === "video/webm") return "webm"
  if (mime === "video/quicktime") return "mov"
  if (mime === "video/x-m4v") return "m4v"
  return mime.startsWith("video/") ? "mp4" : "jpg"
}

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: Request) {
  const user = await resolveMediaUser(request)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт, чтобы использовать генерацию видео." },
      { status: 401 },
    )
  }

  const key = apiKey()
  if (!key) {
    return Response.json(
      { ok: false, code: "MAGIC_HOUR_NOT_CONFIGURED", error: "Magic Hour API не настроен." },
      { status: 503 },
    )
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  const requestedMode = String(form?.get("mode") || "").trim()
  const durationSeconds = Number(form?.get("durationSeconds") || 0)
  if (!(file instanceof File) || file.size <= 0) {
    return Response.json({ ok: false, code: "FILE_REQUIRED", error: "Выберите файл." }, { status: 400 })
  }

  const mime = String(file.type || "").toLowerCase()
  const inferredMode = IMAGE_MIME.has(mime) ? "image" : VIDEO_MIME.has(mime) ? "video" : ""
  const mode = requestedMode === "image" || requestedMode === "video" ? requestedMode : inferredMode
  if (!mode || (mode === "image" && !IMAGE_MIME.has(mime)) || (mode === "video" && !VIDEO_MIME.has(mime))) {
    return Response.json(
      { ok: false, code: "UNSUPPORTED_MEDIA", error: "Поддерживаются PNG/JPG/WebP/AVIF и MP4/WebM/MOV/M4V." },
      { status: 415 },
    )
  }

  if (mode === "video" && (!Number.isFinite(durationSeconds) || durationSeconds < 3 || durationSeconds > 5.05)) {
    return Response.json(
      { ok: false, code: "VIDEO_SOURCE_DURATION_UNSUPPORTED", error: "Для AI-редактирования загрузите видео длительностью от 3 до 5 секунд." },
      { status: 400 },
    )
  }

  const maxBytes = mode === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
  if (file.size > maxBytes) {
    return Response.json(
      { ok: false, code: "MEDIA_TOO_LARGE", error: `Файл слишком большой. Максимум ${Math.floor(maxBytes / 1024 / 1024)} МБ.` },
      { status: 413 },
    )
  }

  const ext = extension(file.name || "source", mime)
  const createResponse = await fetch(`${apiBase()}/v1/files/upload-urls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ items: [{ type: mode, extension: ext }] }),
    cache: "no-store",
  })

  const createPayload = await createResponse.json().catch(() => ({} as any))
  const item = Array.isArray(createPayload?.items) ? createPayload.items[0] : undefined
  const uploadUrl = pickString(item?.upload_url || item?.uploadUrl)
  const filePath = pickString(item?.file_path || item?.filePath)
  if (!createResponse.ok || !uploadUrl || !filePath) {
    const detail = pickString(createPayload?.message || createPayload?.error?.message || createPayload?.error)
    return Response.json(
      { ok: false, code: "SOURCE_UPLOAD_INIT_FAILED", error: detail || `Не удалось подготовить загрузку (HTTP ${createResponse.status}).` },
      { status: 502 },
    )
  }

  const bytes = await file.arrayBuffer()
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime || "application/octet-stream" },
    body: bytes,
    cache: "no-store",
  })

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "")
    return Response.json(
      { ok: false, code: "SOURCE_UPLOAD_FAILED", error: detail.slice(0, 500) || `Загрузка файла не удалась (HTTP ${uploadResponse.status}).` },
      { status: 502 },
    )
  }

  return Response.json({
    ok: true,
    mode,
    filePath,
    name: file.name,
    mime,
    size: file.size,
    durationSeconds: mode === "video" ? durationSeconds : undefined,
  })
}
