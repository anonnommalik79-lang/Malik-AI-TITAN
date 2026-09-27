import { OsToolError } from "@/lib/os/failures"
import { osError, osJson, osOwner } from "@/lib/os/http"
import { lineageOf } from "@/lib/os/library"
import { artifactIndex, getArtifact } from "@/lib/os/store"
import { renderBandwidthBlocked, renderResponseFitsBudget } from "@/lib/server/render-bandwidth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * One artifact with its content (text, HTML, deck JSON, files JSON) and its
 * lineage. Media is a URL the browser loads from storage or the provider —
 * never bytes through this server — and oversized content is refused by
 * the Render bandwidth guard.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    const artifact = await getArtifact(owner.userId, id)
    if (!artifact) throw new OsToolError("NOT_FOUND", "Результат не найден.", { retryable: false })
    const lineage = lineageOf(await artifactIndex(owner.userId), artifact.id)
    const { ownerId: _owner, ...visible } = artifact
    void _owner
    const body = JSON.stringify({ ok: true, artifact: visible, lineage })
    const bytes = Buffer.byteLength(body)
    if (!renderResponseFitsBudget(bytes)) return renderBandwidthBlocked("os-artifact", bytes)
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-malik-os": "v1" } })
  } catch (error) {
    return osError(error)
  }
}
