import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig } from "@/lib/shorts/server"
import { getStoredTikTokConnection } from "@/lib/shorts/tiktok"

export const dynamic = "force-dynamic"

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ connected: false, authenticated: false }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ connected: false, authenticated: true, persistence: false })

  const connection = await getStoredTikTokConnection(user.id).catch(() => null)
  if (!connection) return NextResponse.json({ connected: false, authenticated: true, persistence: true })

  return NextResponse.json({
    connected: true,
    authenticated: true,
    persistence: true,
    account: {
      displayName: connection.display_name || connection.username || "TikTok",
      avatarUrl: connection.avatar_url || null,
      scopes: Array.isArray(connection.granted_scopes) ? connection.granted_scopes : [],
      metadata: connection.metadata || {},
      tokenExpiresAt: connection.token_expires_at || null,
    },
  }, { headers: { "Cache-Control": "private, no-store" } })
}
