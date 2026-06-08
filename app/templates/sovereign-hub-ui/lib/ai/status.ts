import { MALIK_MODES } from "./config"
import { getSafeEnvSnapshot } from "./env"
import { providerStatus } from "./providers"

export function getSafeAIStatus() {
  const env = getSafeEnvSnapshot()
  const providers = providerStatus()
    .filter((item) => item.configured)
    .map((item) => ({ id: item.provider, status: item.message, models: item.models }))

  return {
    ok: true,
    ...env,
    modes: MALIK_MODES,
    providers,
    stage: "release-candidate",
    product: "MALIK AI Sovereign Hub",
  }
}
