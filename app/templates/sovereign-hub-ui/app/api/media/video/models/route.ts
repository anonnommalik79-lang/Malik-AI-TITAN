import { freeVideoProviderConfigured } from "@/lib/media/providers/free-video"
import { malikH3Configured } from "@/lib/media/providers/malik-h3"
import { videoProviderConfigured } from "@/lib/media/providers/titan-video"
import type { VideoProviderId } from "@/lib/media/types"
import { resolveMediaUser } from "@/lib/media/request"
import { hasMalikProAccess } from "@/lib/ai/malik-models"

export const runtime = "nodejs"

// Only public availability flags are returned. Provider credentials never leave the server.
export async function GET(request: Request) {
  const user = await resolveMediaUser(request)
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

  return Response.json({
    ok: true,
    models,
    access: {
      pro: user.authenticated && hasMalikProAccess(user.plan),
      owner: user.authenticated && user.plan === "owner",
    },
    capabilities: {
      videoExtend: models.runway && String(process.env.RUNWAY_VIDEO_EDIT_MODEL || "").trim() === "seedance2_5",
    },
  }, { headers: { "Cache-Control": "no-store" } })
}
