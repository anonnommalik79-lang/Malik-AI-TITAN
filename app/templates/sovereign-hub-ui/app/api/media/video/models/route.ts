import { freeVideoProviderConfigured } from "@/lib/media/providers/free-video"
import { malikH3Configured } from "@/lib/media/providers/malik-h3"
import { videoProviderConfigured } from "@/lib/media/providers/titan-video"
import type { VideoProviderId } from "@/lib/media/types"
import { DEFAULT_VIDEO_PROVIDER_ID, VIDEO_CAPABILITIES } from "@/lib/media/video-capabilities"

export const runtime = "nodejs"

// Only public availability flags are returned. Provider credentials never leave the server.
export async function GET() {
  const models: Record<VideoProviderId, boolean> = {
    novai: freeVideoProviderConfigured("novai"),
    magichour: freeVideoProviderConfigured("magichour"),
    pixazo: freeVideoProviderConfigured("pixazo"),
    cliptaps: freeVideoProviderConfigured("cliptaps"),
    h3: malikH3Configured(),
    dashscope: videoProviderConfigured("dashscope"),
    pollo: videoProviderConfigured("pollo"),
    runway: videoProviderConfigured("runway"),
    fal: videoProviderConfigured("fal"),
    luma: videoProviderConfigured("luma"),
    veo: videoProviderConfigured("veo"),
  }

  return Response.json({ ok: true, models, capabilities: VIDEO_CAPABILITIES, defaultProvider: DEFAULT_VIDEO_PROVIDER_ID }, { headers: { "Cache-Control": "private, no-store" } })
}
