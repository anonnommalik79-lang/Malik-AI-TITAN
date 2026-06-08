import type { IntelligenceProvider, ProviderHealth } from "./types"

export const MEDIA_PROVIDER_PRIORITY: Record<"image" | "video", IntelligenceProvider[]> = {
  image: ["luma", "openai", "fal", "custom"],
  video: ["luma", "google-veo", "runway", "fal", "custom"],
}

export function chooseMediaProvider(kind: "image" | "video", health: ProviderHealth[] = []) {
  const priority = MEDIA_PROVIDER_PRIORITY[kind]
  const available = priority.find((id) => health.some((provider) => provider.id === id && provider.configured))
  return available || priority[0]
}

export function explainMediaProvider(provider: IntelligenceProvider) {
  const notes: Record<string, string> = {
    luma: "MALIK Cinema is tuned for premium media generation.",
    "google-veo": "MALIK Cinema Quality is preferred for high-quality long-running video when configured.",
    runway: "MALIK Cinema Backup is ready for video fallback.",
    fal: "MALIK Render Queue is a fast backup for images and videos.",
    openai: "MALIK Vision is a stable image backup.",
    custom: "Custom engine slot is available through secure server routes.",
  }
  return notes[provider] || "Engine selected by availability and fallback order."
}

