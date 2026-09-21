import { NextResponse, type NextRequest } from "next/server"
import { authorizeUrl, instagramConfig, InstagramError } from "@/lib/instagram/client"
import { nonce } from "@/lib/instagram/store"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATE_COOKIE = "malik_instagram_state"
const RETURN_COOKIE = "malik_instagram_return"

/** Only ever back into this app, and never into another route's query string. */
function safeReturnPath(value: string | null) {
  const path = String(value || "/dashboard")
  return /^\/[A-Za-z0-9/_-]{0,120}$/.test(path) ? path : "/dashboard"
}

/**
 * Hands the person to Instagram's own authorisation window.
 *
 * Nothing about their account is asked for here and nothing is typed into
 * Malik AI: they approve inside Instagram, and Instagram sends back a code.
 * The random state travels in an httpOnly cookie and is compared on the way
 * back, so a callback that did not start here is refused.
 */
export async function GET(request: NextRequest) {
  try {
    const entitlement = await resolveRequestEntitlement(request)
    if (!entitlement.authenticated) {
      return NextResponse.json(
        { ok: false, error: "Войдите в аккаунт, чтобы подключить Instagram." },
        { status: 401, headers: { "cache-control": "no-store" } },
      )
    }

    const config = instagramConfig()
    const state = nonce()
    const response = NextResponse.redirect(authorizeUrl(state))

    const cookieOptions = {
      httpOnly: true,
      secure: config.redirectUri.startsWith("https:"),
      sameSite: "lax" as const,
      path: "/api/instagram",
      maxAge: 600,
    }
    response.cookies.set(STATE_COOKIE, state, cookieOptions)
    response.cookies.set(RETURN_COOKIE, safeReturnPath(request.nextUrl.searchParams.get("returnTo")), cookieOptions)
    response.headers.set("cache-control", "no-store")
    response.headers.set("referrer-policy", "no-referrer")
    return response
  } catch (error) {
    if (error instanceof InstagramError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status, headers: { "cache-control": "no-store" } })
    }
    return NextResponse.json({ ok: false, error: "Не удалось начать подключение Instagram." }, { status: 503, headers: { "cache-control": "no-store" } })
  }
}
