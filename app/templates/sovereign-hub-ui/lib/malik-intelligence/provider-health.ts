import type { ProviderHealth } from "./types"

export function localProviderHealth(): ProviderHealth[] {
  const env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}
  const has = (name: string) => Boolean(env[name]?.trim())

  return [
    { id: "core", title: "MALIK Core", configured: has("OPENAI_API_KEY"), group: "text", score: has("OPENAI_API_KEY") ? 88 : 0, notes: ["text/code"] },
    { id: "reasoning", title: "MALIK Reasoning", configured: has("MOONSHOT_API_KEY"), group: "text", score: has("MOONSHOT_API_KEY") ? 82 : 0, notes: ["reasoning"] },
    { id: "codex", title: "MALIK Codex", configured: has("ANTHROPIC_API_KEY"), group: "code", score: has("ANTHROPIC_API_KEY") ? 80 : 0, notes: ["code"] },
    { id: "vision", title: "MALIK Vision", configured: has("FAL_KEY"), group: "image", score: has("FAL_KEY") ? 92 : 0, notes: ["image"] },
    { id: "cinema", title: "MALIK Cinema", configured: has("LUMA_API_KEY"), group: "video", score: has("LUMA_API_KEY") ? 78 : 0, notes: ["video"] },
    { id: "queue", title: "Render Queue", configured: has("RUNWAYML_API_SECRET") || has("RUNWAY_API_KEY"), group: "video", score: has("RUNWAYML_API_SECRET") ? 84 : 0, notes: ["async render"] },
    { id: "infrastructure", title: "MALIK Infrastructure", configured: has("AWS_REGION"), group: "storage", score: has("AWS_REGION") ? 94 : 0, notes: ["enterprise"] },
  ]
}

export function providerReadinessScore(providers: ProviderHealth[]) {
  if (!providers.length) return 0
  return Math.round(providers.reduce((sum, item) => sum + item.score, 0) / providers.length)
}

