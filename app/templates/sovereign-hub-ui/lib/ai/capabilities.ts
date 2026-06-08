import { getSafeEnvSnapshot } from "./env"
import { FOUNDER_LINE, HONEST_POSITIONING, PROFESSIONAL_DISCLAIMER, STAGE_LINE } from "./safety"
import { CAPABILITY_MODES } from "./capabilities/categories"
import { CAPABILITIES, getPublicCapabilityRegistry } from "./capabilities/registry"
import { getFeaturedCapabilityGroups } from "./capabilities/recommend"

export * from "./capabilities/types"
export * from "./capabilities/categories"
export * from "./capabilities/registry"
export * from "./capabilities/recommend"

export type CapabilityCard = {
  id: string
  title: string
  description: string
  mode?: string
}

export const CAPABILITY_CARDS: CapabilityCard[] = CAPABILITIES.slice(0, 12).map((capability) => ({
  id: capability.id,
  title: capability.title,
  description: capability.description,
  mode: capability.suggestedMode,
}))

export function getPublicCapabilities() {
  const env = getSafeEnvSnapshot()
  const registry = getPublicCapabilityRegistry()

  return {
    ...registry,
    positioning: HONEST_POSITIONING,
    founder: FOUNDER_LINE,
    stage: STAGE_LINE,
    disclaimer: PROFESSIONAL_DISCLAIMER,
    modes: CAPABILITY_MODES,
    featuredGroups: getFeaturedCapabilityGroups(),
    providers: [
      { id: "groq", configured: env.groqConfigured, role: "Fast chat primary" },
      { id: "aws-bedrock", configured: env.bedrockPrimaryConfigured, role: "Multi-mode Bedrock runtime" },
      { id: "openai-compatible", configured: env.openaiConfigured, role: "Optional compatible endpoint" },
    ],
    kazakhstanImpact: [
      "Students and education support",
      "Small business productivity",
      "Startup founders and pitch prep",
      "Document analysis and summarization",
      "Multilingual AI: Kazakh / Russian / English",
      "Public problem analysis drafts",
      "Local AI ecosystem experimentation",
    ],
  }
}
