import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { shortsExternalModerationConfigured } from "@/lib/shorts/moderation"
import { getShortsSupabaseConfig, getTikTokShortsConfig, getYouTubeOAuthConfig, getYouTubeShortsConfig } from "@/lib/shorts/server"
import { shortsWorkerConfigured } from "@/lib/shorts/workers"

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
  const database = Boolean(getShortsSupabaseConfig())
  const storage = storageReady()
  const worker = shortsWorkerConfigured()
  return NextResponse.json({
    authenticated: Boolean(user),
    capabilities: {
      database,
      nativeUpload: storage,
      youtubeDiscovery: Boolean(getYouTubeShortsConfig()),
      youtubeCreatorOAuth: Boolean(getYouTubeOAuthConfig()),
      tiktokCreatorOAuth: Boolean(getTikTokShortsConfig()),
      instagramCreatorOAuth: false,
      recommendationV2: database,
      messaging: database,
      liveMetadata: database,
      liveStreamingTransport: database && storage,
      nativeChunkLiveTransport: database && storage,
      rtmpWebrtcIngest: false,
      creatorEconomyLedger: database,
      mediaWorker: worker,
      adaptiveHlsTranscoding: worker && storage,
      progressivePlaybackFallback: worker && storage,
      mediaFingerprinting: worker && database,
      duplicateRightsReview: database,
      localTextModeration: true,
      externalModerationProvider: shortsExternalModerationConfigured(),
    },
    notes: {
      instagramCreatorOAuth: "Provider adapter is reserved; enable only after approved Meta credentials and policy review.",
      liveStreamingTransport: "Malik native camera-to-CDN chunk transport is implemented when DB + storage are configured. RTMP/WebRTC ingest remains an optional scale-up transport.",
      mediaFingerprinting: "Exact, lightweight video and audio fingerprints create review candidates; they are not a substitute for a licensed global Content-ID catalog.",
      moderation: "Local preflight is always available; an optional HTTPS moderation provider can add semantic safety decisions server-side.",
    },
  }, { headers: { "Cache-Control": "private, no-store" } })
}
