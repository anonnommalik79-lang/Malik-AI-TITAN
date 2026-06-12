export type AITaskType =
  | "chat"
  | "code"
  | "debug"
  | "project"
  | "image"
  | "video"
  | "file_analysis"
  | "research"
  | "voice"
  | "general"
  | "enterprise"

export type AIProviderId =
  | "cloudflare"
  | "local"
  | "malik-identity"
  | "demo-fallback"
  | "kimi"
  | "grok"
  | "nvidia-nim"
  | "gemini"
  | "groq"
  | "deepseek"
  | "openrouter"
  | "openai"
  | "claude"
  | "azure"
  | "aws-bedrock"
  | "stability"
  | "fal"
  | "luma"
  | "runway"
  | "veo"

export type AIPlan = "free" | "pro" | "ultra" | "owner"

export type AIMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type AIFileAttachment = {
  id?: string
  name: string
  mime: string
  size?: number
  kind?: "image" | "video" | "audio" | "file" | "code" | "url"
  text?: string
  url?: string
  base64?: string
}

export type AIRequest = {
  task?: AITaskType
  prompt: string
  messages?: AIMessage[]
  attachments?: AIFileAttachment[]
  userId?: string
  userEmail?: string
  plan?: AIPlan
  provider?: AIProviderId | "auto" | string
  model?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  metadata?: Record<string, unknown>
}

export type AIResponse = {
  success: boolean
  provider: AIProviderId
  model: string
  type: "chat" | "code" | "image" | "video" | "file"
  output: string | Record<string, unknown>
  usage?: Record<string, unknown>
  error?: string
  fallbackChain?: AIProviderId[]
  fallbackUsed?: boolean
  missingEnv?: string[]
  latencyMs: number
}

export type ProviderErrorCode =
  | "MISSING_API_KEY"
  | "MISSING_CREDENTIALS"
  | "PROVIDER_TIMEOUT"
  | "QUOTA_EXCEEDED"
  | "MODEL_UNAVAILABLE"
  | "ACCESS_DENIED"
  | "REGION_NOT_SUPPORTED"
  | "EMPTY_RESPONSE"
  | "UNKNOWN_PROVIDER_ERROR"

export type ProviderError = {
  code: ProviderErrorCode
  provider: AIProviderId
  message: string
  retryable: boolean
  status?: number
}

export type AIProviderHealth = {
  provider: AIProviderId
  configured: boolean
  supports: AITaskType[]
  models: string[]
  message: string
}

export type AIProvider = {
  id: AIProviderId
  title: string
  supports: AITaskType[]
  healthCheck(): AIProviderHealth
  sendMessage(input: AIRequest): Promise<AIResponse>
  generateCode(input: AIRequest): Promise<AIResponse>
  generateImage(input: AIRequest): Promise<AIResponse>
  generateVideo(input: AIRequest): Promise<AIResponse>
  analyzeFile(input: AIRequest): Promise<AIResponse>
}



