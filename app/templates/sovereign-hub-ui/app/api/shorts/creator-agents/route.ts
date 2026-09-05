import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], runs: [], persistence: false })
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 100, 30)
  const agents = await shortsSupabaseRequest<any[]>(`malik_shorts_creator_agents?select=*&creator_key=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=${limit}`).catch(() => [])
  const ids = agents.map((agent) => String(agent.id)).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  const runs = ids.length ? await shortsSupabaseRequest<any[]>(`malik_shorts_creator_agent_runs?select=id,agent_id,status,input,output,draft_id,error,created_at,started_at,finished_at&agent_id=in.(${ids.join(",")})&order=created_at.desc&limit=100`).catch(() => []) : []
  return NextResponse.json({ items: agents, runs, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  let input: { action?: string; agentId?: string; name?: string; instructions?: string; languages?: string[]; cadence?: string; publishPolicy?: string; enabled?: boolean; sourcePolicy?: Record<string, unknown>; settings?: Record<string, unknown>; runInput?: Record<string, unknown> }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const action = safeText(input.action, 30)

  try {
    if (action === "create") {
      const name = safeText(input.name, 80)
      const instructions = safeText(input.instructions, 8000)
      if (!name || !instructions) return NextResponse.json({ error: "NAME_AND_INSTRUCTIONS_REQUIRED" }, { status: 400 })
      const publishPolicy = new Set(["draft_only", "approval_required", "auto_publish"]).has(String(input.publishPolicy)) ? String(input.publishPolicy) : "draft_only"
      const languages = Array.from(new Set((Array.isArray(input.languages) ? input.languages : ["ru", "kk", "en"]).map((value) => safeText(value, 12)).filter(Boolean))).slice(0, 12)
      const rows = await shortsSupabaseRequest<any[]>("malik_shorts_creator_agents", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ creator_key: user.id, name, instructions, languages, cadence: safeText(input.cadence, 120) || null, publish_policy: publishPolicy, enabled: Boolean(input.enabled), source_policy: input.sourcePolicy || {}, settings: input.settings || {} }),
      })
      return NextResponse.json({ ok: true, agent: rows?.[0] || null }, { status: 201 })
    }

    const agentId = safeText(input.agentId, 80)
    if (!/^[0-9a-f-]{36}$/i.test(agentId)) return NextResponse.json({ error: "INVALID_AGENT_ID" }, { status: 400 })
    const owned = await shortsSupabaseRequest<any[]>(`malik_shorts_creator_agents?select=id,enabled,publish_policy&creator_key=eq.${encodeURIComponent(user.id)}&id=eq.${agentId}&limit=1`).catch(() => [])
    if (!owned[0]) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

    if (action === "run") {
      const rows = await shortsSupabaseRequest<any[]>("malik_shorts_creator_agent_runs", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ agent_id: agentId, status: "queued", input: input.runInput || {} }),
      })
      return NextResponse.json({ ok: true, run: rows?.[0] || null, workerRequired: true, note: "Queued for the Malik creator-agent worker; no browser-side secret or direct auto-publish is used." }, { status: 202 })
    }

    if (action === "toggle") {
      const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_creator_agents?id=eq.${agentId}&creator_key=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ enabled: Boolean(input.enabled), updated_at: new Date().toISOString() }),
      })
      return NextResponse.json({ ok: true, agent: rows?.[0] || null })
    }

    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
  } catch (error) {
    console.error("[Malik Shorts] creator agent action failed", error)
    return NextResponse.json({ error: "CREATOR_AGENT_FAILED" }, { status: 500 })
  }
}
