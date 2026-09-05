import { NextRequest, NextResponse } from "next/server"
import { clampInt, getShortsSupabaseConfig, getYouTubeShortsConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

function count(value: unknown) {
  const n = Number(value || 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export async function GET(request: NextRequest) {
  const query = safeText(request.nextUrl.searchParams.get("q"), 120)
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 30, 12)
  const lang = safeText(request.nextUrl.searchParams.get("lang"), 10) || "ru"
  const region = safeText(request.nextUrl.searchParams.get("region"), 8) || "KZ"
  if (!query) return NextResponse.json({ videos: [], creators: [], topics: [] })

  const [malikPosts, creators, topics, youtube] = await Promise.all([
    getShortsSupabaseConfig() ? shortsSupabaseRequest<any[]>(`malik_shorts_feed_v1?select=*&or=(caption.ilike.*${encodeURIComponent(query)}*,username.ilike.*${encodeURIComponent(query)}*,display_name.ilike.*${encodeURIComponent(query)}*)&order=published_at.desc.nullslast&limit=${limit}`).catch(() => []) : Promise.resolve([]),
    getShortsSupabaseConfig() ? shortsSupabaseRequest<any[]>(`malik_shorts_profiles?select=user_key,username,display_name,avatar_url,bio,verified,follower_count,post_count,total_likes&or=(username.ilike.*${encodeURIComponent(query)}*,display_name.ilike.*${encodeURIComponent(query)}*,bio.ilike.*${encodeURIComponent(query)}*)&order=follower_count.desc&limit=${limit}`).catch(() => []) : Promise.resolve([]),
    getShortsSupabaseConfig() ? shortsSupabaseRequest<any[]>(`malik_shorts_topics?select=id,slug,name,description,language,region,post_count,follower_count&active=eq.true&or=(slug.ilike.*${encodeURIComponent(query)}*,name.ilike.*${encodeURIComponent(query)}*,description.ilike.*${encodeURIComponent(query)}*)&order=post_count.desc&limit=${limit}`).catch(() => []) : Promise.resolve([]),
    (async () => {
      const config = getYouTubeShortsConfig(); if (!config) return [] as any[]
      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search")
      searchUrl.searchParams.set("part", "snippet"); searchUrl.searchParams.set("type", "video"); searchUrl.searchParams.set("q", query); searchUrl.searchParams.set("maxResults", String(limit)); searchUrl.searchParams.set("regionCode", region.slice(0, 2).toUpperCase()); searchUrl.searchParams.set("relevanceLanguage", lang); searchUrl.searchParams.set("safeSearch", "moderate"); searchUrl.searchParams.set("videoEmbeddable", "true"); searchUrl.searchParams.set("videoSyndicated", "true"); searchUrl.searchParams.set("videoDuration", "short"); searchUrl.searchParams.set("key", config.apiKey)
      const searchResponse = await fetch(searchUrl, { next: { revalidate: 120 } }); if (!searchResponse.ok) return []
      const searchJson = await searchResponse.json(); const ids = (searchJson?.items || []).map((item: any) => item?.id?.videoId).filter(Boolean); if (!ids.length) return []
      const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos"); videosUrl.searchParams.set("part", "snippet,statistics,contentDetails,status"); videosUrl.searchParams.set("id", ids.join(",")); videosUrl.searchParams.set("key", config.apiKey)
      const videosResponse = await fetch(videosUrl, { next: { revalidate: 120 } }); if (!videosResponse.ok) return []
      const videosJson = await videosResponse.json(); return Array.isArray(videosJson?.items) ? videosJson.items : []
    })(),
  ])

  const malikVideos = malikPosts.map((row) => ({ id: row.id, source: row.source, sourceId: row.source_id, sourceUrl: row.source_url, posterUrl: row.poster_url, caption: row.caption, creator: { id: row.creator_key, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, verified: Boolean(row.verified) }, metrics: { views: count(row.views), likes: count(row.likes), comments: count(row.comments) }, publishedAt: row.published_at }))
  const youtubeVideos = youtube.map((video: any) => ({ id: `youtube:${video.id}`, source: "youtube", sourceId: video.id, sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`, posterUrl: video?.snippet?.thumbnails?.maxres?.url || video?.snippet?.thumbnails?.high?.url || video?.snippet?.thumbnails?.medium?.url, caption: video?.snippet?.title || "", creator: { id: `youtube:${video?.snippet?.channelId || ""}`, username: `yt.${String(video?.snippet?.channelId || "").slice(-24)}`, displayName: video?.snippet?.channelTitle || "YouTube creator" }, metrics: { views: count(video?.statistics?.viewCount), likes: count(video?.statistics?.likeCount), comments: count(video?.statistics?.commentCount) }, publishedAt: video?.snippet?.publishedAt }))

  return NextResponse.json({
    videos: [...malikVideos, ...youtubeVideos].slice(0, limit * 2),
    creators: creators.map((row) => ({ userKey: row.user_key, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, bio: row.bio, verified: Boolean(row.verified), followerCount: count(row.follower_count), postCount: count(row.post_count), totalLikes: count(row.total_likes) })),
    topics: topics.map((row) => ({ id: row.id, slug: row.slug, name: row.name, description: row.description, language: row.language, region: row.region, postCount: count(row.post_count), followerCount: count(row.follower_count) })),
  }, { headers: { "Cache-Control": "private, no-store" } })
}
