import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

const EVENT_TYPES = new Set([
  "impression","start","view","pause","resume","25","50","75","complete","rewatch","skip",
  "like","unlike","comment","comment_reply","comment_like","save","unsave","repost","unrepost","share",
  "follow","unfollow","profile_view","topic_view","sound_view","search","search_click","not_interested",
  "report","block","mute","dm_share","live_join","live_leave","remix_open","remix_publish",
])

const LEARNING_EVENTS = new Set([
  "25","50","75","complete","rewatch","skip","like","comment","comment_reply","save","repost","share","follow","not_interested","report",
])

function boundedInt(value: unknown, max = 86_400_000) {
  const number = Math.floor(Number(value))
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.min(max, number))
}

function uuid(value: unknown) {
  const clean = safeText(value, 80)
  return /^[0-9a-f-]{36}$/i.test(clean) ? clean : null
}

function cleanMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(input).slice(0, 24)) {
    const safeKey = safeText(key, 60).replace(/[^A-Za-z0-9._-]/g, "")
    if (!safeKey) continue
    if (typeof raw === "string") output[safeKey] = safeText(raw, 500)
    else if (typeof raw === "number" && Number.isFinite(raw)) output[safeKey] = raw
    else if (typeof raw === "boolean" || raw === null) output[safeKey] = raw
  }
  return output
}

export async function POST(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ accepted: 0, persistence: false }, { status: 503 })

  let payload: any
  try { payload = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const rawEvents = Array.isArray(payload?.events) ? payload.events.slice(0, 50) : payload ? [payload] : []
  if (!rawEvents.length) return NextResponse.json({ error: "EVENTS_REQUIRED" }, { status: 400 })

  const { user } = await getOptionalWorkOSAuth()
  const anonymousKey = safeText(payload?.anonymousKey, 160) || null
  const defaultSession = safeText(payload?.sessionId, 160) || randomUUID()
  const defaultRequest = safeText(payload?.requestId, 160) || randomUUID()
  const deviceHint = safeText(request.headers.get("sec-ch-ua-mobile") === "?1" ? "mobile" : request.headers.get("user-agent"), 220)

  const rows = rawEvents.flatMap((event: any) => {
    const eventType = safeText(event?.eventType || event?.type, 40)
    if (!EVENT_TYPES.has(eventType)) return []
    return [{
      event_id: uuid(event?.eventId) || randomUUID(),
      user_key: user?.id || null,
      anonymous_key: user ? null : (safeText(event?.anonymousKey, 160) || anonymousKey),
      post_id: uuid(event?.postId),
      creator_key: safeText(event?.creatorKey, 180) || null,
      source: safeText(event?.source, 40) || null,
      event_type: eventType,
      position_ms: boundedInt(event?.positionMs),
      duration_ms: boundedInt(event?.durationMs),
      watch_ms: boundedInt(event?.watchMs),
      session_id: safeText(event?.sessionId, 160) || defaultSession,
      request_id: safeText(event?.requestId, 160) || defaultRequest,
      device_hint: safeText(event?.deviceHint, 220) || deviceHint,
      locale: safeText(event?.locale, 20) || null,
      region: safeText(event?.region, 12) || null,
      network_hint: safeText(event?.networkHint, 40) || null,
      metadata: cleanMetadata(event?.metadata),
    }]
  })

  if (!rows.length) return NextResponse.json({ error: "NO_VALID_EVENTS" }, { status: 400 })

  try {
    await shortsSupabaseRequest("malik_shorts_event_stream_v2?on_conflict=event_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    })

    if (user?.id) {
      const learning = rows
        .filter((row) => row.post_id && LEARNING_EVENTS.has(row.event_type))
        .slice(0, 20)
      await Promise.all(learning.map((row) => shortsSupabaseRequest("rpc/malik_shorts_apply_interest_signal", {
        method: "POST",
        body: JSON.stringify({ p_user_key: user.id, p_post_id: row.post_id, p_event_type: row.event_type }),
      }).catch(() => null)))
    }

    return NextResponse.json({ accepted: rows.length, sessionId: defaultSession, requestId: defaultRequest })
  } catch (error) {
    console.error("[Malik Shorts] event gateway failed", error)
    return NextResponse.json({ error: "EVENT_WRITE_FAILED" }, { status: 500 })
  }
}
