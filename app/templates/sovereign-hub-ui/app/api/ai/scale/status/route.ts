import { databaseStatus } from "@/lib/ai/database"
import { getPublicEngineReadiness } from "@/lib/provider-status"

export async function GET() {
  const database = databaseStatus()
  return Response.json({
    ok: true,
    database: { configured: database.configured, mode: database.configured ? "persistent-ready" : "memory-fallback" },
    redis: { configured: Boolean(process.env.REDIS_URL), mode: process.env.REDIS_URL ? "queue-ready" : "memory-fallback" },
    storage: { configured: Boolean(process.env.S3_BUCKET || process.env.STORAGE_BUCKET || process.env.R2_BUCKET), mode: process.env.S3_BUCKET || process.env.STORAGE_BUCKET || process.env.R2_BUCKET ? "object-storage" : "fallback" },
    engines: getPublicEngineReadiness(),
  })
}
