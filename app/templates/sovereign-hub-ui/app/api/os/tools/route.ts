import { osError, osJson } from "@/lib/os/http"
import { toolCatalog } from "@/lib/os/tools/registry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** The actions a Superflow can take: names, labels and what they may cost. */
export async function GET() {
  try {
    return osJson({ ok: true, tools: toolCatalog() })
  } catch (error) {
    return osError(error)
  }
}
