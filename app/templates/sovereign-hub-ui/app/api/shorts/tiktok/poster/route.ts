import { NextRequest, NextResponse } from "next/server"
import {
  isAllowedTikTokThumbnail,
  resolveTikTokPosterTarget,
  tiktokOembedUrl,
  TIKTOK_POSTER_PLACEHOLDER,
} from "@/lib/shorts/tiktok-poster"

export const runtime = "nodejs"

/**
 * A fresh cover for an imported TikTok.
 *
 * TikTok's cover_image_url from video.list expires in about six hours, and it
 * is stored in malik_shorts_posts.poster_url as though it were permanent - so a
 * post imported yesterday shows a broken image today unless its owner happens
 * to open the feed and trigger a sync. The stored URL stays the fast path; the
 * browser only reaches this route after that image fails to load, and this
 * re-resolves the thumbnail from the post's own canonical URL through TikTok's
 * public oEmbed.
 *
 * SECURITY. This route takes a URL from the browser and then makes a request
 * about it, which is the shape of an SSRF if the input is trusted. It is not:
 *
 *  - the only host ever contacted is the hard-coded TIKTOK_OEMBED_ENDPOINT;
 *    the caller's string is never used as a fetch destination;
 *  - the input must parse as an https tiktok.com video URL (or be a bare
 *    numeric post id), and the URL that is sent is rebuilt from the handle and
 *    id we recognised, dropping anything else that rode along;
 *  - the thumbnail oEmbed answers with is checked against a TikTok CDN
 *    allow-list before the browser is redirected to it, so a compromised or
 *    unexpected response cannot turn this into an open redirect.
 *
 * Anything that fails becomes the placeholder, never an error page: a card in
 * the feed should degrade to a neutral tile, not to a broken-image icon.
 */

/** Half an hour: long enough that scrolling costs nothing, short enough to follow rotations. */
const CACHE_SECONDS = 1800

function placeholder(reason: string) {
  return new NextResponse(TIKTOK_POSTER_PLACEHOLDER, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Cached too - a video that has no cover today will not have one in a
      // minute either, and an uncached placeholder is a request per scroll.
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=86400`,
      "X-Malik-Poster": reason,
    },
  })
}

export async function GET(request: NextRequest) {
  const target = resolveTikTokPosterTarget({
    url: request.nextUrl.searchParams.get("url"),
    id: request.nextUrl.searchParams.get("id"),
  })
  if (!target) return placeholder("invalid-input")

  try {
    const response = await fetch(tiktokOembedUrl(target), {
      headers: { Accept: "application/json" },
      // Next caches the upstream answer, so a feed of twenty TikToks does not
      // become twenty oEmbed calls per viewer.
      next: { revalidate: CACHE_SECONDS },
    })
    if (!response.ok) return placeholder(`oembed-${response.status}`)

    const payload = await response.json().catch(() => null) as { thumbnail_url?: string } | null
    const thumbnail = payload?.thumbnail_url
    if (!isAllowedTikTokThumbnail(thumbnail)) return placeholder("thumbnail-rejected")

    return NextResponse.redirect(String(thumbnail), {
      status: 302,
      headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
    })
  } catch (error) {
    console.warn("[Malik Shorts] tiktok poster refresh failed", String(error instanceof Error ? error.message : error).slice(0, 160))
    return placeholder("oembed-unreachable")
  }
}
