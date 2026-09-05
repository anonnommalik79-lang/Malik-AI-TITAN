import "server-only"

export type MalikExternalProvider = "youtube" | "tiktok" | "instagram"

export type ProviderCapabilities = {
  login: boolean
  profileRead: boolean
  statsRead: boolean
  postsRead: boolean
  commentsRead: boolean
  commentsWrite: boolean
  reactionsWrite: boolean
  followWrite: boolean
  publishWrite: boolean
  liveRead: boolean
  officialEmbed: boolean
}

export const PROVIDER_CAPABILITIES: Record<MalikExternalProvider, ProviderCapabilities> = {
  youtube: {
    login: true,
    profileRead: true,
    statsRead: true,
    postsRead: true,
    commentsRead: true,
    commentsWrite: true,
    reactionsWrite: true,
    followWrite: true,
    publishWrite: false,
    liveRead: true,
    officialEmbed: true,
  },
  tiktok: {
    login: true,
    profileRead: true,
    statsRead: true,
    postsRead: true,
    commentsRead: false,
    commentsWrite: false,
    reactionsWrite: false,
    followWrite: false,
    publishWrite: false,
    liveRead: false,
    officialEmbed: true,
  },
  instagram: {
    login: false,
    profileRead: false,
    statsRead: false,
    postsRead: false,
    commentsRead: false,
    commentsWrite: false,
    reactionsWrite: false,
    followWrite: false,
    publishWrite: false,
    liveRead: false,
    officialEmbed: false,
  },
}

export function providerCapability(provider: MalikExternalProvider, capability: keyof ProviderCapabilities) {
  return Boolean(PROVIDER_CAPABILITIES[provider]?.[capability])
}

export function providerStatus(provider: MalikExternalProvider) {
  return {
    provider,
    enabled: provider !== "instagram",
    capabilities: PROVIDER_CAPABILITIES[provider],
    reason: provider === "instagram"
      ? "Reserved until an approved Meta integration and its exact account type/scopes are configured."
      : undefined,
  }
}
