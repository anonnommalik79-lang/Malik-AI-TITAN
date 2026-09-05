import { NextRequest, NextResponse } from "next/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import { createShortsUploadUrl, getShortsStorageConfig } from "@/lib/shorts/storage"
import { isAuthorizedShortsWorker, shortsWorkerConfigured } from "@/lib/shorts/workers"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f-]{36}$/i

function allowedContentType(value: unknown) {
  const type = safeText(value, 120).toLowerCase()
  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/mp2t",
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "audio/aac",
    "audio/mpeg",
  ])
  return allowed.has(type) ? type : null
}

export async function POST(request: NextRequest) {
  if (!shortsWorkerConfigured()) return NextResponse.json({ error: "WORKER_NOT_CONFIGURED" }, { status: 503 })
  if (!isAuthorizedShortsWorker(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  if (!getShortsStorageConfig()) return NextResponse.json({ error: "SHORTS_STORAGE_NOT_CONFIGURED" }, { status: 503 })

  let input: { assetId?: string; key?: string; contentType?: string }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }

  const assetId = safeText(input.assetId, 80)
  const key = safeText(input.key, 1200)
  const contentType = allowedContentType(input.contentType)
  if (!UUID.test(assetId) || !contentType) return NextResponse.json({ error: "INVALID_OUTPUT" }, { status: 400 })
  const prefix = `shorts/renditions/${assetId}/`
  if (!key.startsWith(prefix) || key.includes("..") || key.includes("\\")) return NextResponse.json({ error: "INVALID_OUTPUT_KEY" }, { status: 400 })

  const assets = await shortsSupabaseRequest<any[]>(`malik_shorts_media_assets?select=id&id=eq.${assetId}&limit=1`).catch(() => [])
  if (!assets[0]) return NextResponse.json({ error: "ASSET_NOT_FOUND" }, { status: 404 })

  const signed = await createShortsUploadUrl({ key, contentType })
  return NextResponse.json({
    uploadUrl: signed.uploadUrl,
    publicUrl: signed.publicUrl,
    storageKey: key,
    contentType,
    expiresInSeconds: 600,
  }, { headers: { "Cache-Control": "private, no-store" } })
}
