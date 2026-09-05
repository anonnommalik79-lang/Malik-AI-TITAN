import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getYouTubeOAuthConfig } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

const STATE_COOKIE = "malik_youtube_oauth_state"
const APP_ORIGIN = "https://malikaiworld.world"

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.redirect(new URL("/sign-in?returnTo=/api/youtube/connect", APP_ORIGIN))

  const config = getYouTubeOAuthConfig()
  if (!config) return NextResponse.redirect(new URL("/shorts?error=youtube-not-configured", APP_ORIGIN))

  const state = randomBytes(32).toString("base64url")
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authorize.searchParams.set("client_id", config.clientId)
  authorize.searchParams.set("redirect_uri", config.redirectUri)
  authorize.searchParams.set("response_type", "code")
  authorize.searchParams.set("access_type", "offline")
  authorize.searchParams.set("include_granted_scopes", "true")
  authorize.searchParams.set("prompt", "consent")
  authorize.searchParams.set("state", state)
  authorize.searchParams.set("scope", [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/youtube.force-ssl",
  ].join(" "))

  const response = NextResponse.redirect(authorize)
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/youtube",
    maxAge: 10 * 60,
  })
  return response
}
