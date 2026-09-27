import { DATASET_LIMIT_BYTES, analyzeDataset } from "@/lib/os/actions"
import { OsToolError } from "@/lib/os/failures"
import { cleanRequestId, flowView, osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { serverToolDeps } from "@/lib/os/runtime"
import { toSummary } from "@/lib/os/store"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Data analyst mode: a CSV or XLSX (base64, up to 5 MB) becomes a dataset in
 * the library and an analysis whose numbers are computed, not guessed.
 */
export async function POST(request: Request) {
  try {
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, Math.ceil(DATASET_LIMIT_BYTES * 1.4) + 8_192)
    const clientRequestId = cleanRequestId(body.clientRequestId)
    if (!clientRequestId) throw new OsToolError("INVALID_REQUEST", "Нет идентификатора запроса.", { retryable: false })
    const fileName = String(body.fileName || "data.csv").slice(0, 160)
    if (!/\.(?:csv|tsv|txt|xlsx)$/i.test(fileName)) throw new OsToolError("INVALID_REQUEST", "Поддерживаются CSV и XLSX.", { retryable: false })
    const base64 = String(body.base64 || "").replace(/^data:[^,]*,/, "")
    if (!base64) throw new OsToolError("INVALID_REQUEST", "Файл пустой.", { retryable: false })
    const bytes = Buffer.from(base64, "base64")
    const result = await analyzeDataset({
      owner,
      fileName,
      bytes,
      question: String(body.question || ""),
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
      clientRequestId,
      deps: serverToolDeps(),
    })
    return osJson({ ok: true, created: result.created, flow: flowView(result.flow), dataset: toSummary(result.dataset) }, 201)
  } catch (error) {
    return osError(error)
  }
}
