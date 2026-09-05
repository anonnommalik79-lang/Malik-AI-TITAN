import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"
import { exchangeTikTokCode, fetchTikTokUser, fetchTikTokVideos, materializeTikTokVideos, storeTikTokConnection } from "@/lib/shorts/tiktok"

export const dynamic = "force-dynamic"

const STATE_COOKIE = "malik_tiktok_oauth_state"
const APP_ORIGIN = "https://malikaiworld.world"

function shortsRedirect(params: Record<string, string>) {
  const url = new URL("/shorts", APP_ORIGIN)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}

function generatedUsername(email: string, id: string) {
  const local = email.split("@")[0]?.replace(/[^A-Za-z0-9._]/g, "").slice(0, 20) || "malik"
  const suffix = id.replace(/[^A-Za-z0-9]/g, "").slice(-7).toLowerCase() || "user"
  return `${local}.${suffix}`.slice(0, 32)
}

export async function GET(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.redirect(shortsRedirect({ error: "auth-required" }))

  const providerError = String(request.nextUrl.searchParams.get("error") || "").slice(0, 80)
  const code = String(request.nextUrl.searchParams.get("code") || "")
  const state = String(request.nextUrl.searchParams.get("state") || "")
  const cookieState = request.cookies.get(STATE_COOKIE)?.value || ""

  if (providerError) {
    const response = NextResponse.redirect(shortsRedirect({ error: `tiktok-${providerError}` }))
    response.cookies.delete(STATE_COOKIE)
    return response
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    const response = NextResponse.redirect(shortsRedirect({ error: "tiktok-state" }))
    response.cookies.delete(STATE_COOKIE)
    return response
  }
  if (!getShortsSupabaseConfig()) {
    const response = NextResponse.redirect(shortsRedirect({ error: "shorts-db-not-configured" }))
    response.cookies.delete(STATE_COOKIE)
    return response
  }

  try {
    const email = String(user.email || "").trim().toLowerCase()
    const displayName = String(user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || email.split("@")[0] || "Malik user").trim()

    await shortsSupabaseRequest("malik_shorts_profiles?on_conflict=user_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_key: user.id,
        username: generatedUsername(email, user.id),
        display_name: displayName,
        avatar_url: user.profilePictureUrl || null,
        locale: "ru",
        region: "KZ",
      }),
    })

    const token = await exchangeTikTokCode(code)
    const [tiktokUser, videoPage] = await Promise.all([
      fetchTikTokUser(token.access_token),
      fetchTikTokVideos(token.access_token, 20),
    ])

    await storeTikTokConnection({ userKey: user.id, token, user: tiktokUser })
    await materializeTikTokVideos(user.id, videoPage.videos)

    const response = NextResponse.redirect(shortsRedirect({ connected: "tiktok", imported: String(videoPage.videos.length) }))
    response.cookies.delete(STATE_COOKIE)
    return response
  } catch (error) {
    console.error("[Malik Shorts] TikTok callback failed", error)
    const response = NextResponse.redirect(shortsRedirect({ error: "tiktok-connect-failed" }))
    response.cookies.delete(STATE_COOKIE)
    return response
  }
}
