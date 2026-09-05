import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsSupabaseConfig, getTikTokShortsConfig, getYouTubeOAuthConfig, getYouTubeShortsConfig } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

function storageReady() {
  return Boolean(
    process.env.MALIK_SHORTS_S3_ENDPOINT &&
    process.env.MALIK_SHORTS_S3_BUCKET &&
    process.env.MALIK_SHORTS_S3_ACCESS_KEY_ID &&
    process.env.MALIK_SHORTS_S3_SECRET_ACCESS_KEY &&
    process.env.MALIK_SHORTS_PUBLIC_CDN_URL
  )
}

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  return NextResponse.json({
    authenticated: Boolean(user),
    capabilities: {
      database: Boolean(getShortsSupabaseConfig()),
      nativeUpload: storageReady(),
      youtubeDiscovery: Boolean(getYouTubeShortsConfig()),
      youtubeCreatorOAuth: Boolean(getYouTubeOAuthConfig()),
      tiktokCreatorOAuth: Boolean(getTikTokShortsConfig()),
      instagramCreatorOAuth: false,
      recommendationV2: Boolean(getShortsSupabaseConfig()),
      messaging: Boolean(getShortsSupabaseConfig()),
      liveMetadata: Boolean(getShortsSupabaseConfig()),
      liveStreamingTransport: false,
      creatorEconomyLedger: Boolean(getShortsSupabaseConfig()),
    },
    notes: {
      instagramCreatorOAuth: "Provider adapter is reserved; enable only after approved Meta credentials and policy review.",
      liveStreamingTransport: "Live session/chat metadata exists; RTMP/WebRTC ingest + transcoding/CDN is a separate infrastructure service.",
    },
  }, { headers: { "Cache-Control": "private, no-store" } })
}
