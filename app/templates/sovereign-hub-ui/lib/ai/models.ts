import type { AIProviderId, AITaskType } from "./types"

export const MODEL_REGISTRY: Record<AIProviderId, Partial<Record<AITaskType, string>>> = {
  cloudflare: { image: process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell" },
  local: {},
  "malik-identity": {},
  "demo-fallback": {},
  kimi: {
    chat: process.env.KIMI_MODEL || "kimi-k2.5",
    code: process.env.KIMI_CODE_MODEL || process.env.KIMI_MODEL || "kimi-k2.5",
    debug: process.env.KIMI_CODE_MODEL || process.env.KIMI_MODEL || "kimi-k2.5",
    project: process.env.KIMI_CODE_MODEL || process.env.KIMI_MODEL || "kimi-k2.5",
    research: process.env.KIMI_MODEL || "kimi-k2.5",
  },
  grok: {
    chat: process.env.GROK_MODEL || "grok-3-mini",
    code: process.env.GROK_CODE_MODEL || process.env.GROK_MODEL || "grok-3-mini",
    debug: process.env.GROK_CODE_MODEL || process.env.GROK_MODEL || "grok-3-mini",
    research: process.env.GROK_MODEL || "grok-3-mini",
  },
  "nvidia-nim": {
    chat: process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-70b-instruct",
    code: process.env.NVIDIA_NIM_CODE_MODEL || process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-70b-instruct",
    enterprise: process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-70b-instruct",
  },
  gemini: {
    chat: process.env.GEMINI_MODEL || "gemini-1.5-pro",
    code: process.env.GEMINI_CODE_MODEL || "gemini-1.5-pro",
    file_analysis: process.env.GEMINI_MODEL || "gemini-1.5-pro",
    research: process.env.GEMINI_MODEL || "gemini-1.5-pro",
  },
  groq: {
    chat: process.env.GROQ_MODEL || process.env.DEFAULT_FAST_MODEL || "llama-3.1-70b-versatile",
    code: process.env.GROQ_CODE_MODEL || "llama-3.1-70b-versatile",
    general: process.env.GROQ_MODEL || "llama-3.1-70b-versatile",
  },
  deepseek: {
    chat: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    code: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    debug: process.env.DEEPSEEK_MODEL || "deepseek-reasoner",
    general: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  },
  openrouter: {
    chat: process.env.OPENROUTER_MODEL || "google/gemma-2-9b-it:free",
    code: process.env.OPENROUTER_CODE_MODEL || "google/gemma-2-9b-it:free",
    project: process.env.OPENROUTER_CODE_MODEL || "google/gemma-2-9b-it:free",
    research: process.env.OPENROUTER_MODEL || "google/gemma-2-9b-it:free",
  },
  openai: {
    chat: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    code: process.env.OPENAI_CODE_MODEL || "gpt-4.1",
    debug: process.env.OPENAI_CODE_MODEL || "gpt-4.1",
    project: process.env.OPENAI_CODE_MODEL || "gpt-4.1",
    file_analysis: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  },
  claude: {
    chat: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
    code: process.env.ANTHROPIC_CODE_MODEL || "claude-3-5-sonnet-latest",
    debug: process.env.ANTHROPIC_CODE_MODEL || "claude-3-5-sonnet-latest",
    project: process.env.ANTHROPIC_CODE_MODEL || "claude-3-5-sonnet-latest",
    file_analysis: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
  },
  azure: {
    chat: process.env.AZURE_OPENAI_DEPLOYMENT || "azure-deployment",
    code: process.env.AZURE_OPENAI_DEPLOYMENT || "azure-deployment",
    enterprise: process.env.AZURE_OPENAI_DEPLOYMENT || "azure-deployment",
  },
  "aws-bedrock": {
    chat: process.env.AWS_BEDROCK_TEXT_MODEL || "amazon.nova-pro-v1:0",
    code: process.env.AWS_BEDROCK_CODE_MODEL || process.env.AWS_BEDROCK_TEXT_MODEL || "amazon.nova-pro-v1:0",
    project: process.env.AWS_BEDROCK_TEXT_MODEL || "amazon.nova-pro-v1:0",
    file_analysis: process.env.AWS_BEDROCK_TEXT_MODEL || "amazon.nova-pro-v1:0",
    image: process.env.AWS_BEDROCK_IMAGE_MODEL || "amazon.nova-canvas-v1:0",
    enterprise: process.env.AWS_BEDROCK_TEXT_MODEL || "amazon.nova-pro-v1:0",
  },
  stability: {},
  fal: {},
  luma: {},
  runway: {},
  veo: {},
}

export function modelFor(provider: AIProviderId, task: AITaskType, override?: string) {
  return override || MODEL_REGISTRY[provider]?.[task] || MODEL_REGISTRY[provider]?.chat || "default"
}



