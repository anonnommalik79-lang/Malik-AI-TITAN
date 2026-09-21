import { NextResponse, type NextRequest } from "next/server"
import { exchangeCode, exchangeLongLived, fetchProfile, InstagramError } from "@/lib/instagram/client"
import { seal, validState, writeConnection } from "@/lib/instagram/store"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATE_COOKIE = "malik_instagram_state"
const RETURN_COOKIE = "malik_instagram_return"

function back(request: NextRequest, path: string, params: Record<string, string>) {
  const url = new URL(path, request.nextUrl.origin)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = NextResponse.redirect(url)
  response.cookies.delete(STATE_COOKIE)
  response.cookies.delete(RETURN_COOKIE)
  response.headers.set("cache-control", "no-store")
  return response
}

/**
 * The return trip from Instagram.
 *
 * The code is exchanged for a one-hour token, immediately traded up for a
 * sixty-day one, sealed against this account and written down. The short-lived
 * token is never stored: it would expire while the person was still reading
 * the page that told them it worked.
 */
export async function GET(request: NextRequest) {
  const returnPath = request.cookies.get(RETURN_COOKIE)?.value || "/dashboard"

  try {
    const entitlement = await resolveRequestEntitlement(request)
    if (!entitlement.authenticated) return back(request, "/dashboard", { instagram: "error", reason: "auth" })

    const denied = request.nextUrl.searchParams.get("error")
    if (denied) {
      // The person pressed Cancel inside Instagram. That is an answer, not a
      // failure, and it should not look like one.
      return back(request, returnPath, { instagram: "cancelled" })
    }

    const code = request.nextUrl.searchParams.get("code") || ""
    const state = request.nextUrl.searchParams.get("state") || ""
    const expected = request.cookies.get(STATE_COOKIE)?.value || ""
    if (!code || !state || !expected || !validState(state, expected)) {
      return back(request, returnPath, { instagram: "error", reason: "state" })
    }

    const short = await exchangeCode(code)
    const long = await exchangeLongLived(short.accessToken)
    const profile = await fetchProfile(long.accessToken)

    await writeConnection(entitlement.userId, {
      accountId: profile.id,
      username: profile.username,
      accountType: profile.accountType,
      token: seal(long.accessToken, entitlement.userId),
      expiresAt: long.expiresAt,
      connectedAt: Date.now(),
    })

    return back(request, returnPath, { instagram: "connected", account: profile.username })
  } catch (error) {
    const reason = error instanceof InstagramError ? error.code : "unknown"
    console.warn("[MALIK_INSTAGRAM_CALLBACK]", error instanceof Error ? error.message : String(error))
    return back(request, returnPath, { instagram: "error", reason })
  }
}
