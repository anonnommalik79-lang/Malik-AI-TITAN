import { NextRequest, NextResponse } from "next/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import { isAuthorizedShortsWorker, shortsWorkerConfigured, workerName } from "@/lib/shorts/workers"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f-]{36}$/i

export async function POST(request: NextRequest) {
  if (!shortsWorkerConfigured()) return NextResponse.json({ error: "WORKER_NOT_CONFIGURED" }, { status: 503 })
  if (!isAuthorizedShortsWorker(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  let input: { action?: string; runId?: string; status?: string; output?: Record<string, unknown>; error?: string; draftId?: string }
  try { input = await request.json() } catch { input = { action: "claim" } }
  const action = safeText(input.action || "claim", 20)

  if (action === "claim") {
    const response = await shortsSupabaseRequest<any>("rpc/malik_shorts_claim_agent_run", { method: "POST", body: JSON.stringify({ p_worker: workerName(request) }) }).catch(() => [])
    const run = Array.isArray(response) ? response[0] : response
    if (!run?.id) return NextResponse.json({ run: null })
    const agents = await shortsSupabaseRequest<any[]>(`malik_shorts_creator_agents?select=*&id=eq.${run.agent_id}&limit=1`).catch(() => [])
    return NextResponse.json({ run, agent: agents[0] || null })
  }

  if (action === "finish") {
    const runId = safeText(input.runId, 80)
    if (!UUID.test(runId)) return NextResponse.json({ error: "INVALID_RUN_ID" }, { status: 400 })
    const allowed = new Set(["waiting_approval", "succeeded", "failed", "cancelled"])
    const status = safeText(input.status || "succeeded", 30)
    if (!allowed.has(status)) return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 })
    const patch: Record<string, unknown> = {
      status,
      output: input.output && typeof input.output === "object" && !Array.isArray(input.output) ? input.output : {},
      error: status === "failed" ? safeText(input.error, 4000) || "agent failed" : null,
      finished_at: status === "waiting_approval" ? null : new Date().toISOString(),
    }
    const draftId = safeText(input.draftId, 80)
    if (UUID.test(draftId)) patch.draft_id = draftId
    await shortsSupabaseRequest(`malik_shorts_creator_agent_runs?id=eq.${runId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
}
