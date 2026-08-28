import { getComputeIdentity } from "@/lib/malik-compute/identity"
import { computeErrorResponse, computeService, retryCompute } from "@/lib/malik-compute/runtime"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" }

export async function GET() {
  try {
    const identity = await getComputeIdentity()
    const balance = await retryCompute(() => computeService.getComputeBalance(identity.userId))
    return Response.json({
      mode: "live", balance, guest: identity.guest,
      storage: process.env.MALIK_COMPUTE_DATA_DIR ? "configured-directory" : "local-directory",
      ...(identity.admin ? { admin: computeService.getAdminStats() } : {}),
    }, { headers })
  } catch (error) { return computeErrorResponse(error) }
}
