import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

const REASONS = new Set(["spam", "harassment", "violence", "sexual", "self_harm", "scam", "copyright", "misinformation", "other"])

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  let input: { shortId?: string; commentId?: string; reason?: string; details?: string }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const shortId = safeText(input.shortId, 80)
  const commentId = safeText(input.commentId, 80)
  const reason = safeText(input.reason, 40)
  const details = safeText(input.details, 1000)
  if ((!shortId && !commentId) || (shortId && !/^[0-9a-f-]{36}$/i.test(shortId)) || (commentId && !/^[0-9a-f-]{36}$/i.test(commentId)) || !REASONS.has(reason)) {
    return NextResponse.json({ error: "INVALID_REPORT" }, { status: 400 })
  }

  await shortsSupabaseRequest("malik_shorts_reports", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      reporter_key: user.id,
      post_id: shortId || null,
      comment_id: commentId || null,
      reason,
      details,
      status: "open",
    }),
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}
