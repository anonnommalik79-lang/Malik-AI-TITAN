import { envValue } from "./env"

export type MalikAIMode = "fast" | "deep" | "pro" | "code" | "photo" | "video" | "memory"

export const MALIK_MODES: MalikAIMode[] = ["fast", "deep", "pro", "code", "photo", "video"]

export function modelChainForMode(mode: MalikAIMode): string[] {
  const chains: Record<MalikAIMode, string[]> = {
    fast: [
      envValue("BEDROCK_FAST_MODEL_ID"),
      envValue("BEDROCK_FAST_FALLBACK_MODEL_ID"),
    ],
    deep: [
      envValue("BEDROCK_DEEP_MODEL_ID"),
      envValue("BEDROCK_DEEP_FALLBACK_MODEL_ID"),
    ],
    pro: [
      envValue("BEDROCK_PRO_MODEL_ID"),
      envValue("BEDROCK_PRO_FALLBACK_MODEL_ID"),
      envValue("BEDROCK_PRO_FALLBACK_2_MODEL_ID"),
    ],
    code: [
      envValue("BEDROCK_CODE_MODEL_ID"),
      envValue("BEDROCK_CODE_FALLBACK_MODEL_ID"),
      envValue("BEDROCK_CODE_FALLBACK_2_MODEL_ID"),
    ],
    photo: [
      envValue("BEDROCK_IMAGE_MODEL_ID"),
      envValue("BEDROCK_IMAGE_FALLBACK_MODEL_ID"),
    ],
    video: [
      envValue("BEDROCK_VIDEO_MODEL_ID"),
      envValue("BEDROCK_VIDEO_FALLBACK_MODEL_ID"),
    ],
    memory: [envValue("BEDROCK_EMBEDDING_MODEL_ID")],
  }
  return chains[mode].filter(Boolean)
}

export function groqModelId(): string {
  return envValue("GROQ_MODEL", envValue("DEFAULT_FAST_MODEL", "llama-3.1-70b-versatile"))
}

export function bedrockLegacyTextModel(): string {
  return envValue("AWS_BEDROCK_TEXT_MODEL", "amazon.nova-pro-v1:0")
}

export function bedrockLegacyImageModel(): string {
  return envValue("AWS_BEDROCK_IMAGE_MODEL", "amazon.nova-canvas-v1:0")
}

export function openaiBaseUrl(): string {
  return envValue("OPENAI_BASE_URL", "https://api.openai.com/v1")
}

export function providerTimeoutMs(): number {
  const raw = Number(process.env.PROVIDER_TIMEOUT_MS || 30_000)
  return Number.isFinite(raw) && raw > 0 ? raw : 30_000
}

export function fallbackCacheMs(): number {
  const raw = Number(process.env.PROVIDER_UNAVAILABLE_CACHE_MS || 600_000)
  return Number.isFinite(raw) && raw > 0 ? raw : 600_000
}
