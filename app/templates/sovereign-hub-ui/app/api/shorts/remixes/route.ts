import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

const TYPES = new Set(["remix", "duet", "stitch", "response", "template", "ai_variant"])
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ parents: [], children: [], persistence: false })
  const postId = safeText(request.nextUrl.searchParams.get("postId"), 80)
  if (!UUID.test(postId)) return NextResponse.json({ error: "INVALID_POST_ID" }, { status: 400 })
  const [parents, children] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_remixes?select=parent_post_id,child_post_id,remix_type,metadata,created_at,malik_shorts_posts!malik_shorts_remixes_parent_post_id_fkey(id,source,source_id,poster_url,caption,creator_key)&child_post_id=eq.${postId}&order=created_at.desc`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_remixes?select=parent_post_id,child_post_id,remix_type,metadata,created_at,malik_shorts_posts!malik_shorts_remixes_child_post_id_fkey(id,source,source_id,poster_url,caption,creator_key)&parent_post_id=eq.${postId}&order=created_at.desc`).catch(() => []),
  ])
  return NextResponse.json({ parents, children, persistence: true }, { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=60" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  let input: { parentPostId?: string; childPostId?: string; type?: string; metadata?: Record<string, unknown> }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const parentPostId = safeText(input.parentPostId, 80)
  const childPostId = safeText(input.childPostId, 80)
  const type = safeText(input.type || "remix", 30)
  if (!UUID.test(parentPostId) || !UUID.test(childPostId) || parentPostId === childPostId || !TYPES.has(type)) return NextResponse.json({ error: "INVALID_REMIX" }, { status: 400 })

  const [parentRows, childRows] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_posts?select=id,can_remix,status,visibility&status=eq.published&visibility=eq.public&id=eq.${parentPostId}&limit=1`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_posts?select=id,creator_key,status&id=eq.${childPostId}&creator_key=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []),
  ])
  if (!parentRows[0]) return NextResponse.json({ error: "PARENT_NOT_FOUND" }, { status: 404 })
  if (!parentRows[0].can_remix) return NextResponse.json({ error: "REMIX_NOT_ALLOWED" }, { status: 403 })
  if (!childRows[0]) return NextResponse.json({ error: "CHILD_NOT_OWNED" }, { status: 403 })

  const metadata: Record<string, unknown> = {}
  if (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)) {
    for (const [key, value] of Object.entries(input.metadata).slice(0, 20)) {
      const cleanKey = safeText(key, 50).replace(/[^A-Za-z0-9._-]/g, "")
      if (!cleanKey) continue
      if (typeof value === "string") metadata[cleanKey] = safeText(value, 500)
      else if (typeof value === "number" && Number.isFinite(value)) metadata[cleanKey] = value
      else if (typeof value === "boolean" || value === null) metadata[cleanKey] = value
    }
  }

  const rows = await shortsSupabaseRequest<any[]>("malik_shorts_remixes?on_conflict=parent_post_id,child_post_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ parent_post_id: parentPostId, child_post_id: childPostId, remix_type: type, metadata }),
  }).catch(() => [])
  return NextResponse.json({ ok: true, remix: rows[0] || null }, { status: 201 })
}
