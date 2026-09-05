import { NextRequest, NextResponse } from "next/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import { isAuthorizedShortsWorker, shortsWorkerConfigured, workerName } from "@/lib/shorts/workers"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f-]{36}$/i

export async function POST(request: NextRequest) {
  if (!shortsWorkerConfigured()) return NextResponse.json({ error: "WORKER_NOT_CONFIGURED" }, { status: 503 })
  if (!isAuthorizedShortsWorker(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  let input: { action?: string; jobId?: string; success?: boolean; result?: Record<string, unknown>; error?: string }
  try { input = await request.json() } catch { input = { action: "claim" } }
  const action = safeText(input.action || "claim", 20)
  const worker = workerName(request)

  if (action === "claim") {
    const response = await shortsSupabaseRequest<any>("rpc/malik_shorts_claim_media_job", { method: "POST", body: JSON.stringify({ p_worker: worker }) }).catch(() => [])
    const job = Array.isArray(response) ? response[0] : response
    if (!job?.id) return NextResponse.json({ job: null })
    const assets = await shortsSupabaseRequest<any[]>(`malik_shorts_media_assets?select=*&id=eq.${job.asset_id}&limit=1`).catch(() => [])
    return NextResponse.json({ job, asset: assets[0] || null })
  }

  if (action === "finish") {
    const jobId = safeText(input.jobId, 80)
    if (!UUID.test(jobId)) return NextResponse.json({ error: "INVALID_JOB_ID" }, { status: 400 })
    const result = input.result && typeof input.result === "object" && !Array.isArray(input.result) ? input.result : {}
    const response = await shortsSupabaseRequest<any>("rpc/malik_shorts_finish_media_job", {
      method: "POST",
      body: JSON.stringify({ p_job_id: jobId, p_worker: worker, p_success: Boolean(input.success), p_result: result, p_error: safeText(input.error, 4000) || null }),
    }).catch(() => false)
    const ok = Array.isArray(response) ? Boolean(response[0]) : Boolean(response)
    return NextResponse.json({ ok })
  }

  return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
}
