import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import { createShortsUploadUrl, getShortsStorageConfig, publicShortsObjectUrl } from "@/lib/shorts/storage"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f-]{36}$/i

function sequenceOf(value: unknown) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number >= 0 && number <= 10_000_000 ? number : null
}

function boundedInt(value: unknown, min: number, max: number) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : null
}

function liveMime(value: unknown) {
  const raw = safeText(value, 160).toLowerCase()
  if (raw.startsWith("video/webm")) return raw
  if (raw.startsWith("video/mp4")) return raw
  return "video/webm"
}

function extensionFor(mime: string) {
  return mime.startsWith("video/mp4") ? "mp4" : "webm"
}

async function sessionById(liveId: string) {
  const rows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_live_sessions?select=id,creator_key,status,started_at,ended_at&` +
    `id=eq.${liveId}&limit=1`,
  ).catch(() => [])
  return rows[0] || null
}

export async function GET(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  const liveId = safeText(request.nextUrl.searchParams.get("liveId"), 80)
  if (!UUID.test(liveId)) return NextResponse.json({ error: "INVALID_LIVE_ID" }, { status: 400 })

  const after = sequenceOf(request.nextUrl.searchParams.get("after"))
  const limit = boundedInt(request.nextUrl.searchParams.get("limit"), 1, 24) || 8
  const viewerKey = safeText(request.nextUrl.searchParams.get("viewerKey"), 120).replace(/[^A-Za-z0-9._:-]/g, "")
  const session = await sessionById(liveId)
  if (!session) return NextResponse.json({ error: "LIVE_NOT_FOUND" }, { status: 404 })

  const { user } = await getOptionalWorkOSAuth()
  if (viewerKey && session.status === "live") {
    await shortsSupabaseRequest("malik_shorts_live_presence?on_conflict=live_id,viewer_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        live_id: liveId,
        viewer_key: viewerKey,
        user_key: user?.id || null,
        last_seen_at: new Date().toISOString(),
      }),
    }).catch(() => undefined)
    await shortsSupabaseRequest("rpc/malik_shorts_live_refresh_viewers", {
      method: "POST",
      body: JSON.stringify({ p_live_id: liveId }),
    }).catch(() => undefined)
  }

  let rows: any[] = []
  if (after != null) {
    rows = await shortsSupabaseRequest<any[]>(
      `malik_shorts_live_segments?select=sequence,public_url,mime_type,duration_ms,bytes,created_at&` +
      `live_id=eq.${liveId}&sequence=gt.${after}&order=sequence.asc&limit=${limit}`,
    ).catch(() => [])
  } else {
    rows = await shortsSupabaseRequest<any[]>(
      `malik_shorts_live_segments?select=sequence,public_url,mime_type,duration_ms,bytes,created_at&` +
      `live_id=eq.${liveId}&order=sequence.desc&limit=${Math.min(4, limit)}`,
    ).catch(() => [])
    rows.reverse()
  }

  return NextResponse.json({
    session: { id: session.id, status: session.status, endedAt: session.ended_at || null },
    segments: rows,
    nextSequence: rows.length ? Number(rows[rows.length - 1].sequence) : after,
    transport: "malik-chunk-v1",
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  if (!getShortsStorageConfig()) return NextResponse.json({ error: "SHORTS_STORAGE_NOT_CONFIGURED" }, { status: 503 })

  let input: { action?: string; liveId?: string; sequence?: number; contentType?: string; durationMs?: number; bytes?: number }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }

  const action = safeText(input.action, 20)
  const liveId = safeText(input.liveId, 80)
  const sequence = sequenceOf(input.sequence)
  if (!UUID.test(liveId)) return NextResponse.json({ error: "INVALID_LIVE_ID" }, { status: 400 })
  if (sequence == null) return NextResponse.json({ error: "INVALID_SEQUENCE" }, { status: 400 })

  const session = await sessionById(liveId)
  if (!session || session.creator_key !== user.id) return NextResponse.json({ error: "LIVE_NOT_OWNED" }, { status: 404 })
  if (session.status === "ended" || session.status === "cancelled") return NextResponse.json({ error: "LIVE_ALREADY_ENDED" }, { status: 409 })

  const mime = liveMime(input.contentType)
  const extension = extensionFor(mime)
  const key = `shorts/live/${liveId}/${String(sequence).padStart(9, "0")}.${extension}`

  if (action === "prepare") {
    const signed = await createShortsUploadUrl({ key, contentType: mime })
    return NextResponse.json({
      uploadUrl: signed.uploadUrl,
      publicUrl: signed.publicUrl,
      storageKey: key,
      sequence,
      contentType: mime,
      expiresInSeconds: 600,
    }, { headers: { "Cache-Control": "private, no-store" } })
  }

  if (action === "commit") {
    const durationMs = boundedInt(input.durationMs, 250, 30_000)
    const bytes = boundedInt(input.bytes, 0, 100_000_000)
    const publicUrl = publicShortsObjectUrl(key)
    await shortsSupabaseRequest("malik_shorts_live_segments?on_conflict=live_id,sequence", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        live_id: liveId,
        sequence,
        creator_key: user.id,
        storage_key: key,
        public_url: publicUrl,
        mime_type: mime,
        duration_ms: durationMs,
        bytes,
      }),
    })

    if (session.status === "scheduled") {
      await shortsSupabaseRequest(`malik_shorts_live_sessions?id=eq.${liveId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "live",
          started_at: session.started_at || new Date().toISOString(),
          playback_url: null,
          metadata: { transport: "malik-chunk-v1", mimeType: mime },
        }),
      }).catch(() => undefined)
    }

    if (sequence % 20 === 0) {
      await shortsSupabaseRequest("rpc/malik_shorts_live_trim_segments", {
        method: "POST",
        body: JSON.stringify({ p_live_id: liveId, p_keep: 120 }),
      }).catch(() => undefined)
    }

    return NextResponse.json({ ok: true, sequence, publicUrl, transport: "malik-chunk-v1" })
  }

  return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
}
