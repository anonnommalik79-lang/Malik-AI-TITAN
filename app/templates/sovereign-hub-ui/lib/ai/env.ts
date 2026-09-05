/** Server-only env helpers. Never log or return secret values. */

export function envPresent(name: string): boolean {
  const value = process.env[name]
  return typeof value === "string" && value.trim().length > 0
}

export function envValue(name: string, fallback = ""): string {
  const value = process.env[name]
  return value?.trim() || fallback
}

export function bedrockRegion(): string {
  return envValue("BEDROCK_REGION", envValue("AWS_REGION", "us-east-1"))
}

export function bedrockPrimaryConfigured(): boolean {
  return (
    envPresent("AWS_BEARER_TOKEN_BEDROCK") ||
    (envPresent("AWS_ACCESS_KEY_ID") && envPresent("AWS_SECRET_ACCESS_KEY"))
  )
}

export function bedrockBackupConfigured(): boolean {
  return envPresent("AWS_BEARER_TOKEN_BEDROCK_BACKUP")
}

export function cerebrasConfigured(): boolean {
  return envPresent("CEREBRAS_API_KEY")
}

export function groqConfigured(): boolean {
  return envPresent("GROQ_API_KEY")
}

export function groqBackupConfigured(): boolean {
  return envPresent("GROQ_API_KEY_BACKUP")
}

export function modelScopeConfigured(): boolean {
  return envPresent("MODELSCOPE_API_KEY")
}

export function aiHubMixConfigured(): boolean {
  return envPresent("AIHUBMIX_API_KEY")
}

export function openaiConfigured(): boolean {
  return envPresent("OPENAI_API_KEY")
}

export function azureConfigured(): boolean {
  return (
    envPresent("AZURE_OPENAI_ENDPOINT") &&
    envPresent("AZURE_OPENAI_KEY") &&
    envPresent("AZURE_OPENAI_DEPLOYMENT")
  )
}

export function photoModelConfigured(): boolean {
  return (
    envPresent("BEDROCK_IMAGE_MODEL_ID") ||
    envPresent("BEDROCK_IMAGE_FALLBACK_MODEL_ID") ||
    envPresent("AWS_BEDROCK_IMAGE_MODEL") ||
    envPresent("FAL_KEY") ||
    envPresent("FAL_API_KEY") ||
    envPresent("OPENAI_API_KEY")
  )
}

export function videoModelConfigured(): boolean {
  return (
    envPresent("BEDROCK_VIDEO_MODEL_ID") ||
    envPresent("BEDROCK_VIDEO_FALLBACK_MODEL_ID") ||
    envPresent("AWS_BEDROCK_VIDEO_MODEL") ||
    envPresent("RUNWAY_API_KEY") ||
    envPresent("LUMA_API_KEY") ||
    envPresent("FAL_KEY") ||
    envPresent("FAL_API_KEY")
  )
}

export function modelsConfigured(): boolean {
  return (
    envPresent("BEDROCK_FAST_MODEL_ID") ||
    envPresent("BEDROCK_DEEP_MODEL_ID") ||
    envPresent("BEDROCK_PRO_MODEL_ID") ||
    envPresent("BEDROCK_CODE_MODEL_ID") ||
    envPresent("AWS_BEDROCK_TEXT_MODEL") ||
    modelScopeConfigured() ||
    aiHubMixConfigured() ||
    cerebrasConfigured() ||
    groqConfigured()
  )
}

export function getSafeEnvSnapshot() {
  return {
    bedrockPrimaryConfigured: bedrockPrimaryConfigured(),
    bedrockBackupConfigured: bedrockBackupConfigured(),
    modelscopeConfigured: modelScopeConfigured(),
    aihubmixConfigured: aiHubMixConfigured(),
    cerebrasConfigured: cerebrasConfigured(),
    groqConfigured: groqConfigured(),
    groqBackupConfigured: groqBackupConfigured(),
    openaiConfigured: openaiConfigured(),
    azureConfigured: azureConfigured(),
    photoModelConfigured: photoModelConfigured(),
    videoModelConfigured: videoModelConfigured(),
    region: bedrockRegion(),
    modelsConfigured: modelsConfigured(),
  }
}
