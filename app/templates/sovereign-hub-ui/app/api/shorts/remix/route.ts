import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ parents: [], children: [], persistence: false })
  const postId = safeText(request.nextUrl.searchParams.get("postId"), 80)
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return NextResponse.json({ error: "INVALID_POST_ID" }, { status: 400 })
  const [parents, children] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_remixes?select=parent_post_id,child_post_id,remix_type,metadata,created_at,malik_shorts_posts!malik_shorts_remixes_parent_post_id_fkey(id,creator_key,caption,source,source_id,poster_url,published_at)&child_post_id=eq.${postId}`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_remixes?select=parent_post_id,child_post_id,remix_type,metadata,created_at,malik_shorts_posts!malik_shorts_remixes_child_post_id_fkey(id,creator_key,caption,source,source_id,poster_url,published_at)&parent_post_id=eq.${postId}&order=created_at.desc&limit=200`).catch(() => []),
  ])
  return NextResponse.json({ parents, children, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  let input: { parentPostId?: string; childPostId?: string; remixType?: string; metadata?: Record<string, unknown> }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const parentPostId = safeText(input.parentPostId, 80)
  const childPostId = safeText(input.childPostId, 80)
  const remixType = safeText(input.remixType, 30)
  if (!/^[0-9a-f-]{36}$/i.test(parentPostId) || !/^[0-9a-f-]{36}$/i.test(childPostId) || parentPostId === childPostId) return NextResponse.json({ error: "INVALID_REMIX_LINK" }, { status: 400 })
  if (!new Set(["remix","duet","stitch","response","template","ai_variant"]).has(remixType)) return NextResponse.json({ error: "INVALID_REMIX_TYPE" }, { status: 400 })

  const child = await shortsSupabaseRequest<any[]>(`malik_shorts_posts?select=id,creator_key&creator_key=eq.${encodeURIComponent(user.id)}&id=eq.${childPostId}&limit=1`).catch(() => [])
  if (!child[0]) return NextResponse.json({ error: "CHILD_NOT_OWNED" }, { status: 403 })
  const parent = await shortsSupabaseRequest<any[]>(`malik_shorts_posts?select=id,can_remix,status&id=eq.${parentPostId}&limit=1`).catch(() => [])
  if (!parent[0] || parent[0].status !== "published" || !parent[0].can_remix) return NextResponse.json({ error: "PARENT_NOT_REMIXABLE" }, { status: 409 })

  await shortsSupabaseRequest("malik_shorts_remixes?on_conflict=parent_post_id,child_post_id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ parent_post_id: parentPostId, child_post_id: childPostId, remix_type: remixType, metadata: input.metadata || {} }),
  })
  return NextResponse.json({ ok: true, parentPostId, childPostId, remixType }, { status: 201 })
}
