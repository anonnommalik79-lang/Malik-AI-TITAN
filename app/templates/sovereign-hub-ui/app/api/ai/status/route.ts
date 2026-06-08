import { getSafeAIStatus } from "@/lib/ai/status"
import { getPublicProofStatus } from "@/lib/proof/public-proof"

export const runtime = "nodejs"

export async function GET() {
  const status = getSafeAIStatus()
  const proof = getPublicProofStatus()
  return Response.json({
    ok: status.ok,
    groqConfigured: proof.groqConfigured,
    bedrockPrimaryConfigured: proof.bedrockPrimaryConfigured,
    bedrockBackupConfigured: proof.bedrockBackupConfigured,
    azureConfigured: proof.azureConfigured,
    photoModelConfigured: proof.photoModelConfigured,
    videoModelConfigured: proof.videoModelConfigured,
    capabilitiesLoaded: proof.capabilitiesLoaded,
    capabilitiesCount: proof.capabilitiesCount,
    buildReady: proof.buildReady,
    region: status.region,
    modes: status.modes,
    modelsConfigured: status.modelsConfigured,
    stage: status.stage,
    product: status.product,
  })
}
