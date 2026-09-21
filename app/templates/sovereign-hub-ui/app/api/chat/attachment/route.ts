import { NextResponse } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { validateUploadFile } from "@/lib/uploads/validate-file"
import { isStorageConfigured, persistUploadMetadata } from "@/lib/uploads/storage"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId === "guest") {
    return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  }

  let body: any
  try {
    body = await readJsonBodyLimited(request, 16 * 1024 * 1024)
  } catch (error) {
    const status = error instanceof RequestSafetyError ? error.status : 400
    return NextResponse.json({ ok: false, error: error instanceof RequestSafetyError ? error.code : "INVALID_JSON" }, { status })
  }

  const file = body?.file
  const result = validateUploadFile({
    name: String(file?.name || "image"),
    mime: String(file?.mime || "application/octet-stream"),
    size: Number(file?.size || 0),
    base64: typeof file?.base64 === "string" ? file.base64 : undefined,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 })
  }
  if (result.file.kind !== "image") {
    return NextResponse.json({ ok: false, error: "IMAGE_REQUIRED" }, { status: 400 })
  }

  const stored = await persistUploadMetadata(entitlement.userId, result.file)
  const url = stored.stored ? String(stored.publicUrl || stored.file?.url || "") : ""

  return NextResponse.json({
    ok: true,
    configured: isStorageConfigured(),
    stored: Boolean(stored.stored),
    url,
    reason: stored.stored ? undefined : stored.reason,
  }, { headers: { "Cache-Control": "private, no-store" } })
}
