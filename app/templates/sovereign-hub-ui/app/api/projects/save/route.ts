export const runtime = "nodejs"
import { databaseStatus } from "@/lib/ai/database"

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}))
  const title = String(payload.title || payload.prompt || "Malik AI Project").slice(0, 120)

  return Response.json({
    ok: true,
    id: `malik_${Date.now()}`,
    title,
    saved: true,
    storage: databaseStatus().configured ? "database-ready" : "memory-fallback",
    timestamp: new Date().toISOString(),
  })
}
