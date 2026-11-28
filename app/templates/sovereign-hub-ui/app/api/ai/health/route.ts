import { webSearchConfiguration } from "@/lib/malik-research/free-web"
import { getSafeAIStatus } from "@/lib/ai/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const status = getSafeAIStatus()
  return Response.json({
    ok: status.ok,
    healthy: status.bedrockPrimaryConfigured || status.groqConfigured,
    stage: status.stage,
    modes: status.modes,
    webSearch: webSearchConfiguration(),
  }, { headers: { "Cache-Control": "no-store" } })
}
