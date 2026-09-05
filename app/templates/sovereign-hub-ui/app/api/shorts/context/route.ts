import { NextRequest, NextResponse } from "next/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(request: NextRequest) {
  const shortId = safeText(request.nextUrl.searchParams.get("shortId"), 80)
  if (!UUID.test(shortId)) return NextResponse.json({ error: "INVALID_SHORT_ID" }, { status: 400 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })

  const posts = await shortsSupabaseRequest<any[]>(`malik_shorts_feed_v1?select=*&id=eq.${shortId}&limit=1`).catch(() => [])
  const post = posts[0]
  if (!post) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

  const [captions, comments, externalComments, topicLinks, features, soundLinks] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_captions?select=language,kind,body,status&post_id=eq.${shortId}&status=eq.ready&order=language.asc&limit=12`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_comments?select=id,body,like_count,created_at,parent_id,user_key,malik_shorts_profiles(username,display_name)&post_id=eq.${shortId}&status=eq.visible&order=like_count.desc,created_at.desc&limit=25`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_external_comments?select=provider,provider_comment_id,provider_parent_id,author_name,body,like_count,reply_count,published_at&post_id=eq.${shortId}&order=like_count.desc,published_at.desc&limit=25`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_post_topics?select=confidence,source,malik_shorts_topics(id,slug,name)&post_id=eq.${shortId}&order=confidence.desc&limit=16`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_post_features?select=detected_language,detected_region,objects,entities,moderation_labels,quality_score,safety_score&post_id=eq.${shortId}&limit=1`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_post_sounds?select=start_ms,malik_shorts_sounds(id,title,artist,source,canonical_url,rights_status)&post_id=eq.${shortId}&limit=1`).catch(() => []),
  ])

  const bestCaption = captions.find((row) => row.kind === "caption") || captions[0] || null
  return NextResponse.json({
    short: {
      id: post.id,
      source: post.source,
      sourceId: post.source_id,
      sourceUrl: post.source_url,
      caption: post.caption,
      hashtags: post.hashtags || [],
      language: post.language,
      region: post.region,
      durationSeconds: post.duration_seconds,
      publishedAt: post.published_at,
      creator: { id: post.creator_key, username: post.username, displayName: post.display_name, bio: post.bio, verified: Boolean(post.verified) },
      metrics: { views: Number(post.views || 0), likes: Number(post.likes || 0), comments: Number(post.comments || 0), saves: Number(post.saves || 0), shares: Number(post.shares || 0) },
    },
    transcript: bestCaption ? { language: bestCaption.language, kind: bestCaption.kind, body: String(bestCaption.body || "").slice(0, 20000) } : null,
    captions: captions.map((row) => ({ language: row.language, kind: row.kind, body: String(row.body || "").slice(0, 8000) })),
    topics: topicLinks.map((row) => ({ confidence: Number(row.confidence || 0), source: row.source, ...(row.malik_shorts_topics || {}) })),
    detected: features[0] ? { language: features[0].detected_language, region: features[0].detected_region, objects: features[0].objects || [], entities: features[0].entities || [], qualityScore: Number(features[0].quality_score || 0), safetyScore: Number(features[0].safety_score || 0) } : null,
    sound: soundLinks[0] || null,
    malikComments: comments.map((row) => ({ id: row.id, body: String(row.body || "").slice(0, 1500), likes: Number(row.like_count || 0), parentId: row.parent_id, createdAt: row.created_at, author: row.malik_shorts_profiles || { username: "user", display_name: "User" } })),
    externalComments: externalComments.map((row) => ({ provider: row.provider, id: row.provider_comment_id, parentId: row.provider_parent_id, author: row.author_name, body: String(row.body || "").slice(0, 1500), likes: Number(row.like_count || 0), replies: Number(row.reply_count || 0), publishedAt: row.published_at })),
  }, { headers: { "Cache-Control": "private, no-store" } })
}
