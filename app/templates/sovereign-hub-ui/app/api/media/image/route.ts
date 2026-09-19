import { handleMalikPhotoGenerationRequest } from "@/lib/media/generate-photo-route"
import { withCompute } from "@/lib/malik-compute/runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export const POST = withCompute(handlePOST, "image")

async function handlePOST(request: Request) {
  return handleMalikPhotoGenerationRequest(request)
}
