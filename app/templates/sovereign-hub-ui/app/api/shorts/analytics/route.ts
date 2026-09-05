import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  const shortId = safeText(request.nextUrl.searchParams.get("shortId"), 80)
  if (!/^[0-9a-f-]{36}$/i.test(shortId)) return NextResponse.json({ error: "INVALID_SHORT_ID" }, { status: 400 })

  const postRows = await shortsSupabaseRequest<any[]>(
    `malik_shorts_posts?select=id,creator_key,caption,source,published_at,created_at&creator_key=eq.${encodeURIComponent(user.id)}&id=eq.${shortId}&limit=1`,
  ).catch(() => [])
  const post = postRows?.[0]
  if (!post) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

  const [counterRows, events] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_counters?select=*&post_id=eq.${shortId}&limit=1`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_events?select=user_key,event_type,position_ms,duration_ms,created_at&post_id=eq.${shortId}&order=created_at.desc&limit=5000`).catch(() => []),
  ])
  const counters = counterRows?.[0] || {}
  const uniqueViewers = new Set(events.filter((event) => event.event_type === "view" && event.user_key).map((event) => String(event.user_key))).size
  const views = Number(counters.views || 0)
  const completes = Number(counters.completes || 0)
  const rewatches = Number(counters.rewatches || 0)
  const totalWatchMs = Number(counters.total_watch_ms || 0)
  const follows = events.filter((event) => event.event_type === "follow").length
  const shares = Number(counters.shares || 0)
  const saves = Number(counters.saves || 0)
  const comments = Number(counters.comments || 0)
  const likes = Number(counters.likes || 0)

  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, views: 0, actions: 0 }))
  const days = new Map<string, { date: string; views: number; actions: number }>()
  for (const event of events) {
    const date = new Date(event.created_at)
    if (!Number.isFinite(date.getTime())) continue
    const dayKey = date.toISOString().slice(0, 10)
    const day = days.get(dayKey) || { date: dayKey, views: 0, actions: 0 }
    const isView = event.event_type === "view"
    if (isView) { hours[date.getHours()].views += 1; day.views += 1 }
    else { hours[date.getHours()].actions += 1; day.actions += 1 }
    days.set(dayKey, day)
  }

  const completionRate = views ? Math.min(1, completes / views) : 0
  const rewatchRate = views ? Math.min(1, rewatches / views) : 0
  const averageWatchMs = views ? Math.round(totalWatchMs / views) : 0
  const engagement = views ? (likes + comments * 2 + saves * 3 + shares * 3 + follows * 4) / views : 0

  const insight = views < 30
    ? "Нужно больше показов, чтобы Malik дал устойчивый вывод."
    : completionRate >= .72
      ? "Сильный досмотр. Масштабируй этот формат и сохрани первые секунды без изменений."
      : completionRate < .35
        ? "Большая часть аудитории не доходит до конца. Укороти вступление и покажи главный момент в первые 1–2 секунды."
        : saves > likes * .35
          ? "Высокая доля сохранений: ролик воспринимается как полезный. Сделай серию на ту же тему."
          : "Удержание среднее. Усиль первый кадр, ритм и причину досмотреть ролик до конца."

  return NextResponse.json({
    post,
    overview: {
      views,
      uniqueViewers,
      likes,
      comments,
      reposts: Number(counters.reposts || 0),
      saves,
      shares,
      followersGained: follows,
      totalWatchMs,
      averageWatchMs,
      completionRate,
      rewatchRate,
      engagementScore: Number(engagement.toFixed(3)),
    },
    external: {
      views: counters.external_views == null ? null : Number(counters.external_views),
      likes: counters.external_likes == null ? null : Number(counters.external_likes),
      comments: counters.external_comments == null ? null : Number(counters.external_comments),
      shares: counters.external_shares == null ? null : Number(counters.external_shares),
    },
    activity: {
      hours,
      days: Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
    },
    malikInsight: insight,
  }, { headers: { "Cache-Control": "private, no-store" } })
}
