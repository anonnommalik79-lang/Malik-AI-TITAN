import { getProviderRows, envGroupConfigured } from "@/lib/provider-status"
import type { AIProviderId } from "./types"

export const FREE_PROVIDER_IDS: AIProviderId[] = ["groq", "gemini", "openrouter"]

export const PREMIUM_PROVIDER_IDS: AIProviderId[] = [
  "openai",
  "claude",
  "aws-bedrock",
  "azure",
  "kimi",
  "grok",
  "deepseek",
  "nvidia-nim",
]

export function isFreeModeEnabled(): boolean {
  const flag = process.env.AI_FREE_MODE?.trim().toLowerCase()
  return flag !== "false"
}

export function getTitanProviderStatus() {
  const rows = getProviderRows()
  const freeMode = isFreeModeEnabled()
  const mapId = (id: string) => rows.find((row) => row.id === id || row.id === id.replace("-", ""))

  return {
    freeModeActive: freeMode,
    providers: {
      groq: mapId("groq"),
      gemini: mapId("gemini"),
      openrouter: mapId("openrouter"),
      openai: mapId("openai"),
      claude: mapId("anthropic"),
      awsBedrock: mapId("awsBedrock"),
      fal: mapId("fal"),
      runway: mapId("runway"),
      luma: mapId("luma"),
      elevenlabs: { id: "elevenlabs", configured: Boolean(process.env.ELEVENLABS_API_KEY?.trim()), ready: false, title: "ElevenLabs" },
      workos: mapId("workos"),
      storage: {
        id: "storage",
        configured: envGroupConfigured(["R2_BUCKET", "S3_BUCKET", "STORAGE_BUCKET", "CLOUDFLARE_R2_BUCKET"], "any"),
        ready: envGroupConfigured(["R2_BUCKET", "S3_BUCKET", "STORAGE_BUCKET", "CLOUDFLARE_R2_BUCKET"], "any"),
        title: "Object Storage",
      },
    },
    freeProvidersAllowed: FREE_PROVIDER_IDS,
    premiumProvidersBlocked: freeMode,
  }
}
