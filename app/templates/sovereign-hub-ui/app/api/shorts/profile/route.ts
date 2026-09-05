import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

function profileShape(row: any) {
  return {
    userKey: String(row.user_key),
    username: String(row.username),
    displayName: String(row.display_name || row.username),
    avatarUrl: row.avatar_url || null,
    bio: String(row.bio || ""),
    verified: Boolean(row.verified),
    privateAccount: Boolean(row.private_account),
    followerCount: Number(row.follower_count || 0),
    followingCount: Number(row.following_count || 0),
    totalLikes: Number(row.total_likes || 0),
    postCount: Number(row.post_count || 0),
  }
}

export async function GET(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  const { user } = await getOptionalWorkOSAuth()
  const username = safeText(request.nextUrl.searchParams.get("username"), 32)
  const userKey = safeText(request.nextUrl.searchParams.get("userKey"), 180)
  const filter = username
    ? `username=eq.${encodeURIComponent(username)}`
    : userKey
      ? `user_key=eq.${encodeURIComponent(userKey)}`
      : user
        ? `user_key=eq.${encodeURIComponent(user.id)}`
        : ""
  if (!filter) return NextResponse.json({ error: "PROFILE_REQUIRED" }, { status: 400 })

  const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_profiles?select=*&${filter}&limit=1`).catch(() => [])
  const row = rows?.[0]
  if (!row) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  if (row.private_account && user?.id !== row.user_key) {
    const following = user ? await shortsSupabaseRequest<any[]>(`malik_shorts_follows?select=follower_key&follower_key=eq.${encodeURIComponent(user.id)}&following_key=eq.${encodeURIComponent(row.user_key)}&limit=1`).catch(() => []) : []
    if (!following.length) return NextResponse.json({ profile: profileShape(row), private: true, posts: [] })
  }

  const posts = await shortsSupabaseRequest<any[]>(
    `malik_shorts_feed_v1?select=*&creator_key=eq.${encodeURIComponent(row.user_key)}&order=published_at.desc.nullslast,created_at.desc&limit=60`,
  ).catch(() => [])
  const followRows = user && user.id !== row.user_key
    ? await shortsSupabaseRequest<any[]>(`malik_shorts_follows?select=follower_key&follower_key=eq.${encodeURIComponent(user.id)}&following_key=eq.${encodeURIComponent(row.user_key)}&limit=1`).catch(() => [])
    : []

  return NextResponse.json({
    profile: profileShape(row),
    viewer: { isSelf: user?.id === row.user_key, following: followRows.length > 0 },
    private: false,
    posts: posts.map((post) => ({
      id: post.id,
      source: post.source,
      sourceId: post.source_id,
      sourceUrl: post.source_url,
      mediaUrl: post.media_url,
      posterUrl: post.poster_url,
      caption: post.caption,
      hashtags: post.hashtags || [],
      durationSeconds: post.duration_seconds,
      publishedAt: post.published_at,
      metrics: {
        views: Number(post.views || 0), likes: Number(post.likes || 0), comments: Number(post.comments || 0),
        reposts: Number(post.reposts || 0), saves: Number(post.saves || 0), shares: Number(post.shares || 0),
      },
    })),
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function PATCH(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  let input: { username?: string; displayName?: string; bio?: string; avatarUrl?: string | null; privateAccount?: boolean }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (input.username !== undefined) {
    const username = safeText(input.username, 32)
    if (!/^[A-Za-z0-9._]{2,32}$/.test(username)) return NextResponse.json({ error: "INVALID_USERNAME" }, { status: 400 })
    patch.username = username
  }
  if (input.displayName !== undefined) {
    const display = safeText(input.displayName, 80)
    if (!display) return NextResponse.json({ error: "INVALID_DISPLAY_NAME" }, { status: 400 })
    patch.display_name = display
  }
  if (input.bio !== undefined) patch.bio = safeText(input.bio, 240)
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl ? safeText(input.avatarUrl, 1000) : null
  if (input.privateAccount !== undefined) patch.private_account = Boolean(input.privateAccount)
  if (!Object.keys(patch).length) return NextResponse.json({ error: "EMPTY_PATCH" }, { status: 400 })

  try {
    const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_profiles?user_key=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    })
    const row = rows?.[0]
    if (!row) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 })
    return NextResponse.json({ ok: true, profile: profileShape(row) })
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error)
    if (message.includes("23505") || message.toLowerCase().includes("duplicate")) return NextResponse.json({ error: "USERNAME_TAKEN" }, { status: 409 })
    console.error("[Malik Shorts] profile update failed", error)
    return NextResponse.json({ error: "PROFILE_UPDATE_FAILED" }, { status: 500 })
  }
}
