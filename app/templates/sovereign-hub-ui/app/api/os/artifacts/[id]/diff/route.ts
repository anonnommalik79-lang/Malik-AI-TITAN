import { compactDiff, diffFiles, diffLines } from "@/lib/os/diff"
import { OsToolError } from "@/lib/os/failures"
import { osError, osJson, osOwner } from "@/lib/os/http"
import { getArtifact } from "@/lib/os/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

function files(content?: string) {
  try {
    const parsed = JSON.parse(content || "") as { files?: Array<{ path: string; content: string }> }
    return Array.isArray(parsed.files) ? parsed.files : null
  } catch {
    return null
  }
}

/** Diff mode: what changed between two versions (?against=<older id>). */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const owner = await osOwner(request)
    const against = new URL(request.url).searchParams.get("against") || ""
    const [current, older] = await Promise.all([getArtifact(owner.userId, id), getArtifact(owner.userId, against)])
    if (!current || !older) throw new OsToolError("NOT_FOUND", "Версия не найдена.", { retryable: false })
    if (current.kind !== older.kind) throw new OsToolError("INVALID_REQUEST", "Сравнивать можно только версии одного результата.", { retryable: false })
    const a = files(older.content)
    const b = files(current.content)
    if (a && b) {
      const changed = diffFiles(a, b).map((file) => ({ path: file.path, status: file.status, added: file.diff?.added || 0, removed: file.diff?.removed || 0, hunks: file.diff ? compactDiff(file.diff).slice(0, 400) : [] }))
      return osJson({ ok: true, mode: "files", files: changed.slice(0, 60) })
    }
    const result = diffLines(older.content || older.url || "", current.content || current.url || "")
    return osJson({ ok: true, mode: "lines", added: result.added, removed: result.removed, truncated: result.truncated, hunks: compactDiff(result).slice(0, 1_500) })
  } catch (error) {
    return osError(error)
  }
}
