import "server-only"

import { resolveMediaUser } from "@/lib/media/request"
import { isCloudStorageConfigured, uploadMediaAsset } from "@/lib/storage/cloud-upload"
import type { VideoProviderId } from "@/lib/media/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"])
const VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"])
const MAX_IMAGE_BYTES = Number(process.env.MAX_UPLOAD_IMAGE_MB || 12) * 1024 * 1024
const MAX_VIDEO_BYTES = Number(process.env.MAX_UPLOAD_VIDEO_MB || 50) * 1024 * 1024
const SOURCE_PROVIDERS = new Set<VideoProviderId>(["magichour", "runway", "luma", "h3"])

function magicHourApiBase() {
  return String(process.env.MAGIC_HOUR_BASE_URL || "https://api.magichour.ai").trim().replace(/\/+$/, "")
}

function magicHourApiKey() {
  return String(process.env.MAGIC_HOUR_API_KEY || "").trim()
}

function runwayApiKey() {
  return String(process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY || "").trim()
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

async function uploadToRunway(file: File, ext: string) {
  const key = runwayApiKey()
  if (!key) {
    return {
      ok: false as const,
      status: 503,
      code: "RUNWAY_NOT_CONFIGURED",
      error: "Runway API не настроен.",
    }
  }

  const filename = `malik-source-${Date.now()}.${ext}`
  const createResponse = await fetch("https://api.dev.runwayml.com/v1/uploads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({ filename, type: "ephemeral" }),
    cache: "no-store",
  })

  const createPayload = await createResponse.json().catch(() => ({} as any))
  const uploadUrl = pickString(createPayload?.uploadUrl || createPayload?.upload_url)
  const runwayUri = pickString(createPayload?.runwayUri || createPayload?.runway_uri)
  const fields = createPayload?.fields && typeof createPayload.fields === "object" ? createPayload.fields : {}

  if (!createResponse.ok || !uploadUrl || !runwayUri) {
    const detail = pickString(createPayload?.message || createPayload?.error?.message || createPayload?.error)
    return {
      ok: false as const,
      status: 502,
      code: "RUNWAY_UPLOAD_INIT_FAILED",
      error: detail || `Runway не подготовил загрузку (HTTP ${createResponse.status}).`,
    }
  }

  const uploadForm = new FormData()
  for (const [keyName, value] of Object.entries(fields)) {
    if (typeof value === "string") uploadForm.append(keyName, value)
  }
  uploadForm.append("file", file, filename)

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: uploadForm,
    cache: "no-store",
  })

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "")
    return {
      ok: false as const,
      status: 502,
      code: "RUNWAY_UPLOAD_FAILED",
      error: detail.slice(0, 500) || `Runway upload failed (HTTP ${uploadResponse.status}).`,
    }
  }

  return { ok: true as const, filePath: runwayUri, provider: "runway" as const }
}

async function uploadToMagicHour(file: File, mode: "image" | "video", ext: string, mime: string) {
  const key = magicHourApiKey()
  if (!key) {
    return {
      ok: false as const,
      status: 503,
      code: "MAGIC_HOUR_NOT_CONFIGURED",
      error: "Magic Hour API не настроен.",
    }
  }

  const createResponse = await fetch(`${magicHourApiBase()}/v1/files/upload-urls`, {
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
    return {
      ok: false as const,
      status: 502,
      code: "SOURCE_UPLOAD_INIT_FAILED",
      error: detail || `Не удалось подготовить загрузку (HTTP ${createResponse.status}).`,
    }
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
    return {
      ok: false as const,
      status: 502,
      code: "SOURCE_UPLOAD_FAILED",
      error: detail.slice(0, 500) || `Загрузка файла не удалась (HTTP ${uploadResponse.status}).`,
    }
  }

  return { ok: true as const, filePath, provider: "magichour" as const }
}

export async function POST(request: Request) {
  const user = await resolveMediaUser(request)
  if (!user.authenticated || user.userId === "guest") {
    return Response.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Войдите в аккаунт, чтобы использовать генерацию видео." },
      { status: 401 },
    )
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  const requestedMode = String(form?.get("mode") || "").trim()
  const requestedProvider = String(form?.get("provider") || "").trim().toLowerCase()
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

  const provider = SOURCE_PROVIDERS.has(requestedProvider as VideoProviderId)
    ? requestedProvider as VideoProviderId
    : "magichour"

  const minVideoSeconds = provider === "luma" ? 1 : 3
  if (mode === "video" && (!Number.isFinite(durationSeconds) || durationSeconds < minVideoSeconds || durationSeconds > 10.05)) {
    return Response.json(
      { ok: false, code: "VIDEO_SOURCE_DURATION_UNSUPPORTED", error: `Для ${provider} загрузите видео длительностью от ${minVideoSeconds} до 10 секунд.` },
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

  if (provider === "runway") {
    const result = await uploadToRunway(file, ext)
    if (!result.ok) {
      return Response.json({ ok: false, code: result.code, error: result.error, provider }, { status: result.status })
    }
    return Response.json({
      ok: true,
      mode,
      provider,
      filePath: result.filePath,
      name: file.name,
      mime,
      size: file.size,
      durationSeconds: mode === "video" ? durationSeconds : undefined,
    })
  }

  if (provider === "magichour") {
    const result = await uploadToMagicHour(file, mode, ext, mime)
    if (!result.ok) {
      return Response.json({ ok: false, code: result.code, error: result.error, provider }, { status: result.status })
    }
    return Response.json({
      ok: true,
      mode,
      provider,
      filePath: result.filePath,
      name: file.name,
      mime,
      size: file.size,
      durationSeconds: mode === "video" ? durationSeconds : undefined,
    })
  }

  if (!isCloudStorageConfigured()) {
    return Response.json({
      ok: false,
      code: "PUBLIC_MEDIA_STORAGE_REQUIRED",
      error: `${provider} нужен публичный URL исходника. Настройте MEDIA_STORAGE_* в Render.`,
      provider,
    }, { status: 503 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const uploaded = await uploadMediaAsset({
    userId: user.userId,
    fileName: file.name || `source.${ext}`,
    mime,
    buffer: bytes,
    kind: "video-source",
  })
  if (!uploaded.stored || !uploaded.publicUrl) {
    return Response.json({
      ok: false,
      code: "SOURCE_STORAGE_FAILED",
      error: uploaded.reason || "Не удалось сохранить исходник.",
      provider,
    }, { status: 502 })
  }

  return Response.json({
    ok: true,
    mode,
    provider,
    filePath: uploaded.publicUrl,
    publicUrl: uploaded.publicUrl,
    name: file.name,
    mime,
    size: file.size,
    durationSeconds: mode === "video" ? durationSeconds : undefined,
  })
}
