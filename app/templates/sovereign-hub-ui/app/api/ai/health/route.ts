import { getSafeAIStatus } from "@/lib/ai/status"

export const runtime = "nodejs"

export async function GET() {
  const status = getSafeAIStatus()
  return Response.json({
    ok: status.ok,
    healthy: status.bedrockPrimaryConfigured || status.groqConfigured,
    stage: status.stage,
    modes: status.modes,
  })
}
