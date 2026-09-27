import { healthMatrix } from "@/lib/os/health"
import { isOwnerPlan, osError, osJson, osOwner } from "@/lib/os/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Compute control center data: the health matrix. Everyone sees what is
 * available; the owner sees every provider and lane (never keys).
 */
export async function GET(request: Request) {
  try {
    const owner = await osOwner(request)
    const matrix = await healthMatrix(isOwnerPlan(owner))
    return osJson({ ok: true, at: Date.now(), detailed: isOwnerPlan(owner), ...matrix })
  } catch (error) {
    return osError(error)
  }
}
