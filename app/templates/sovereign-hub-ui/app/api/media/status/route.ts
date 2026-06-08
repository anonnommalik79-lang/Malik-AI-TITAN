export const runtime = "nodejs"

import { getAdminAccess } from "@/lib/server/admin"
import { getBackendStatus, getMediaReadiness, getPublicEngineReadiness } from "@/lib/provider-status"

export async function GET(request: Request) {
  const access = getAdminAccess(request)
  const debugProviders = getMediaReadiness()
  const backend = await getBackendStatus()

  return Response.json({
    ok: true,
    status: "ready",
    secretsExposed: false,
    queue: {
      mode: process.env.REDIS_URL ? "redis-ready" : "memory-fallback",
      pending: 0,
      running: 0,
    },
    engines: getPublicEngineReadiness(),
    backend: { ready: backend.ready, mode: backend.ready ? "runtime-ready" : "direct-routing" },
    storage: {
      ready: Boolean(process.env.S3_BUCKET || process.env.STORAGE_BUCKET || process.env.R2_BUCKET),
      mode: process.env.S3_BUCKET || process.env.STORAGE_BUCKET || process.env.R2_BUCKET ? "object-storage" : "fallback",
    },
    debug: access.debugAllowed ? { providers: debugProviders, backend } : undefined,
  })
}
