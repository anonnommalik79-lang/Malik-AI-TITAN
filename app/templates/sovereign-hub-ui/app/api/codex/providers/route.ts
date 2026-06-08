export const runtime = "nodejs"
import { getAdminAccess } from "@/lib/server/admin"
import { getProviderRows, getPublicEngineReadiness } from "@/lib/provider-status"

export async function GET(request: Request) {
  const access = getAdminAccess(request)
  return Response.json({
    ok: true,
    engines: getPublicEngineReadiness().filter((item) => item.group === "code" || item.group === "text" || item.group === "infrastructure"),
    debug: access.debugAllowed ? { providers: getProviderRows() } : undefined,
  })
}
