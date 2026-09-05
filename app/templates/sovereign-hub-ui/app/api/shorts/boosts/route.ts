import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

const OBJECTIVES = new Set(["views", "engagement", "followers", "profile_visits"])

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })
  const items = await shortsSupabaseRequest<any[]>(`malik_shorts_boosts?select=*&creator_key=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=200`).catch(() => [])
  return NextResponse.json({ items, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  let input: { postId?: string; objective?: string; regions?: string[]; languages?: string[]; interests?: string[]; budgetCredits?: number; startsAt?: string; endsAt?: string }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }

  const postId = safeText(input.postId, 80)
  const objective = safeText(input.objective, 40)
  const budgetCredits = clampInt(input.budgetCredits, 1, 1_000_000_000, 0)
  if (!/^[0-9a-f-]{36}$/i.test(postId) || !OBJECTIVES.has(objective) || budgetCredits < 1) return NextResponse.json({ error: "INVALID_BOOST" }, { status: 400 })

  const owned = await shortsSupabaseRequest<any[]>(`malik_shorts_posts?select=id,creator_key,status&creator_key=eq.${encodeURIComponent(user.id)}&id=eq.${postId}&status=eq.published&limit=1`).catch(() => [])
  if (!owned[0]) return NextResponse.json({ error: "POST_NOT_OWNED" }, { status: 403 })

  const cleanList = (values: unknown, max: number, itemMax: number) => Array.isArray(values) ? Array.from(new Set(values.map((value) => safeText(value, itemMax)).filter(Boolean))).slice(0, max) : []
  const startsAt = input.startsAt && Number.isFinite(Date.parse(input.startsAt)) ? new Date(input.startsAt).toISOString() : null
  const endsAt = input.endsAt && Number.isFinite(Date.parse(input.endsAt)) ? new Date(input.endsAt).toISOString() : null
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return NextResponse.json({ error: "INVALID_WINDOW" }, { status: 400 })

  try {
    const rows = await shortsSupabaseRequest<any[]>("malik_shorts_boosts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        post_id: postId,
        creator_key: user.id,
        objective,
        regions: cleanList(input.regions, 20, 12),
        languages: cleanList(input.languages, 20, 16),
        interests: cleanList(input.interests, 100, 80),
        budget_credits: budgetCredits,
        status: "review",
        starts_at: startsAt,
        ends_at: endsAt,
      }),
    })
    return NextResponse.json({ ok: true, campaign: rows?.[0] || null, deliveryActive: false, note: "Campaign is created for review. Delivery activates only after wallet/billing and ad-review systems approve it." }, { status: 201 })
  } catch (error) {
    console.error("[Malik Shorts] boost create failed", error)
    return NextResponse.json({ error: "BOOST_CREATE_FAILED" }, { status: 500 })
  }
}
