import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"
import {
  exchangeYouTubeCode,
  fetchMyYouTubeChannel,
  fetchYouTubeUploads,
  getStoredYouTubeConnection,
  materializeYouTubeCreatorVideos,
  storeYouTubeConnection,
} from "@/lib/shorts/youtube"
import { decryptShortsToken } from "@/lib/shorts/token-vault"

export const dynamic = "force-dynamic"

const STATE_COOKIE = "malik_youtube_oauth_state"
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
    const response = NextResponse.redirect(shortsRedirect({ error: `youtube-${providerError}` }))
    response.cookies.delete(STATE_COOKIE)
    return response
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    const response = NextResponse.redirect(shortsRedirect({ error: "youtube-state" }))
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

    const previous = await getStoredYouTubeConnection(user.id).catch(() => null)
    let previousRefreshToken = ""
    if (previous?.refresh_token_encrypted) {
      try { previousRefreshToken = decryptShortsToken(previous.refresh_token_encrypted) } catch {}
    }

    const token = await exchangeYouTubeCode(code)
    const channel = await fetchMyYouTubeChannel(token.access_token)
    const videos = await fetchYouTubeUploads(token.access_token, channel, 200)
    await storeYouTubeConnection({ userKey: user.id, token, channel, previousRefreshToken })
    await materializeYouTubeCreatorVideos(user.id, videos)

    const response = NextResponse.redirect(shortsRedirect({ connected: "youtube", imported: String(videos.length) }))
    response.cookies.delete(STATE_COOKIE)
    return response
  } catch (error) {
    console.error("[Malik Shorts] YouTube callback failed", error)
    const response = NextResponse.redirect(shortsRedirect({ error: "youtube-connect-failed" }))
    response.cookies.delete(STATE_COOKIE)
    return response
  }
}
