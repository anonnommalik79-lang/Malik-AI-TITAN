import {
  godModeEnabled,
  imageGodOrder,
  imageProviderFallback,
  imageProviderPrimary,
  maxImagePromptLength,
  maxVideoPromptLength,
  polloVideoEnabled,
  videoGodOrder,
  videoProviderPrimary,
} from "./config"
import { getMediaDailyLimits } from "./limits"
import { malikH3Configured } from "./providers/malik-h3"
import { pingPollinations } from "./providers/pollinations"
import { pingPollo } from "./providers/pollo"
import { pingStability } from "./providers/stability"
import { awsImageConfigured, falImageConfigured } from "./providers/titan-image"
import { videoProviderConfigured } from "./providers/titan-video"
import { isCloudStorageConfigured } from "@/lib/storage/cloud-upload"
import type { MediaProviderHealth } from "./types"

function awsConfigured() {
  return Boolean(process.env.AWS_REGION?.trim() && process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim())
}

export async function getMediaProviderHealth(): Promise<MediaProviderHealth> {
  const [stability, pollinations, pollo] = await Promise.all([pingStability(), pingPollinations(), pingPollo()])
  const limits = getMediaDailyLimits()

  return {
    stability,
    pollinations,
    h3: malikH3Configured() ? "configured" : "missing",
    pollo,
    fal: falImageConfigured() ? "configured" : "missing",
    runway: videoProviderConfigured("runway") ? "configured" : "missing",
    luma: videoProviderConfigured("luma") ? "configured" : "missing",
    veo: videoProviderConfigured("veo") ? "configured" : "missing",
    amazon: awsConfigured() || awsImageConfigured() ? "configured" : "disabled",
    storage: isCloudStorageConfigured() ? "configured" : "missing",
    chatPersistence: "configured",
    limitsPersistence: "configured",
    imageProviderPrimary: imageProviderPrimary(),
    imageProviderFallback: imageProviderFallback(),
    videoProviderPrimary: videoProviderPrimary(),
    imageGodOrder: imageGodOrder(),
    videoGodOrder: videoGodOrder(),
    polloVideoEnabled: polloVideoEnabled(),
    godMode: godModeEnabled(),
    limits: {
      guest: limits.guest,
      free: limits.free,
      premium: limits.premium,
      maxImagePromptLength: maxImagePromptLength(),
      maxVideoPromptLength: maxVideoPromptLength(),
    },
  }
}
