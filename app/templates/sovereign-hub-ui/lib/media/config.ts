export function getStabilityApiKey(): string | null {
  const key = process.env.STABILITY_API_KEY?.trim()
  return key || null
}

export function getPolloApiKey(): string | null {
  const key = process.env.POLLO_API_KEY?.trim()
  return key || null
}

export function imageProviderPrimary(): string {
  return process.env.IMAGE_PROVIDER_PRIMARY?.trim() || "stability"
}

export function imageProviderFallback(): string {
  return process.env.IMAGE_PROVIDER_FALLBACK?.trim() || "pollinations"
}

export function imageFreeMode(): boolean {
  return process.env.IMAGE_FREE_MODE?.trim().toLowerCase() !== "false"
}

export function videoProviderPrimary(): string {
  const explicit = process.env.VIDEO_PROVIDER_PRIMARY?.trim()
  if (explicit) return explicit
  return process.env.MALIKVIDEO_H3_ENABLED?.trim().toLowerCase() === "true" ? "h3" : "dashscope"
}

export function polloVideoModel(): string {
  return process.env.POLLO_VIDEO_MODEL?.trim() || "pollo-v2-0"
}

export function polloVideoEnabled(): boolean {
  return process.env.POLLO_VIDEO_ENABLED?.trim().toLowerCase() === "true"
}

export function maxImagePromptLength(): number {
  const n = Number(process.env.MAX_IMAGE_PROMPT_LENGTH || 1500)
  return Number.isFinite(n) && n > 0 ? n : 1500
}

export function maxVideoPromptLength(): number {
  const n = Number(process.env.MAX_VIDEO_PROMPT_LENGTH || 5000)
  return Number.isFinite(n) && n > 0 ? n : 5000
}

export function imageProviderTimeoutMs(): number {
  // This is an availability ceiling, not a quality knob. Successful renders use
  // exactly the same model, steps, guidance and prompt as before. A dead image
  // endpoint simply stops holding the whole sequential fallback chain for 90s.
  const n = Number(process.env.IMAGE_PROVIDER_TIMEOUT_MS || 20_000)
  return Number.isFinite(n) && n > 0 ? n : 20_000
}

export function imagePromptCompilerTimeoutMs(): number {
  const n = Number(process.env.IMAGE_PROMPT_COMPILER_TIMEOUT_MS || 8_000)
  return Number.isFinite(n) && n > 0 ? n : 8_000
}

export function pollinationsTimeoutMs(): number {
  // Pollinations is the last-resort route. Keep it inside the same browser
  // request window instead of letting the UI time out while the server carries on.
  const n = Number(process.env.POLLINATIONS_TIMEOUT_MS || 18_000)
  return Number.isFinite(n) && n > 0 ? n : 18_000
}

export const POLLO_API_BASE = "https://pollo.ai/api/platform"

export function imageGodOrder(): string[] {
  const raw = process.env.IMAGE_GOD_PROVIDER_ORDER || process.env.IMAGE_PROVIDER_ORDER || "stability,fal,aws-bedrock,pollinations"
  return raw.split(",").map((s) => s.trim()).filter(Boolean)
}

export function videoGodOrder(): string[] {
  const raw = process.env.VIDEO_GOD_PROVIDER_ORDER || process.env.VIDEO_PROVIDER_ORDER || "h3,dashscope,pollo,runway,fal,luma,veo"
  const order = raw.split(",").map((s) => s.trim()).filter(Boolean)

  // Preserve the old production behavior for deployments that have not opted
  // into H3 yet: DashScope remains first. Once `h3` is explicitly present in
  // the order, its position is respected and DashScope becomes a fallback.
  if (!order.includes("h3")) return order.includes("dashscope") ? order : ["dashscope", ...order]
  return order.includes("dashscope") ? order : [...order, "dashscope"]
}

export function godModeEnabled(): boolean {
  return process.env.MALIK_GOD_MODE?.trim().toLowerCase() !== "false"
}
