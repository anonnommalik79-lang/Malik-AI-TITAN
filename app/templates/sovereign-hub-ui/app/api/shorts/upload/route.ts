import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { createShortsUploadUrl, getShortsStorageConfig } from "@/lib/shorts/storage"
import { safeText } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "image/jpeg",
  "image/png",
  "image/webp",
])
const MAX_VIDEO_BYTES = 500 * 1024 * 1024
const MAX_IMAGE_BYTES = 30 * 1024 * 1024

function extension(filename: string, mime: string) {
  const raw = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (raw && raw.length <= 5) return raw
  if (mime === "video/mp4") return "mp4"
  if (mime === "video/webm") return "webm"
  if (mime === "video/quicktime") return "mov"
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  return "jpg"
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsStorageConfig()) return NextResponse.json({ error: "SHORTS_STORAGE_NOT_CONFIGURED" }, { status: 503 })

  let input: { filename?: string; mime?: string; size?: number }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }

  const filename = safeText(input.filename, 180) || "upload"
  const mime = safeText(input.mime, 80).toLowerCase()
  const size = Math.floor(Number(input.size || 0))
  if (!ALLOWED_MIME.has(mime) || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "INVALID_MEDIA" }, { status: 400 })
  }
  const max = mime.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  if (size > max) return NextResponse.json({ error: "MEDIA_TOO_LARGE", maxBytes: max }, { status: 413 })

  const userPart = user.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)
  const kind = mime.startsWith("video/") ? "video" : "image"
  const key = `shorts/${userPart}/${kind}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension(filename, mime)}`

  try {
    const signed = await createShortsUploadUrl({ key, contentType: mime })
    return NextResponse.json({
      key,
      uploadUrl: signed.uploadUrl,
      publicUrl: signed.publicUrl,
      method: "PUT",
      headers: { "Content-Type": mime },
      expiresInSeconds: 600,
    })
  } catch (error) {
    console.error("[Malik Shorts] presign failed", error)
    return NextResponse.json({ error: "UPLOAD_URL_FAILED" }, { status: 500 })
  }
}
