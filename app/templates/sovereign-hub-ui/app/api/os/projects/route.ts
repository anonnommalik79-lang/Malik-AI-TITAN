import { osError, osJson, osOwner } from "@/lib/os/http"
import { listProjects, storeIsDurable } from "@/lib/os/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const owner = await osOwner(request)
    if (!owner.authenticated) return osJson({ ok: true, projects: [], durable: await storeIsDurable() })
    return osJson({ ok: true, projects: await listProjects(owner.userId), durable: await storeIsDurable() })
  } catch (error) {
    return osError(error)
  }
}
