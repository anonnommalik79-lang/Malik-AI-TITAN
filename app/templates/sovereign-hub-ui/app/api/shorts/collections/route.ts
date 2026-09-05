import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })
  const collectionId = safeText(request.nextUrl.searchParams.get("collectionId"), 80)
  if (collectionId && !UUID.test(collectionId)) return NextResponse.json({ error: "INVALID_COLLECTION_ID" }, { status: 400 })

  const collections = await shortsSupabaseRequest<any[]>(
    `malik_shorts_collections?select=*&user_key=eq.${encodeURIComponent(user.id)}${collectionId ? `&id=eq.${collectionId}` : ""}&order=created_at.desc&limit=100`,
  ).catch(() => [])
  const ids = collections.map((row) => String(row.id)).filter((id) => UUID.test(id))
  const links = ids.length ? await shortsSupabaseRequest<any[]>(`malik_shorts_collection_items?select=collection_id,post_id,created_at&collection_id=in.(${ids.join(",")})&order=created_at.desc&limit=1000`).catch(() => []) : []
  const postIds = Array.from(new Set(links.map((row) => String(row.post_id)).filter((id) => UUID.test(id))))
  const posts = postIds.length ? await shortsSupabaseRequest<any[]>(`malik_shorts_feed_v1?select=*&id=in.(${postIds.join(",")})&limit=500`).catch(() => []) : []
  const byId = new Map(posts.map((post) => [String(post.id), post]))

  return NextResponse.json({
    items: collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      private: Boolean(collection.private),
      createdAt: collection.created_at,
      posts: links.filter((link) => String(link.collection_id) === String(collection.id)).map((link) => byId.get(String(link.post_id))).filter(Boolean).map((post: any) => ({ id: post.id, source: post.source, sourceId: post.source_id, posterUrl: post.poster_url, caption: post.caption, creator: { username: post.username, displayName: post.display_name, avatarUrl: post.avatar_url }, metrics: { views: Number(post.views || 0), likes: Number(post.likes || 0) } })),
    })),
    persistence: true,
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  let input: { action?: string; collectionId?: string; postId?: string; name?: string; private?: boolean }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const action = safeText(input.action, 20)
  const collectionId = safeText(input.collectionId, 80)
  const postId = safeText(input.postId, 80)

  if (action === "create") {
    const name = safeText(input.name, 80)
    if (!name) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 })
    const rows = await shortsSupabaseRequest<any[]>("malik_shorts_collections", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_key: user.id, name, private: input.private !== false }) }).catch(() => [])
    return NextResponse.json({ ok: true, collection: rows[0] || null }, { status: 201 })
  }

  if (!UUID.test(collectionId)) return NextResponse.json({ error: "INVALID_COLLECTION_ID" }, { status: 400 })
  const owned = await shortsSupabaseRequest<any[]>(`malik_shorts_collections?select=id&user_key=eq.${encodeURIComponent(user.id)}&id=eq.${collectionId}&limit=1`).catch(() => [])
  if (!owned[0]) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

  if (action === "delete") {
    await shortsSupabaseRequest(`malik_shorts_collections?id=eq.${collectionId}&user_key=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" })
    return NextResponse.json({ ok: true })
  }
  if (action === "rename") {
    const name = safeText(input.name, 80)
    if (!name) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 })
    await shortsSupabaseRequest(`malik_shorts_collections?id=eq.${collectionId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ name, private: input.private !== false }) })
    return NextResponse.json({ ok: true })
  }
  if (action === "add" || action === "remove") {
    if (!UUID.test(postId)) return NextResponse.json({ error: "INVALID_POST_ID" }, { status: 400 })
    if (action === "add") await shortsSupabaseRequest("malik_shorts_collection_items?on_conflict=collection_id,post_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ collection_id: collectionId, post_id: postId }) })
    else await shortsSupabaseRequest(`malik_shorts_collection_items?collection_id=eq.${collectionId}&post_id=eq.${postId}`, { method: "DELETE" })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
}
