import { NextRequest, NextResponse } from "next/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import { isAuthorizedShortsWorker, shortsWorkerConfigured } from "@/lib/shorts/workers"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f-]{36}$/i

export async function POST(request: NextRequest) {
  if (!shortsWorkerConfigured()) return NextResponse.json({ error: "WORKER_NOT_CONFIGURED" }, { status: 503 })
  if (!isAuthorizedShortsWorker(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  let input: { action?: string; draftId?: string; status?: string; publishedPostId?: string; error?: string }
  try { input = await request.json() } catch { input = { action: "claim" } }
  const action = safeText(input.action || "claim", 20)

  if (action === "claim") {
    const response = await shortsSupabaseRequest<any>("rpc/malik_shorts_claim_scheduled_draft", { method: "POST", body: "{}" }).catch(() => [])
    const draft = Array.isArray(response) ? response[0] : response
    if (!draft?.id) return NextResponse.json({ draft: null })
    const assets = draft.asset_id ? await shortsSupabaseRequest<any[]>(`malik_shorts_media_assets?select=*&id=eq.${draft.asset_id}&limit=1`).catch(() => []) : []
    return NextResponse.json({ draft, asset: assets[0] || null })
  }

  if (action === "finish") {
    const draftId = safeText(input.draftId, 80)
    if (!UUID.test(draftId)) return NextResponse.json({ error: "INVALID_DRAFT_ID" }, { status: 400 })
    const status = safeText(input.status || "published", 30)
    if (!new Set(["published", "failed", "cancelled"]).has(status)) return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 })
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    const postId = safeText(input.publishedPostId, 80)
    if (status === "published" && UUID.test(postId)) patch.published_post_id = postId
    if (status === "failed") patch.settings = { workerError: safeText(input.error, 2000) || "publish failed" }
    await shortsSupabaseRequest(`malik_shorts_drafts?id=eq.${draftId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
}
