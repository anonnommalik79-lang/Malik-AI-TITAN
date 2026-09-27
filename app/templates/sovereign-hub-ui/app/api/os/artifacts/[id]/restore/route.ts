import { restoreArtifactVersion } from "@/lib/os/actions"
import { OsToolError } from "@/lib/os/failures"
import { osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { toSummary } from "@/lib/os/store"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/** Rollback: an older version becomes the newest one. Nothing is deleted. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 4 * 1024)
    const versionId = String(body.versionId || "")
    if (!/^[\w-]{3,80}$/.test(versionId)) throw new OsToolError("INVALID_REQUEST", "Не указана версия.", { retryable: false })
    const restored = await restoreArtifactVersion(owner.userId, id, versionId)
    return osJson({ ok: true, artifact: toSummary(restored) }, 201)
  } catch (error) {
    return osError(error)
  }
}
