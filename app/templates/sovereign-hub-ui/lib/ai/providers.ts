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

export const WORLD_TITANS_PROVIDERS: AIProvider[] = [
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
 * Order matters more than the list does: whatever sits first is what writes the
 * code, and everything after it only runs when the one before failed.
 *
 * Anything that builds - code, debug, project, and so the website builder -
 * now leads with Gemini and then Codestral. Gemini is the strongest thing
 * configured on this deployment and the best of them at front-end work;
 * Codestral is trained for code rather than talked into it. Both have free
 * tiers that renew, which is what makes them a sane default rather than a
 * one-off.
 *
 * Cerebras stays in the list as a fast fallback, but it no longer leads: it was
 * first for every building task while being asked for a model it does not
 * serve, so it failed on every request and dragged the whole chain down to the
 * generic local template.
 */
const ROUTING_ORDER: Record<AITaskType, string[]> = {
  chat: ["gemini", "cerebras", "groq", "mistral", "openrouter", "deepseek", "kimi", "openai", "claude", "grok", "aws-bedrock", "nvidia-nim", "azure"],
  code: ["gemini", "mistral", "cerebras", "groq", "deepseek", "openrouter", "openai", "kimi", "claude", "grok", "nvidia-nim", "aws-bedrock", "azure"],
  debug: ["gemini", "mistral", "cerebras", "deepseek", "openrouter", "openai", "kimi", "claude", "grok", "aws-bedrock"],
  project: ["gemini", "mistral", "cerebras", "deepseek", "openrouter", "openai", "kimi", "claude", "grok", "aws-bedrock", "azure"],
  image: ["aws-bedrock"],
  video: [],
  file_analysis: ["gemini", "deepseek", "openrouter", "openai", "claude", "aws-bedrock", "azure"],
  research: ["gemini", "cerebras", "groq", "mistral", "deepseek", "openrouter", "openai", "claude", "aws-bedrock"],
  voice: [],
  general: ["gemini", "cerebras", "groq", "mistral", "openrouter", "deepseek", "openai", "claude"],
  enterprise: ["gemini", "mistral", "deepseek", "openrouter", "aws-bedrock", "nvidia-nim", "azure", "openai", "claude"],
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
