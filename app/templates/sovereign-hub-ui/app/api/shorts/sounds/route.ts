import { NextRequest, NextResponse } from "next/server"
import { clampInt, getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })
  const soundId = safeText(request.nextUrl.searchParams.get("soundId"), 80)
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 100, 40)
  if (soundId) {
    if (!/^[0-9a-f-]{36}$/i.test(soundId)) return NextResponse.json({ error: "INVALID_SOUND_ID" }, { status: 400 })
    const [sounds, links] = await Promise.all([
      shortsSupabaseRequest<any[]>(`malik_shorts_sounds?select=*&id=eq.${soundId}&limit=1`).catch(() => []),
      shortsSupabaseRequest<any[]>(`malik_shorts_post_sounds?select=post_id,start_ms,malik_shorts_posts(id,creator_key,source,source_id,source_url,poster_url,caption,published_at)&sound_id=eq.${soundId}&order=created_at.desc&limit=${limit}`).catch(() => []),
    ])
    return NextResponse.json({ sound: sounds[0] || null, posts: links, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
  }
  const items = await shortsSupabaseRequest<any[]>(`malik_shorts_sounds?select=*&rights_status=neq.blocked&order=usage_count.desc,created_at.desc&limit=${limit}`).catch(() => [])
  return NextResponse.json({ items, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}
