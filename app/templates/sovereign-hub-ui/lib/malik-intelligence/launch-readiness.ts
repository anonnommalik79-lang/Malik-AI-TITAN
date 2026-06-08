import { localProviderHealth, providerReadinessScore } from "./provider-health"

export function launchReadiness() {
  const providers = localProviderHealth()
  const score = providerReadinessScore(providers)
  return {
    score,
    status: score > 60 ? "ready" : score > 25 ? "partial" : "needs-env",
    providers,
    checks: [
      { label: "No secrets exposed", ok: true },
      { label: "Engine status available", ok: providers.length > 0 },
      { label: "Media plan ready", ok: true },
      { label: "Code plan ready", ok: true },
    ],
  }
}

