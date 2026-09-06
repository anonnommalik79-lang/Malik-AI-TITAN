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

/**
 * The answer when the database could not be reached.
 *
 * It used to return a `metrics` object - `{ likes: 1 }` after a like. But
 * `metrics` means absolute Malik-local counters everywhere else in this API,
 * and the client folds it in as such, so a post carrying 37 local likes on top
 * of 40,000 external ones fell to 40,001 the moment one RPC call failed. The
 * numbers were a delta wearing the name of an absolute.
 *
 * Deltas now travel under `metricDeltas`, and the two shapes never share a
 * field, so neither side can mistake one for the other. `persistence: false`
 * still marks the answer as unsaved. Viewer state is reported either way: the
 * heart should fill even when the write did not land.
 */
function optimisticResult(action: string) {
  const viewer: Record<string, boolean> = {}
  const metricDeltas: Record<string, number> = {}

  if (action === "like") { viewer.liked = true; metricDeltas.likes = 1 }
  if (action === "unlike") { viewer.liked = false; metricDeltas.likes = -1 }
  if (action === "save") { viewer.saved = true; metricDeltas.saves = 1 }
  if (action === "unsave") { viewer.saved = false; metricDeltas.saves = -1 }
  if (action === "repost") { viewer.reposted = true; metricDeltas.reposts = 1 }
  if (action === "unrepost") { viewer.reposted = false; metricDeltas.reposts = -1 }
  if (action === "share") metricDeltas.shares = 1
  if (action === "follow") viewer.following = true
  if (action === "unfollow") viewer.following = false

  return {
    ok: true,
    persistence: false,
    action,
    ...(Object.keys(viewer).length ? { viewer } : {}),
    ...(Object.keys(metricDeltas).length ? { metricDeltas } : {}),
  }
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })

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
  const positionMs = intOrNull(input.positionMs)
  const durationMs = intOrNull(input.durationMs)
  const fallback = optimisticResult(action)

  // Imported Shorts are still interactive when the optional social database is
  // not configured. The UI gets a real optimistic state instead of the old
  // “социальные действия включатся после подключения базы” dead-end.
  if (!getShortsSupabaseConfig()) return NextResponse.json(fallback)

  try {
    const endpoint = action === "view" ? "rpc/malik_shorts_record_view" : "rpc/malik_shorts_interact"
    const body = action === "view"
      ? {
          p_user_key: user.id,
          p_post_id: shortId,
          p_position_ms: positionMs,
          p_duration_ms: durationMs,
          p_session_id: sessionId,
          p_source: source,
        }
      : {
          p_user_key: user.id,
          p_post_id: shortId,
          p_action: action,
          p_position_ms: positionMs,
          p_duration_ms: durationMs,
          p_session_id: sessionId,
          p_source: source,
        }
    const rows = await shortsSupabaseRequest<any>(endpoint, { method: "POST", body: JSON.stringify(body) })
    const result = Array.isArray(rows) ? rows[0] : rows
    return NextResponse.json({ ok: true, persistence: true, ...(result || {}) })
  } catch (error) {
    // External videos may be visible even while materialisation or a migration is
    // temporarily unavailable. Their like/save/repost/follow controls should not
    // turn into an error toast just because the optional persistence layer missed
    // that item. Malik-native posts still report a backend failure normally.
    if (source === "youtube" || source === "tiktok") {
      console.warn("[Malik Shorts] external interaction fell back to optimistic mode", error)
      return NextResponse.json(fallback)
    }
    console.error("[Malik Shorts] interaction failed", error)
    return NextResponse.json({ error: "INTERACTION_FAILED" }, { status: 500 })
  }
}
