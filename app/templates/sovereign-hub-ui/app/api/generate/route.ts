import { handleGenerateRequest, generationManifest } from "@/lib/generation-route"
import {
  acquireVideoDailySlot,
  getVideoDailyGateStatus,
  isPhotoGenerationPaused,
  photoMaintenanceResponse,
  videoDailyLimitResponse,
} from "@/lib/server/media-availability"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { withCompute } from "@/lib/malik-compute/runtime"
import { generationComputeOperation } from "@/lib/malik-compute/policies"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function normalizeKind(value: unknown) {
  const raw = String(value || "code").trim().toLowerCase().replace(/_/g, "-")
  if (["image", "images", "img", "picture", "pictures", "photo-generation"].includes(raw)) return "photo"
  if (["video-generation"].includes(raw)) return "video"
  return raw
}

function explicitVideoPrompt(prompt: string) {
  return /^\s*\/(?:video|veo)(?![\p{L}\p{N}_])\s*:?/iu.test(prompt)
}

export const POST = withCompute(handlePOST, generationComputeOperation)

async function handlePOST(request: Request) {
  const body = await request.clone().json().catch(() => ({})) as {
    kind?: unknown
    prompt?: unknown
    message?: unknown
    userEmail?: unknown
  }
  const kind = normalizeKind(body.kind)
  const prompt = String(body.prompt || body.message || "").trim()

  if (kind === "photo" && isPhotoGenerationPaused()) {
    return photoMaintenanceResponse("/api/generate")
  }

  if (kind === "video" && prompt && explicitVideoPrompt(prompt)) {
    const entitlement = await resolveRequestEntitlement(request).catch(() => null)
    const userId = String(entitlement?.userId || body.userEmail || "anonymous")
    const slot = await acquireVideoDailySlot(userId)
    if (!slot.available) return videoDailyLimitResponse(slot, "/api/generate")
  }

  return handleGenerateRequest(request)
}

export async function GET() {
  const video = await getVideoDailyGateStatus()
  const manifest = generationManifest()
  return Response.json({
    ...manifest,
    route: "/api/generate",
    method: "POST",
    runtime,
    image: {
      status: "paused",
      maintenance: true,
      code: "IMAGE_GENERATION_TEMPORARILY_PAUSED",
    },
    video: {
      status: video.available ? "ready" : "limited",
      tier: video.available ? "Free" : "Pro",
      pro: !video.available,
      locked: !video.available,
      globalDailyLimit: 1,
      remainingDailyVideos: video.available ? 1 : 0,
      resetAt: video.resetAt,
      retryAt: video.resetAt,
    },
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}
