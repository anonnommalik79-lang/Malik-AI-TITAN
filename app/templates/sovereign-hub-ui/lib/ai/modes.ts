import type { AITaskType } from "./types"
import type { MalikAIMode } from "./config"
import { modelChainForMode } from "./config"
import { groqConfigured } from "./env"

export type ModeRouteStep = {
  provider: "groq" | "aws-bedrock"
  model?: string
  task: AITaskType
}

export function taskForMode(mode: MalikAIMode): AITaskType {
  if (mode === "code") return "code"
  if (mode === "photo") return "image"
  if (mode === "video") return "video"
  return "chat"
}

/** Production provider/model order per mode. Reads model IDs from env only. */
export function routeStepsForMode(mode: MalikAIMode): ModeRouteStep[] {
  const task = taskForMode(mode)
  const steps: ModeRouteStep[] = []

  if (mode === "fast" && groqConfigured()) {
    steps.push({ provider: "groq", task })
  }

  for (const model of modelChainForMode(mode)) {
    steps.push({ provider: "aws-bedrock", model, task })
  }

  return steps
}

export function modeLabel(mode: MalikAIMode): string {
  const labels: Record<MalikAIMode, string> = {
    fast: "Fast AI",
    deep: "Deep Reasoning",
    pro: "Pro Intelligence",
    code: "Code Generation",
    photo: "AI Image Studio",
    video: "AI Video Studio",
    memory: "Memory / Embeddings",
  }
  return labels[mode]
}

export function modeDescription(mode: MalikAIMode): string {
  const descriptions: Record<MalikAIMode, string> = {
    fast: "Low-latency answers for everyday chat and quick tasks.",
    deep: "Structured analysis for startups, research and complex questions.",
    pro: "Investor-grade strategy, long-form reasoning and premium output.",
    code: "TypeScript, Next.js and full-stack code generation via Malik Codex.",
    photo: "Image generation through configured Bedrock image models.",
    video: "Async video jobs with provider status and safe fallbacks.",
    memory: "Embeddings and semantic search when embedding model is configured.",
  }
  return descriptions[mode]
}
