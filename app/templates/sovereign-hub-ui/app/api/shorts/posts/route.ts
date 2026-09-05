import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"
import { getShortsStorageConfig, publicShortsObjectUrl } from "@/lib/shorts/storage"

export const dynamic = "force-dynamic"

function hashtags(text: string) {
  return Array.from(new Set((String(text || "").match(/#[\p{L}\p{N}_]{2,50}/gu) || []).map((tag) => tag.slice(1).toLowerCase()))).slice(0, 16)
}

function generatedUsername(email: string, id: string) {
  const local = email.split("@")[0]?.replace(/[^A-Za-z0-9._]/g, "").slice(0, 20) || "malik"
  const suffix = id.replace(/[^A-Za-z0-9]/g, "").slice(-7).toLowerCase() || "user"
  return `${local}.${suffix}`.slice(0, 32)
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  if (!getShortsStorageConfig()) return NextResponse.json({ error: "SHORTS_STORAGE_NOT_CONFIGURED" }, { status: 503 })

  let input: {
    key?: string
    caption?: string
    language?: string
    region?: string
    durationSeconds?: number
    visibility?: "public" | "followers" | "private"
    canRemix?: boolean
  }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }

  const key = safeText(input.key, 500)
  const userPart = user.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)
  if (!key.startsWith(`shorts/${userPart}/`)) return NextResponse.json({ error: "INVALID_OBJECT_KEY" }, { status: 400 })
  if (!/\/(?:video|image)\//.test(key)) return NextResponse.json({ error: "INVALID_MEDIA_KIND" }, { status: 400 })

  const caption = safeText(input.caption, 2200)
  const durationSeconds = Number.isFinite(Number(input.durationSeconds))
    ? Math.max(0, Math.min(86400, Math.floor(Number(input.durationSeconds))))
    : null
  const visibility = ["public", "followers", "private"].includes(String(input.visibility)) ? input.visibility : "public"
  const email = String(user.email || "").trim().toLowerCase()
  const displayName = String(user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || email.split("@")[0] || "Malik user").trim()

  try {
    await shortsSupabaseRequest("malik_shorts_profiles?on_conflict=user_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_key: user.id,
        username: generatedUsername(email, user.id),
        display_name: displayName,
        avatar_url: user.profilePictureUrl || null,
        locale: "ru",
        region: "KZ",
      }),
    })

    const mediaUrl = publicShortsObjectUrl(key)
    const rows = await shortsSupabaseRequest<any[]>("malik_shorts_posts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        creator_key: user.id,
        source: "malik",
        playback_kind: "native",
        media_url: mediaUrl,
        caption,
        hashtags: hashtags(caption),
        language: safeText(input.language, 16) || "ru",
        region: safeText(input.region, 16) || "KZ",
        duration_seconds: durationSeconds,
        status: "published",
        visibility,
        can_remix: input.canRemix !== false,
        can_download: false,
        attribution_required: false,
        published_at: new Date().toISOString(),
      }),
    })
    const post = rows?.[0]
    return NextResponse.json({ ok: true, post }, { status: 201 })
  } catch (error) {
    console.error("[Malik Shorts] publish failed", error)
    return NextResponse.json({ error: "PUBLISH_FAILED" }, { status: 500 })
  }
}
