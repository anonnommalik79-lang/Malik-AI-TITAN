import { NextRequest, NextResponse } from "next/server"
import { identity, failure } from "@/lib/youtube/http"
import { oauthConfig, tokenRequest, type Resource } from "@/lib/youtube/client"
import { validState, hash, seal, unseal, SCOPE } from "@/lib/youtube/security"
import { db, connection, ownerFilter } from "@/lib/youtube/store"
import { shortsPath } from "@/lib/youtube/contracts"
import { mapChannel } from "@/lib/youtube/resources"
import { YouTubeError } from "@/lib/youtube/errors"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) {
  try {
    const user = await identity(), config = oauthConfig()
    const state = request.nextUrl.searchParams.get("state") || ""
    if (!validState(state, request.cookies.get("malik_youtube_state")?.value || "")) throw new YouTubeError("CSRF", 403)
    // Atomic consumption protects against replay across processes.
    const rows = await db<Array<{ verifier_encrypted: string; return_path: string }>>(`youtube_oauth_states?state_hash=eq.${hash(state)}&workos_user_id=eq.${encodeURIComponent(user)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`, { method: "DELETE", headers: { Prefer: "return=representation" } })
    if (!rows[0]) throw new YouTubeError("CSRF", 403)
    if (request.nextUrl.searchParams.has("error")) {
      const destination = new URL(shortsPath(rows[0].return_path), config.origin)
      destination.searchParams.set("youtube", "consent_denied")
      const response = NextResponse.redirect(destination)
      response.cookies.set("malik_youtube_state", "", { path: "/api/youtube", maxAge: 0, httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax" })
      response.headers.set("Referrer-Policy", "no-referrer"); response.headers.set("Cache-Control", "no-store")
      return response
    }
    const code = request.nextUrl.searchParams.get("code")
    if (!code || code.length > 4096) throw new YouTubeError("INVALID_INPUT", 400)
    const token = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri, code_verifier: unseal(rows[0].verifier_encrypted, user) })
    const scopes = (token.scope || "").split(" ")
    if (!scopes.includes(SCOPE) || !token.refresh_token) throw new YouTubeError("insufficientPermissions", 403)
    const response = await fetch("https://www.googleapis.com/youtube/v3/channels?mine=true&part=snippet,contentDetails,statistics&maxResults=50", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new YouTubeError("API_UNAVAILABLE", 502)
    const result = await response.json() as { items?: Resource[] }
    const channels = (result.items || []).map(mapChannel)
    const previous = await connection(user)
    const selected = channels.length === 1 ? channels[0].id : null
    if (previous && previous.channel_id !== selected) await db(`shorts_history?${ownerFilter(user)}`, { method: "DELETE" })
    await db("youtube_connections?on_conflict=workos_user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ workos_user_id: user, access_encrypted: seal(token.access_token, user), refresh_encrypted: seal(token.refresh_token, user), expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), scopes, channels, channel_id: selected, saved_playlist_checked: false, saved_playlist_id: previous?.channel_id === selected ? previous?.saved_playlist_id || null : null, updated_at: new Date().toISOString() }) })
    const redirect = NextResponse.redirect(new URL(shortsPath(rows[0].return_path), config.origin))
    redirect.cookies.set("malik_youtube_state", "", { path: "/api/youtube", maxAge: 0, httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax" })
    redirect.headers.set("Referrer-Policy", "no-referrer"); redirect.headers.set("Cache-Control", "no-store")
    return redirect
  } catch (error) { return failure(error) }
}
