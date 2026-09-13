import { photoMaintenanceResponse } from "@/lib/server/media-availability"
import { withCompute } from "@/lib/malik-compute/runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = withCompute(handlePOST, "image")

async function handlePOST() {
  return photoMaintenanceResponse("/api/media/image")
}
