import type { AIProviderId, AITaskType } from "./types"

export const MODEL_REGISTRY: Record<AIProviderId, Partial<Record<AITaskType, string>>> = {
  cloudflare: { image: process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell" },
  local: {},
  "malik-identity": {},
  "demo-fallback": {},
  modelscope: {
    chat: process.env.MALIK_QWEN_MODEL || process.env.MODELSCOPE_CHAT_MODEL || "Qwen/Qwen3.5-397B-A17B",
    code: process.env.MALIK_REASON_MODEL || process.env.MODELSCOPE_REASON_MODEL || process.env.MALIK_QWEN_MODEL || "Qwen/Qwen3.5-397B-A17B",
    debug: process.env.MALIK_REASON_MODEL || process.env.MODELSCOPE_REASON_MODEL || process.env.MALIK_QWEN_MODEL || "Qwen/Qwen3.5-397B-A17B",
    project: process.env.MALIK_REASON_MODEL || process.env.MODELSCOPE_REASON_MODEL || process.env.MALIK_QWEN_MODEL || "Qwen/Qwen3.5-397B-A17B",
    file_analysis: process.env.MALIK_QWEN_MODEL || process.env.MODELSCOPE_CHAT_MODEL || "Qwen/Qwen3.5-397B-A17B",
    research: process.env.MALIK_REASON_MODEL || process.env.MODELSCOPE_REASON_MODEL || process.env.MALIK_QWEN_MODEL || "Qwen/Qwen3.5-397B-A17B",
    general: process.env.MALIK_QWEN_MODEL || process.env.MODELSCOPE_CHAT_MODEL || "Qwen/Qwen3.5-397B-A17B",
    enterprise: process.env.MALIK_REASON_MODEL || process.env.MODELSCOPE_REASON_MODEL || process.env.MALIK_QWEN_MODEL || "Qwen/Qwen3.5-397B-A17B",
  },
  aihubmix: {
    chat: process.env.AIHUBMIX_PRIMARY_MODEL || "coding-glm-5.3-free",
    code: process.env.AIHUBMIX_PRIMARY_MODEL || "coding-glm-5.3-free",
    debug: process.env.AIHUBMIX_PRIMARY_MODEL || "coding-glm-5.3-free",
    project: process.env.AIHUBMIX_PRIMARY_MODEL || "coding-glm-5.3-free",
    file_analysis: process.env.AIHUBMIX_VISION_MODEL || "coding-kimi-k3-free",
    research: process.env.AIHUBMIX_PRIMARY_MODEL || "coding-glm-5.3-free",
    general: process.env.AIHUBMIX_PRIMARY_MODEL || "coding-glm-5.3-free",
    enterprise: process.env.AIHUBMIX_PRIMARY_MODEL || "coding-glm-5.3-free",
  },
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
  // Gemini's model id is resolved at call time from a candidate list, because a
  // hardcoded one goes stale and takes the whole provider down with it - this
  // entry said "gemini-1.5-pro", retired long ago, so every request to the
  // strongest configured provider returned 404 and the site builder fell
  // through to its generic local template. See providers/gemini.ts.
  gemini: {
    chat: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    code: process.env.GEMINI_CODE_MODEL || "gemini-2.5-pro",
    debug: process.env.GEMINI_CODE_MODEL || "gemini-2.5-pro",
    project: process.env.GEMINI_CODE_MODEL || "gemini-2.5-pro",
    file_analysis: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    research: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    general: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },
  // Codestral is trained for code rather than talked into it, and the free
  // allowance is measured in tokens per month, which suits a builder whose one
  // request is an entire HTML document.
  mistral: {
    chat: process.env.MISTRAL_MODEL || "mistral-large-latest",
    code: process.env.MISTRAL_CODE_MODEL || "codestral-latest",
    debug: process.env.MISTRAL_CODE_MODEL || "codestral-latest",
    project: process.env.MISTRAL_CODE_MODEL || "codestral-latest",
    research: process.env.MISTRAL_MODEL || "mistral-large-latest",
    general: process.env.MISTRAL_MODEL || "mistral-large-latest",
  },
  cerebras: {
    chat: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    // "zai-glm-4.7" is a Z.AI model; Cerebras does not serve it, so every code
    // and project request to Cerebras failed. It runs gpt-oss-120b, which is
    // what its own health check reports.
    code: process.env.CEREBRAS_CODE_MODEL || "gpt-oss-120b",
    debug: process.env.CEREBRAS_CODE_MODEL || "gpt-oss-120b",
    project: process.env.CEREBRAS_CODE_MODEL || "gpt-oss-120b",
    research: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    general: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
  },
  groq: {
    // "llama-3.1-70b-versatile" was decommissioned by Groq. gpt-oss is what the
    // repo's own Voice router already calls Groq with, so it is known to work.
    chat: process.env.GROQ_MODEL || process.env.DEFAULT_FAST_MODEL || "openai/gpt-oss-20b",
    code: process.env.GROQ_CODE_MODEL || "openai/gpt-oss-120b",
    general: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
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
