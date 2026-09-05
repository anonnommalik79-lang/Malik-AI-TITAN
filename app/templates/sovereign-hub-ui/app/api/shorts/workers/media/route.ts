import { NextRequest, NextResponse } from "next/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import { isAuthorizedShortsWorker, shortsWorkerConfigured, workerName } from "@/lib/shorts/workers"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f-]{36}$/i
const HEX64 = /^[0-9a-f]{64}$/i
const MEDIA_JOB_TYPES = new Set(["virus_scan","probe","fingerprint","transcode_hls","thumbnail","caption","moderation","embedding","cleanup"])

type WorkerResult = Record<string, unknown>
type JobRow = { id: string; asset_id: string; job_type: string }
type AssetRow = { id: string; post_id?: string | null; owner_key?: string | null }

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

function safeFingerprint(value: unknown) {
  const text = safeText(value, 256).toLowerCase()
  return HEX64.test(text) ? text : null
}

async function persistFingerprint(asset: AssetRow, result: WorkerResult) {
  const exactSha256 = safeFingerprint(result.exactSha256)
  const videoFingerprint = safeFingerprint(result.videoFingerprint)
  const audioFingerprint = safeFingerprint(result.audioFingerprint)
  if (!exactSha256 && !videoFingerprint && !audioFingerprint) return

  const durationMs = positiveInt(result.durationMs, 86_400_000)
  const width = positiveInt(result.width, 100_000)
  const height = positiveInt(result.height, 100_000)
  const algorithmVersion = safeText(result.algorithmVersion, 80) || "malik-fp-v1"

  await shortsSupabaseRequest("malik_shorts_media_fingerprints?on_conflict=asset_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      asset_id: asset.id,
      post_id: asset.post_id || null,
      exact_sha256: exactSha256,
      video_fingerprint: videoFingerprint,
      audio_fingerprint: audioFingerprint,
      duration_ms: durationMs,
      width,
      height,
      algorithm_version: algorithmVersion,
      metadata: { workerRecordedAt: new Date().toISOString() },
    }),
  }).catch(() => undefined)

  if (exactSha256) {
    await shortsSupabaseRequest(`malik_shorts_media_assets?id=eq.${asset.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ sha256: exactSha256, updated_at: new Date().toISOString() }),
    }).catch(() => undefined)
  }

  const matches: Array<{ asset_id: string; match_kind: "exact" | "video_fingerprint" | "audio_fingerprint"; score: number }> = []
  if (exactSha256) {
    const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_media_fingerprints?select=asset_id&exact_sha256=eq.${exactSha256}&asset_id=neq.${asset.id}&limit=8`).catch(() => [])
    for (const row of rows) if (UUID.test(String(row.asset_id || ""))) matches.push({ asset_id: String(row.asset_id), match_kind: "exact", score: 1 })
  }
  if (!matches.length && videoFingerprint) {
    const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_media_fingerprints?select=asset_id&video_fingerprint=eq.${videoFingerprint}&asset_id=neq.${asset.id}&limit=8`).catch(() => [])
    for (const row of rows) if (UUID.test(String(row.asset_id || ""))) matches.push({ asset_id: String(row.asset_id), match_kind: "video_fingerprint", score: .96 })
  }
  if (!matches.length && audioFingerprint) {
    const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_media_fingerprints?select=asset_id&audio_fingerprint=eq.${audioFingerprint}&asset_id=neq.${asset.id}&limit=8`).catch(() => [])
    for (const row of rows) if (UUID.test(String(row.asset_id || ""))) matches.push({ asset_id: String(row.asset_id), match_kind: "audio_fingerprint", score: .9 })
  }

  if (!matches.length) return
  const deduped = Array.from(new Map(matches.map((match) => [`${match.asset_id}:${match.match_kind}`, match])).values()).slice(0, 8)
  await shortsSupabaseRequest("malik_shorts_duplicate_matches?on_conflict=source_asset_id,matched_asset_id,match_kind", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(deduped.map((match) => ({
      source_asset_id: asset.id,
      matched_asset_id: match.asset_id,
      match_kind: match.match_kind,
      score: match.score,
      status: "review",
      metadata: { algorithmVersion, detectedAt: new Date().toISOString() },
    }))),
  }).catch(() => undefined)

  if (asset.post_id) {
    await shortsSupabaseRequest("malik_shorts_moderation_cases", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        post_id: asset.post_id,
        profile_key: asset.owner_key || null,
        source: "copyright",
        severity: deduped.some((match) => match.match_kind === "exact") ? "high" : "medium",
        labels: {
          duplicateCandidates: deduped.map((match) => ({ assetId: match.asset_id, kind: match.match_kind, score: match.score })),
          algorithmVersion,
        },
        status: "open",
        notes: "Automated fingerprint match. Human/rights review required before enforcement.",
      }),
    }).catch(() => undefined)
  }
}

async function persistWorkerResult(job: JobRow, result: WorkerResult) {
  const assets = await shortsSupabaseRequest<AssetRow[]>(`malik_shorts_media_assets?select=id,post_id,owner_key&id=eq.${job.asset_id}&limit=1`).catch(() => [])
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

  if (job.job_type === "fingerprint") {
    await persistFingerprint(asset, result)
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
    const fallback = result.fallback && typeof result.fallback === "object" && !Array.isArray(result.fallback)
      ? result.fallback as Record<string, unknown>
      : null
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

    let fallbackUrl: string | null = null
    if (fallback) {
      fallbackUrl = safeUrl(fallback.publicUrl)
      const storageKey = safeText(fallback.storageKey, 1000)
      const width = positiveInt(fallback.width, 100_000)
      const height = positiveInt(fallback.height, 100_000)
      const bitrateKbps = positiveInt(fallback.bitrateKbps, 500_000)
      const bytes = positiveInt(fallback.bytes, 20_000_000_000)
      if (fallbackUrl && storageKey && width != null && height != null && bitrateKbps != null) {
        rows.push({ asset_id: asset.id, kind: "mp4", storage_key: storageKey, public_url: fallbackUrl, width, height, bitrate_kbps: bitrateKbps, codec: safeText(fallback.codec, 80) || "h264+aac", container: "mp4", bytes, status: "ready" })
      }
    }

    if (rows.length) {
      await shortsSupabaseRequest("malik_shorts_media_renditions?on_conflict=asset_id,kind,width,height,bitrate_kbps", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows),
      }).catch(() => undefined)
    }
    await shortsSupabaseRequest(`malik_shorts_media_assets?id=eq.${asset.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "ready",
        updated_at: new Date().toISOString(),
        metadata: { hlsMasterUrl: masterUrl, progressiveUrl: fallbackUrl, transcodedAt: new Date().toISOString() },
      }),
    }).catch(() => undefined)
    if (asset.post_id && fallbackUrl) {
      await shortsSupabaseRequest(`malik_shorts_posts?id=eq.${asset.post_id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ media_url: fallbackUrl }),
      }).catch(() => undefined)
    }
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
