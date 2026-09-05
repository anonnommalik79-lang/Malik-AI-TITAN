import { NextRequest, NextResponse } from "next/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import { isAuthorizedShortsWorker, shortsWorkerConfigured, workerName } from "@/lib/shorts/workers"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f-]{36}$/i
const MEDIA_JOB_TYPES = new Set(["virus_scan","probe","transcode_hls","thumbnail","caption","moderation","embedding","cleanup"])

type WorkerResult = Record<string, unknown>
type JobRow = { id: string; asset_id: string; job_type: string }
type AssetRow = { id: string; post_id?: string | null }

function positiveInt(value: unknown, max = 2_000_000_000) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number >= 0 ? Math.min(number, max) : null
}

function safeUrl(value: unknown) {
  const text = safeText(value, 2500)
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch { return null }
}

async function persistWorkerResult(job: JobRow, result: WorkerResult) {
  const assets = await shortsSupabaseRequest<AssetRow[]>(`malik_shorts_media_assets?select=id,post_id&id=eq.${job.asset_id}&limit=1`).catch(() => [])
  const asset = assets[0]
  if (!asset) return

  if (job.job_type === "probe") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), status: "processing" }
    const width = positiveInt(result.width, 100_000)
    const height = positiveInt(result.height, 100_000)
    const bytes = positiveInt(result.bytes, 20_000_000_000)
    const durationMs = positiveInt(result.durationMs, 86_400_000)
    const mimeType = safeText(result.mimeType, 120)
    if (width != null) patch.width = width
    if (height != null) patch.height = height
    if (bytes != null) patch.bytes = bytes
    if (durationMs != null) patch.duration_ms = durationMs
    if (mimeType) patch.mime_type = mimeType
    patch.metadata = {
      codec: safeText(result.codec, 120) || null,
      audioCodec: safeText(result.audioCodec, 120) || null,
      fps: Number.isFinite(Number(result.fps)) ? Number(result.fps) : null,
      hasAudio: Boolean(result.hasAudio),
      probedAt: new Date().toISOString(),
    }
    await shortsSupabaseRequest(`malik_shorts_media_assets?id=eq.${asset.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch),
    }).catch(() => undefined)
    return
  }

  if (job.job_type === "thumbnail") {
    const publicUrl = safeUrl(result.publicUrl)
    const storageKey = safeText(result.storageKey, 1000)
    const width = positiveInt(result.width, 100_000) ?? 0
    const height = positiveInt(result.height, 100_000) ?? 0
    if (!publicUrl || !storageKey) return
    await shortsSupabaseRequest("malik_shorts_media_renditions?on_conflict=asset_id,kind,width,height,bitrate_kbps", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ asset_id: asset.id, kind: "poster", storage_key: storageKey, public_url: publicUrl, width, height, bitrate_kbps: 0, container: "jpeg", status: "ready" }),
    }).catch(() => undefined)
    if (asset.post_id) {
      await shortsSupabaseRequest(`malik_shorts_posts?id=eq.${asset.post_id}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ poster_url: publicUrl }),
      }).catch(() => undefined)
    }
    return
  }

  if (job.job_type === "transcode_hls") {
    const masterUrl = safeUrl(result.masterUrl)
    const masterKey = safeText(result.masterKey, 1000)
    const variants = Array.isArray(result.variants) ? result.variants.slice(0, 8) : []
    const rows: Record<string, unknown>[] = []
    if (masterUrl && masterKey) rows.push({ asset_id: asset.id, kind: "hls_master", storage_key: masterKey, public_url: masterUrl, width: 0, height: 0, bitrate_kbps: 0, container: "hls", status: "ready" })
    for (const variant of variants) {
      if (!variant || typeof variant !== "object" || Array.isArray(variant)) continue
      const row = variant as Record<string, unknown>
      const publicUrl = safeUrl(row.publicUrl)
      const storageKey = safeText(row.storageKey, 1000)
      const width = positiveInt(row.width, 100_000)
      const height = positiveInt(row.height, 100_000)
      const bitrateKbps = positiveInt(row.bitrateKbps, 500_000)
      if (!publicUrl || !storageKey || width == null || height == null || bitrateKbps == null) continue
      rows.push({ asset_id: asset.id, kind: "hls_variant", storage_key: storageKey, public_url: publicUrl, width, height, bitrate_kbps: bitrateKbps, codec: safeText(row.codec, 80) || "h264", container: "hls", status: "ready" })
    }
    if (rows.length) {
      await shortsSupabaseRequest("malik_shorts_media_renditions?on_conflict=asset_id,kind,width,height,bitrate_kbps", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows),
      }).catch(() => undefined)
    }
    await shortsSupabaseRequest(`malik_shorts_media_assets?id=eq.${asset.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ready", updated_at: new Date().toISOString(), metadata: { hlsMasterUrl: masterUrl, transcodedAt: new Date().toISOString() } }),
    }).catch(() => undefined)
  }
}

export async function POST(request: NextRequest) {
  if (!shortsWorkerConfigured()) return NextResponse.json({ error: "WORKER_NOT_CONFIGURED" }, { status: 503 })
  if (!isAuthorizedShortsWorker(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  let input: { action?: string; jobId?: string; jobTypes?: string[]; success?: boolean; result?: WorkerResult; error?: string }
  try { input = await request.json() } catch { input = { action: "claim" } }
  const action = safeText(input.action || "claim", 20)
  const worker = workerName(request)

  if (action === "claim") {
    const requested = Array.isArray(input.jobTypes)
      ? Array.from(new Set(input.jobTypes.map((value) => safeText(value, 40)).filter((value) => MEDIA_JOB_TYPES.has(value)))).slice(0, 8)
      : []
    const endpoint = requested.length ? "rpc/malik_shorts_claim_media_job_v2" : "rpc/malik_shorts_claim_media_job"
    const body = requested.length ? { p_worker: worker, p_job_types: requested } : { p_worker: worker }
    const response = await shortsSupabaseRequest<any>(endpoint, { method: "POST", body: JSON.stringify(body) }).catch(() => [])
    const job = Array.isArray(response) ? response[0] : response
    if (!job?.id) return NextResponse.json({ job: null })
    const assets = await shortsSupabaseRequest<any[]>(`malik_shorts_media_assets?select=*&id=eq.${job.asset_id}&limit=1`).catch(() => [])
    return NextResponse.json({ job, asset: assets[0] || null })
  }

  if (action === "finish") {
    const jobId = safeText(input.jobId, 80)
    if (!UUID.test(jobId)) return NextResponse.json({ error: "INVALID_JOB_ID" }, { status: 400 })
    const jobs = await shortsSupabaseRequest<JobRow[]>(`malik_shorts_media_jobs?select=id,asset_id,job_type&id=eq.${jobId}&limit=1`).catch(() => [])
    const job = jobs[0]
    if (!job) return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 })
    const result = input.result && typeof input.result === "object" && !Array.isArray(input.result) ? input.result : {}
    const response = await shortsSupabaseRequest<any>("rpc/malik_shorts_finish_media_job", {
      method: "POST",
      body: JSON.stringify({ p_job_id: jobId, p_worker: worker, p_success: Boolean(input.success), p_result: result, p_error: safeText(input.error, 4000) || null }),
    }).catch(() => false)
    const ok = Array.isArray(response) ? Boolean(response[0]) : Boolean(response)
    if (ok && input.success) await persistWorkerResult(job, result).catch((error) => console.error("[Malik Shorts] media result persist failed", error))
    return NextResponse.json({ ok })
  }

  return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
}
