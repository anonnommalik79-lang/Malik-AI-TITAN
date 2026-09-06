import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

/**
 * The authors this viewer follows.
 *
 * The rail lists them, and nothing returned that list: /profile gives a
 * followingCount and /library gives posts, so the sidebar had a number and no
 * names. Identity comes from WorkOS, exactly as it does everywhere else in
 * Shorts; malik_shorts_follows only records who follows whom.
 */
export async function GET(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })

  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 100, 24)

  const follows = await shortsSupabaseRequest<Array<{ following_key: string }>>(
    `malik_shorts_follows?select=following_key&follower_key=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=${limit}`,
  ).catch(() => [])

  const keys = follows.map((row) => String(row.following_key)).filter(Boolean)
  if (!keys.length) return NextResponse.json({ items: [] })

  const profiles = await shortsSupabaseRequest<any[]>(
    // PostgREST splits an `in.()` list on commas, so a key containing one would
    // silently become two filters. Shorts keys are `youtube:<id>` and WorkOS
    // ids, neither of which contains a comma, but the guard costs nothing and
    // the alternative is a query that fails in a way nobody would trace back.
    `malik_shorts_profiles?select=user_key,username,display_name,avatar_url,verified,follower_count&user_key=in.(${
      keys.filter((key) => !key.includes(",")).map((key) => `"${key}"`).join(",")
    })&limit=${limit}`,
  ).catch(() => [])

  const byKey = new Map(profiles.map((row) => [String(row.user_key), row]))

  return NextResponse.json({
    // Ordered by when the follow happened, not by whatever order the profile
    // table came back in, so the rail matches "recently followed".
    items: keys.map((key) => byKey.get(key)).filter(Boolean).map((row: any) => ({
      userKey: row.user_key,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarUrl: row.avatar_url || null,
      verified: Boolean(row.verified),
      followerCount: Number(row.follower_count || 0),
    })),
  }, { headers: { "Cache-Control": "private, no-store" } })
}
