import { osError, osJson, osOwner } from "@/lib/os/http"
import { perfReport } from "@/lib/os/perf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Performance budget: measured p50/p95 of real runs against each budget. */
export async function GET(request: Request) {
  try {
    const owner = await osOwner(request)
    if (!owner.authenticated) return osJson({ ok: true, rows: [], note: "Войдите, чтобы видеть метрики." })
    return osJson({ ok: true, rows: perfReport(), since: "с последнего запуска сервера", note: "Только реальные измерения этого сервера; пусто — значит данных ещё нет." })
  } catch (error) {
    return osError(error)
  }
}
