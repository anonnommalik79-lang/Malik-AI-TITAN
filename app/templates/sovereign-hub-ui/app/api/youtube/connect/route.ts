import { NextRequest, NextResponse } from "next/server"
import { identity, failure } from "@/lib/youtube/http"
import { oauthConfig } from "@/lib/youtube/client"
import { nonce, hash, seal, SCOPE } from "@/lib/youtube/security"
import { db } from "@/lib/youtube/store"
import { shortsPath } from "@/lib/youtube/contracts"
import { limit } from "@/lib/youtube/quota"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) {
  try {
    const user = await identity()
    await limit(user, "connect")
    const config = oauthConfig(), state = nonce(), verifier = nonce()
    await db("youtube_oauth_states?expires_at=lt." + encodeURIComponent(new Date().toISOString()), { method: "DELETE" })
    await db("youtube_oauth_states", { method: "POST", body: JSON.stringify({ state_hash: hash(state), workos_user_id: user, verifier_encrypted: seal(verifier, user), return_path: shortsPath(request.nextUrl.searchParams.get("returnTo")), expires_at: new Date(Date.now() + 600000).toISOString() }) })
    const query = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", state, code_challenge: hash(verifier), code_challenge_method: "S256" })
    const response = NextResponse.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + query)
    response.cookies.set("malik_youtube_state", state, { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/api/youtube", maxAge: 600 })
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer")
    return response
  } catch (error) { return failure(error) }
}
