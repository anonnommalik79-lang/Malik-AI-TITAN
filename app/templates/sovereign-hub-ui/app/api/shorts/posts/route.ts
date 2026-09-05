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

function mimeFromKey(key: string) {
  const ext = key.split(".").pop()?.toLowerCase()
  if (ext === "mp4") return "video/mp4"
  if (ext === "webm") return "video/webm"
  if (ext === "mov") return "video/quicktime"
  if (ext === "png") return "image/png"
  if (ext === "webp") return "image/webp"
  return "image/jpeg"
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
    if (!post?.id) throw new Error("POST_INSERT_EMPTY")

    const kind = key.includes("/video/") ? "video" : "image"
    const assetRows = await shortsSupabaseRequest<any[]>("malik_shorts_media_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ owner_key: user.id, post_id: post.id, kind, storage_key: key, source_url: mediaUrl, mime_type: mimeFromKey(key), duration_ms: durationSeconds == null ? null : durationSeconds * 1000, status: "uploaded" }),
    }).catch(() => [])
    const asset = assetRows?.[0] || null

    await shortsSupabaseRequest("malik_shorts_rights_provenance?on_conflict=post_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ post_id: post.id, source_provider: "malik", canonical_url: `https://malikaiworld.world/shorts/malik/${post.id}`, provider_owner_id: user.id, provider_owner_name: displayName, ingestion_method: "native_upload", rights_basis: "creator_owned", attribution_required: false, download_allowed: false, remix_allowed: input.canRemix !== false, commercial_use_allowed: false, takedown_status: "clear" }),
    }).catch(() => undefined)

    if (asset?.id) {
      const jobs = (kind === "video"
        ? ["virus_scan", "probe", "thumbnail", "transcode_hls", "caption", "moderation", "embedding"]
        : ["virus_scan", "thumbnail", "moderation", "embedding"])
        .map((jobType, index) => ({ asset_id: asset.id, job_type: jobType, status: "queued", priority: 50 + index * 10, payload: { postId: post.id, language: safeText(input.language, 16) || "ru", region: safeText(input.region, 16) || "KZ" } }))
      await shortsSupabaseRequest("malik_shorts_media_jobs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(jobs) }).catch(() => undefined)
    }

    return NextResponse.json({ ok: true, post, assetId: asset?.id || null, processingQueued: Boolean(asset?.id) }, { status: 201 })
  } catch (error) {
    console.error("[Malik Shorts] publish failed", error)
    return NextResponse.json({ error: "PUBLISH_FAILED" }, { status: 500 })
  }
}
