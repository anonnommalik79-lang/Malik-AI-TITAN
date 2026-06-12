import type { AIProvider, AITaskType } from "./types"
import { geminiProvider } from "./providers/gemini"
import { groqProvider } from "./providers/groq"
import { openRouterProvider } from "./providers/openrouter"
import { openAIProvider } from "./providers/openai"
import { claudeProvider } from "./providers/claude"
import { azureProvider } from "./providers/azure"
import { awsBedrockProvider } from "./providers/aws-bedrock"
import { deepSeekProvider } from "./providers/deepseek"
import { providerOrder } from "./provider-order"
import { kimiProvider } from "./providers/kimi"
import { grokProvider } from "./providers/grok"
import { nvidiaNimProvider } from "./providers/nvidia-nim"

export const WORLD_TITANS_PROVIDERS: AIProvider[] = [
  deepSeekProvider,
  openRouterProvider,
  kimiProvider,
  geminiProvider,
  claudeProvider,
  openAIProvider,
  grokProvider,
  awsBedrockProvider,
  nvidiaNimProvider,
  azureProvider,
  groqProvider,
]

const ROUTING_ORDER: Record<AITaskType, string[]> = {
  chat: ["deepseek", "openrouter", "kimi", "openai", "claude", "gemini", "grok", "aws-bedrock", "nvidia-nim", "azure", "groq"],
  code: ["deepseek", "openrouter", "openai", "kimi", "claude", "gemini", "grok", "nvidia-nim", "aws-bedrock", "azure", "groq"],
  debug: ["deepseek", "openrouter", "openai", "kimi", "claude", "gemini", "grok", "aws-bedrock"],
  project: ["deepseek", "openrouter", "openai", "kimi", "claude", "gemini", "grok", "aws-bedrock", "azure"],
  image: ["aws-bedrock"],
  video: [],
  file_analysis: ["deepseek", "openrouter", "gemini", "openai", "claude", "aws-bedrock", "azure"],
  research: ["deepseek", "openrouter", "gemini", "openai", "claude", "aws-bedrock", "groq"],
  voice: [],
  general: ["deepseek", "openrouter", "gemini", "openai", "claude", "groq"],
  enterprise: ["deepseek", "openrouter", "aws-bedrock", "nvidia-nim", "azure", "gemini", "openai", "claude"],
}

export function providersForTask(task: AITaskType, requestedProvider?: string, allowedProviderIds?: string[]) {
  const envName = task === "code" || task === "debug" || task === "project" ? "CODE_PROVIDER_ORDER" : "TEXT_PROVIDER_ORDER"
  const order = providerOrder(envName, ROUTING_ORDER[task] || ROUTING_ORDER.chat, requestedProvider)
  const allowed = allowedProviderIds?.length ? new Set(allowedProviderIds) : null
  return [...WORLD_TITANS_PROVIDERS]
    .filter((provider) => provider.supports.includes(task) || provider.supports.includes("general"))
    .filter((provider) => !allowed || allowed.has(provider.id))
    .sort((a, b) => {
      const ai = order.indexOf(a.id)
      const bi = order.indexOf(b.id)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
}

export function providerStatus() {
  return WORLD_TITANS_PROVIDERS.map((provider) => provider.healthCheck())
}
