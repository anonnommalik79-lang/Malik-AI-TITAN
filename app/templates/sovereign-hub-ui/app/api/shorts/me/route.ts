import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

function buildUsername(email: string, userId: string) {
  const local = email.split("@")[0]?.replace(/[^a-zA-Z0-9._]/g, "").slice(0, 20) || "malik"
  const suffix = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-7).toLowerCase() || "user"
  return `${local}.${suffix}`.slice(0, 32)
}

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 })

  const email = String(user.email || "").trim().toLowerCase()
  const displayName = String(user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || email.split("@")[0] || "Malik user").trim()
  const avatarUrl = String(user.profilePictureUrl || "").trim() || null

  if (!getShortsSupabaseConfig()) {
    return NextResponse.json({
      authenticated: true,
      persistence: false,
      profile: {
        userKey: user.id,
        username: buildUsername(email, user.id),
        displayName,
        avatarUrl,
        bio: "",
        verified: false,
        followerCount: 0,
        followingCount: 0,
        totalLikes: 0,
        postCount: 0,
      },
    })
  }

  const payload = {
    user_key: user.id,
    username: buildUsername(email, user.id),
    display_name: displayName,
    avatar_url: avatarUrl,
    locale: "ru",
    region: "KZ",
  }

  const rows = await shortsSupabaseRequest<any[]>("malik_shorts_profiles?on_conflict=user_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  })
  const profile = rows?.[0]

  return NextResponse.json({
    authenticated: true,
    persistence: true,
    profile: profile ? {
      userKey: profile.user_key,
      username: profile.username,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      verified: Boolean(profile.verified),
      followerCount: Number(profile.follower_count || 0),
      followingCount: Number(profile.following_count || 0),
      totalLikes: Number(profile.total_likes || 0),
      postCount: Number(profile.post_count || 0),
    } : null,
  })
}
