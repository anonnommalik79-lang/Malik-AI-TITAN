import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { bedrockConfigured, invokeBedrock } from "./bedrock-provider"
import { health, responseType } from "./base"

function configured() {
  return bedrockConfigured()
}

function bedrockError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "")
  const value = raw.toLowerCase()
  if (value.includes("missing") || value.includes("credential")) return "[MISSING_CREDENTIALS] AWS Bedrock credentials are missing."
  if (value.includes("accessdenied") || value.includes("403") || value.includes("not authorized")) return "[ACCESS_DENIED] AWS Bedrock access denied. Check IAM and model access."
  if (value.includes("model") && (value.includes("enabled") || value.includes("access") || value.includes("not"))) return "[MODEL_UNAVAILABLE] Bedrock model is not enabled in this account/region."
  if (value.includes("quota") || value.includes("throttl") || value.includes("429")) return "[QUOTA_EXCEEDED] AWS Bedrock quota exceeded or throttled."
  if (value.includes("region") || value.includes("endpoint")) return "[REGION_NOT_SUPPORTED] AWS Bedrock region/endpoint not supported."
  if (value.includes("timeout") || value.includes("aborted")) return "[PROVIDER_TIMEOUT] AWS Bedrock request timed out."
  return raw || "AWS Bedrock request failed."
}

async function bedrockRequest(path: string, body: Record<string, unknown>, signal?: AbortSignal) {
  return invokeBedrock(path, body, signal)
}

function bedrockMessages(input: AIRequest) {
  const messages = input.messages?.length ? input.messages : [{ role: "user" as const, content: input.prompt }]
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: [{ text: message.content }],
    }))
}

export const awsBedrockProvider: AIProvider = {
  id: "aws-bedrock",
  title: "AWS Bedrock",
  supports: ["chat", "code", "debug", "project", "image", "file_analysis", "research", "general", "enterprise"],

  healthCheck() {
    return health("aws-bedrock", configured(), this.supports, [
      modelFor("aws-bedrock", "chat"),
      modelFor("aws-bedrock", "image"),
    ], configured() ? "configured" : "missing Bedrock credentials (bearer token or AWS keys)")
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    try {
      if (!configured()) throw new Error("missing AWS Bedrock credentials")
      const model = modelFor("aws-bedrock", input.task || "chat", input.model)
      const system = input.messages?.find((message) => message.role === "system")?.content
      const result = await bedrockRequest(`/model/${encodeURIComponent(model)}/converse`, {
        ...(system ? { system: [{ text: system }] } : {}),
        messages: bedrockMessages(input),
        inferenceConfig: {
          maxTokens: input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1600),
          temperature: input.temperature ?? 0.35,
        },
      }, input.signal)
      const output = result?.output?.message?.content?.map((part: { text?: string }) => part.text || "").join("") || ""
      if (!output) throw new Error("AWS Bedrock returned an empty response")
      return {
        success: true,
        provider: "aws-bedrock",
        model,
        type: responseType(input.task),
        output,
        usage: result?.usage,
        latencyMs: Date.now() - started,
      }
    } catch (error) {
      throw new Error(bedrockError(error), { cause: error })
    }
  },

  async generateCode(input) {
    return this.sendMessage({ ...input, task: input.task || "code" })
  },

  async generateImage(input) {
    const started = Date.now()
    try {
      if (!configured()) throw new Error("missing AWS Bedrock credentials")
      const model = modelFor("aws-bedrock", "image", input.model)
      const result = await bedrockRequest(`/model/${encodeURIComponent(model)}/invoke`, {
        taskType: "TEXT_IMAGE",
        textToImageParams: { text: input.prompt },
        imageGenerationConfig: {
          numberOfImages: 1,
          quality: "standard",
          width: 1024,
          height: 1024,
          cfgScale: 8,
          seed: Math.floor(Math.random() * 858_993_460),
        },
      }, input.signal)
      const base64 = result?.images?.[0]
      if (!base64) throw new Error("AWS Bedrock Nova Canvas returned no image")
      return {
        success: true,
        provider: "aws-bedrock",
        model,
        type: "image",
        output: {
          resultUrl: `data:image/png;base64,${base64}`,
          provider: "aws-bedrock",
          model,
        },
        latencyMs: Date.now() - started,
      }
    } catch (error) {
      throw new Error(bedrockError(error), { cause: error })
    }
  },

  async generateVideo() {
    throw new Error("AWS Bedrock video generation requires an async model-specific worker.")
  },

  async analyzeFile(input) {
    return this.sendMessage({ ...input, task: "file_analysis" })
  },
}
