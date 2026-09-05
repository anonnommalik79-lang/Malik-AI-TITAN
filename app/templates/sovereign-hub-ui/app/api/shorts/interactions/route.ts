import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import type { MalikShortInteractionPayload } from "@/lib/shorts/types"

export const dynamic = "force-dynamic"

const ALLOWED = new Set([
  "view", "like", "unlike", "save", "unsave", "repost", "unrepost", "share",
  "follow", "unfollow", "complete", "rewatch", "profile_view", "not_interested",
])

function intOrNull(value: unknown) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number >= 0 ? Math.min(number, 86_400_000) : null
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  let input: MalikShortInteractionPayload & { sessionId?: string }
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const shortId = safeText(input.shortId, 80)
  const action = safeText(input.action, 40)
  if (!/^[0-9a-f-]{36}$/i.test(shortId) || !ALLOWED.has(action)) {
    return NextResponse.json({ error: "INVALID_INTERACTION" }, { status: 400 })
  }

  const source = input.source && ["malik", "youtube", "tiktok"].includes(input.source) ? input.source : null
  const sessionId = safeText(input.sessionId, 120) || null

  try {
    const rows = await shortsSupabaseRequest<any[]>("rpc/malik_shorts_interact", {
      method: "POST",
      body: JSON.stringify({
        p_user_key: user.id,
        p_post_id: shortId,
        p_action: action,
        p_position_ms: intOrNull(input.positionMs),
        p_duration_ms: intOrNull(input.durationMs),
        p_session_id: sessionId,
        p_source: source,
      }),
    })
    const result = Array.isArray(rows) ? rows[0] : rows
    return NextResponse.json({ ok: true, ...(result || {}) })
  } catch (error) {
    console.error("[Malik Shorts] interaction failed", error)
    return NextResponse.json({ error: "INTERACTION_FAILED" }, { status: 500 })
  }
}
