import { handleMalikPhotoGenerationRequest } from "@/lib/media/generate-photo-route"
import { withCompute } from "@/lib/malik-compute/runtime"

export const runtime = "nodejs"

// Chat and the dedicated photo studio now share one strict, persistent image
// pipeline. The previous route bypassed multilingual intent locking and could
// return a decorative demo SVG as if it were the requested image.
export const POST = withCompute(handleMalikPhotoGenerationRequest, "image")
