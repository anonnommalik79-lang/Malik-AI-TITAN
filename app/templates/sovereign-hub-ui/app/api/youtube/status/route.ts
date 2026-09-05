import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig } from "@/lib/shorts/server"
import { getStoredYouTubeConnection } from "@/lib/shorts/youtube"

export const dynamic = "force-dynamic"

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ connected: false }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ connected: false, persistence: false })

  const account = await getStoredYouTubeConnection(user.id).catch(() => null)
  if (!account) return NextResponse.json({ connected: false, persistence: true })

  return NextResponse.json({
    connected: true,
    persistence: true,
    account: {
      channelId: account.provider_user_id,
      username: account.username,
      displayName: account.display_name,
      avatarUrl: account.avatar_url,
      scopes: account.granted_scopes || [],
      tokenExpiresAt: account.token_expires_at,
      metadata: account.metadata || {},
    },
  }, { headers: { "Cache-Control": "private, no-store" } })
}
