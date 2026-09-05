import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ captions: [], dubs: [], persistence: false })
  const postId = safeText(request.nextUrl.searchParams.get("postId"), 80)
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return NextResponse.json({ error: "INVALID_POST_ID" }, { status: 400 })
  const [captions, dubs] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_captions?select=*&post_id=eq.${postId}&order=language.asc,kind.asc`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_dubs?select=*&post_id=eq.${postId}&order=language.asc`).catch(() => []),
  ])
  return NextResponse.json({ captions, dubs, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  let input: { postId?: string; action?: string; language?: string; body?: string; kind?: string; voiceKey?: string }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const postId = safeText(input.postId, 80)
  const action = safeText(input.action, 30)
  const language = safeText(input.language, 16)
  if (!/^[0-9a-f-]{36}$/i.test(postId) || !language) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 })
  const owned = await shortsSupabaseRequest<any[]>(`malik_shorts_posts?select=id,creator_key&creator_key=eq.${encodeURIComponent(user.id)}&id=eq.${postId}&limit=1`).catch(() => [])
  if (!owned[0]) return NextResponse.json({ error: "POST_NOT_OWNED" }, { status: 403 })

  try {
    if (action === "save") {
      const kind = new Set(["caption", "translation", "dub_script"]).has(String(input.kind)) ? String(input.kind) : "caption"
      const body = safeText(input.body, 50000)
      const rows = await shortsSupabaseRequest<any[]>("malik_shorts_captions?on_conflict=post_id,language,kind", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ post_id: postId, language, kind, source: "creator", body, status: "ready", updated_at: new Date().toISOString() }),
      })
      return NextResponse.json({ ok: true, caption: rows?.[0] || null })
    }

    if (action === "generate" || action === "dub") {
      const assets = await shortsSupabaseRequest<any[]>(`malik_shorts_media_assets?select=id&post_id=eq.${postId}&kind=eq.video&order=created_at.desc&limit=1`).catch(() => [])
      if (!assets[0]?.id) return NextResponse.json({ error: "MEDIA_ASSET_REQUIRED" }, { status: 409 })
      const jobType = action === "generate" ? "caption" : "caption"
      const rows = await shortsSupabaseRequest<any[]>("malik_shorts_media_jobs", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ asset_id: assets[0].id, job_type: jobType, status: "queued", priority: 80, payload: { postId, language, mode: action, voiceKey: safeText(input.voiceKey, 120) || null } }),
      })
      return NextResponse.json({ ok: true, job: rows?.[0] || null, workerRequired: true }, { status: 202 })
    }

    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
  } catch (error) {
    console.error("[Malik Shorts] captions failed", error)
    return NextResponse.json({ error: "CAPTIONS_FAILED" }, { status: 500 })
  }
}
