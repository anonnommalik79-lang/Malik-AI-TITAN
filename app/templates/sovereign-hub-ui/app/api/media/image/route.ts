import { handleMalikPhotoGenerationRequest } from "@/lib/media/generate-photo-route"
import { withCompute } from "@/lib/malik-compute/runtime"

export const runtime = "nodejs"

// The dedicated Photo Generation page uses the exact same automatic model,
// strict prompt and persistence contract as image generation inside chat.
export const POST = withCompute(handleMalikPhotoGenerationRequest, "image")
