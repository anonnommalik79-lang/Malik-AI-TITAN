export const runtime = "nodejs"

import { getAdminAccess } from "@/lib/server/admin"
import { getBackendStatus, getProviderRows, getPublicEngineReadiness } from "@/lib/provider-status"

export async function GET(request: Request) {
  const backend = await getBackendStatus()
  const access = getAdminAccess(request)

  return Response.json({
    ok: true,
    module: "env-check",
    secretsExposed: false,
    engines: getPublicEngineReadiness(),
    backend: {
      ready: backend.ready,
      mode: backend.ready ? "runtime-ready" : "direct-routing",
    },
    debug: access.debugAllowed ? { providers: getProviderRows(), backend } : undefined,
  })
}
