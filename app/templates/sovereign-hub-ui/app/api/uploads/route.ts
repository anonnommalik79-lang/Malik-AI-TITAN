import { validateUploadFile } from "@/lib/uploads/validate-file"
import { persistUploadMetadata, isStorageConfigured } from "@/lib/uploads/storage"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { checkUsageLimit } from "@/lib/limits/rate-limit"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const entitlement = await resolveRequestEntitlement(request)
  const files = Array.isArray(body?.files) ? body.files : body?.file ? [body.file] : []

  const limit = await checkUsageLimit({
    userId: entitlement.userId,
    plan: entitlement.plan,
    task: "file_analysis",
    uploadCount: files.length,
  })
  if (!limit.ok) {
    return Response.json({ ok: false, error: limit.error, resetAt: limit.resetAt, plan: limit.plan }, { status: 429 })
  }

  const validated = []
  for (const file of files) {
    const result = validateUploadFile({
      name: String(file?.name || "file"),
      mime: String(file?.mime || file?.type || "application/octet-stream"),
      size: Number(file?.size || 0),
      base64: typeof file?.base64 === "string" ? file.base64 : undefined,
      text: typeof file?.text === "string" ? file.text : undefined,
    })
    if (!result.ok) return Response.json({ ok: false, error: result.error, code: result.code }, { status: 400 })
    const stored = await persistUploadMetadata(entitlement.userId, result.file)
    validated.push(stored)
  }

  return Response.json({
    ok: true,
    storageConfigured: isStorageConfigured(),
    files: validated,
  })
}

export async function GET() {
  return Response.json({
    ok: true,
    storageConfigured: isStorageConfigured(),
    maxImageMb: Number(process.env.MAX_UPLOAD_IMAGE_MB || 10),
    maxVideoMb: Number(process.env.MAX_UPLOAD_VIDEO_MB || 50),
    supported: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "text/plain", "application/pdf"],
  })
}
