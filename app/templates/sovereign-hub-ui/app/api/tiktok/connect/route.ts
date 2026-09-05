import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getTikTokShortsConfig } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

const STATE_COOKIE = "malik_tiktok_oauth_state"

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in?returnTo=/api/tiktok/connect", "https://malikaiworld.world"))
  }
  const config = getTikTokShortsConfig()
  if (!config) return NextResponse.redirect(new URL("/shorts?error=tiktok-not-configured", "https://malikaiworld.world"))

  const state = randomBytes(32).toString("base64url")
  const authorize = new URL("https://www.tiktok.com/v2/auth/authorize/")
  authorize.searchParams.set("client_key", config.clientKey)
  authorize.searchParams.set("scope", "user.info.basic,user.info.profile,user.info.stats,video.list")
  authorize.searchParams.set("response_type", "code")
  authorize.searchParams.set("redirect_uri", config.redirectUri)
  authorize.searchParams.set("state", state)

  const response = NextResponse.redirect(authorize)
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/tiktok",
    maxAge: 10 * 60,
  })
  return response
}
