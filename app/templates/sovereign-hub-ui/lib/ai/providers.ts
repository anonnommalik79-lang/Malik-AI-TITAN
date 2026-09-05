import type { AIProvider, AITaskType } from "./types"
import { geminiProvider } from "./providers/gemini"
import { cerebrasProvider } from "./providers/cerebras"
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
import { mistralProvider } from "./providers/mistral"
import { aiHubMixProvider, modelScopeProvider } from "./providers/daily-openai"

export const WORLD_TITANS_PROVIDERS: AIProvider[] = [
  modelScopeProvider,
  aiHubMixProvider,
  geminiProvider,
  mistralProvider,
  cerebrasProvider,
  deepSeekProvider,
  openRouterProvider,
  kimiProvider,
  claudeProvider,
  openAIProvider,
  grokProvider,
  awsBedrockProvider,
  nvidiaNimProvider,
  azureProvider,
  groqProvider,
]

/**
 * Free daily providers now lead the automatic chain when they are configured.
 * ModelScope carries the large Qwen/GLM/ERNIE pool. AIHubMix carries the
 * zero-cost daily GLM/Kimi fallbacks and becomes the first code/file lane.
 */
const ROUTING_ORDER: Record<AITaskType, string[]> = {
  chat: ["modelscope", "aihubmix", "gemini", "cerebras", "groq", "mistral", "openrouter", "deepseek", "kimi", "openai", "claude", "grok", "aws-bedrock", "nvidia-nim", "azure"],
  code: ["aihubmix", "modelscope", "gemini", "mistral", "cerebras", "groq", "deepseek", "openrouter", "openai", "kimi", "claude", "grok", "nvidia-nim", "aws-bedrock", "azure"],
  debug: ["aihubmix", "modelscope", "gemini", "mistral", "cerebras", "deepseek", "openrouter", "openai", "kimi", "claude", "grok", "aws-bedrock"],
  project: ["aihubmix", "modelscope", "gemini", "mistral", "cerebras", "deepseek", "openrouter", "openai", "kimi", "claude", "grok", "aws-bedrock", "azure"],
  image: ["aws-bedrock"],
  video: [],
  file_analysis: ["aihubmix", "modelscope", "gemini", "deepseek", "openrouter", "openai", "claude", "aws-bedrock", "azure"],
  research: ["modelscope", "aihubmix", "gemini", "cerebras", "groq", "mistral", "deepseek", "openrouter", "openai", "claude", "aws-bedrock"],
  voice: [],
  general: ["modelscope", "aihubmix", "gemini", "cerebras", "groq", "mistral", "openrouter", "deepseek", "openai", "claude"],
  enterprise: ["modelscope", "aihubmix", "gemini", "mistral", "deepseek", "openrouter", "aws-bedrock", "nvidia-nim", "azure", "openai", "claude"],
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
