import type { UploadValidationResult, UploadedFile, UploadedFileKind } from "./types"

const DEFAULT_MAX_IMAGE_BYTES = Number(process.env.MALIK_MAX_IMAGE_MB || process.env.MAX_UPLOAD_IMAGE_MB || 10) * 1024 * 1024
const DEFAULT_MAX_VIDEO_BYTES = Number(process.env.MAX_UPLOAD_VIDEO_MB || 50) * 1024 * 1024
const DEFAULT_MAX_DOC_BYTES = Number(process.env.MALIK_MAX_DOCUMENT_MB || process.env.MAX_UPLOAD_DOC_MB || 12) * 1024 * 1024

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/aac",
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/html",
  "text/css",
  "application/json",
  "application/xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
])

function detectKind(mime: string): UploadedFileKind {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") return "text"
  if (mime === "application/pdf" || mime.includes("officedocument")) return "document"
  return "unknown"
}

function maxBytesForKind(kind: UploadedFileKind): number {
  if (kind === "image") return DEFAULT_MAX_IMAGE_BYTES
  if (kind === "video") return DEFAULT_MAX_VIDEO_BYTES
  return DEFAULT_MAX_DOC_BYTES
}

export function validateUploadFile(file: { name: string; mime: string; size: number; base64?: string; text?: string }): UploadValidationResult {
  const mime = (file.mime || "application/octet-stream").toLowerCase()
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, error: `Unsupported file type: ${mime}`, code: "UNSUPPORTED_MIME" }
  }
  const kind = detectKind(mime)
  const max = maxBytesForKind(kind)
  if (file.size > max) {
    return { ok: false, error: `File too large. Max ${Math.round(max / (1024 * 1024))}MB for ${kind}.`, code: "FILE_TOO_LARGE" }
  }
  const uploaded: UploadedFile = {
    id: crypto.randomUUID(),
    name: file.name,
    mime,
    size: file.size,
    kind,
    base64: file.base64,
    text: file.text,
  }
  return { ok: true, file: uploaded }
}

export function toAIAttachments(files: UploadedFile[]) {
  return files.map((file) => ({
    id: file.id,
    name: file.name,
    mime: file.mime,
    size: file.size,
    kind: file.kind === "document" ? "file" : file.kind === "text" ? "file" : file.kind,
    base64: file.base64,
    text: file.text,
    url: file.url,
  }))
}
