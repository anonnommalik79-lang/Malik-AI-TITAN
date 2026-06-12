import type { AITaskType } from "./types"
import type { MalikAIMode } from "./config"
import { modelChainForMode } from "./config"

export type ModeRouteStep = {
  provider: "deepseek" | "openrouter" | "aws-bedrock"
  model?: string
  task: AITaskType
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim())
}

function env(name: string, fallback: string) {
  const vipMap: Record<string, string> = {
    TEXT_PROVIDER_ORDER: "TITAN_V65_TEXT_ENGINE_ORDER",
    CODE_PROVIDER_ORDER: "TITAN_V65_CODE_ENGINE_ORDER",
    OPENROUTER_MODEL: "TITAN_V65_OPENROUTER_CHAT_MODEL",
    OPENROUTER_CODE_MODEL: "TITAN_V65_OPENROUTER_CODE_MODEL",
  }

  const vipName = vipMap[name]
  return (vipName ? process.env[vipName]?.trim() : "") || process.env[name]?.trim() || fallback
}


function providerOrder(mode: MalikAIMode) {
  const raw =
    mode === "code"
      ? env("CODE_PROVIDER_ORDER", "openrouter,deepseek")
      : env("TEXT_PROVIDER_ORDER", "openrouter,deepseek")

  const order = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)

  return order.length ? order : ["openrouter", "deepseek"]
}

export function taskForMode(mode: MalikAIMode): AITaskType {
  if (mode === "code") return "code"
  if (mode === "photo") return "image"
  if (mode === "video") return "video"
  return "chat"
}

export function routeStepsForMode(mode: MalikAIMode): ModeRouteStep[] {
  const task = taskForMode(mode)
  const steps: ModeRouteStep[] = []
  const isText = task !== "image" && task !== "video"

  if (isText) {
    for (const provider of providerOrder(mode)) {
      if (provider === "openrouter" && hasEnv("OPENROUTER_API_KEY")) {
        const model =
          mode === "code"
            ? env("OPENROUTER_CODE_MODEL", env("OPENROUTER_MODEL", "deepseek/deepseek-v4-pro"))
            : env("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash")

        steps.push({ provider: "openrouter", model, task })
      }

      if (provider === "deepseek" && hasEnv("DEEPSEEK_API_KEY")) {
        const model =
          mode === "code"
            ? env("DEEPSEEK_CODE_MODEL", env("DEEPSEEK_PRO_MODEL", "deepseek-v4-pro"))
            : mode === "pro" || mode === "deep"
              ? env("DEEPSEEK_PRO_MODEL", env("DEEPSEEK_MODEL", "deepseek-v4-pro"))
              : env("DEEPSEEK_FAST_MODEL", env("DEEPSEEK_MODEL", "deepseek-v4-flash"))

        steps.push({ provider: "deepseek", model, task })
      }
    }
  }

  for (const model of modelChainForMode(mode)) {
    steps.push({ provider: "aws-bedrock", model, task })
  }

  return steps
}

export function modeLabel(mode: MalikAIMode): string {
  const labels: Record<MalikAIMode, string> = {
    fast: "MALIK AI Fast — DeepSeek V4 Flash",
    deep: "MALIK AI Deep — DeepSeek V4 Pro",
    pro: "MALIK AI Pro — DeepSeek V4 Pro",
    code: "MALIK AI Code — DeepSeek V4 Pro",
    photo: "MALIK AI Vision",
    video: "MALIK AI Video",
    memory: "MALIK AI Memory",
  }
  return labels[mode]
}

export function modeDescription(mode: MalikAIMode): string {
  const descriptions: Record<MalikAIMode, string> = {
    fast: "Fast answers, business, study, strategy and daily tasks through DeepSeek V4 Flash.",
    deep: "Deep reasoning, medicine explanations, business analysis, research and planning through DeepSeek V4 Pro.",
    pro: "Premium investor-grade reasoning through DeepSeek V4 Pro.",
    code: "Code, debugging and architecture through DeepSeek V4 Pro.",
    photo: "Image generation through configured image providers.",
    video: "Video generation through configured video providers.",
    memory: "Memory and embeddings when configured.",
  }
  return descriptions[mode]
}
