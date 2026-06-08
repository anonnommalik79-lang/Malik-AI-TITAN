import type { AIResponse } from "../types"
import { modelChainForMode } from "../config"
import { bedrockConfigured, invokeBedrock } from "./bedrock-provider"

export async function embedWithBedrock(text: string, signal?: AbortSignal): Promise<AIResponse> {
  const started = Date.now()
  const models = modelChainForMode("memory")
  if (!bedrockConfigured() || !models.length) {
    return {
      success: false,
      provider: "aws-bedrock",
      model: "unconfigured",
      type: "file",
      output: "Embedding model is not configured. Set BEDROCK_EMBEDDING_MODEL_ID.",
      error: "EMBED_NOT_CONFIGURED",
      latencyMs: 0,
    }
  }

  const model = models[0]
  try {
    const result = await invokeBedrock(
      `/model/${encodeURIComponent(model)}/invoke`,
      { inputText: text },
      signal,
    )
    const embedding = result?.embedding || result?.embeddings?.[0]?.embedding
    if (!Array.isArray(embedding)) throw new Error("Bedrock returned no embedding vector")
    return {
      success: true,
      provider: "aws-bedrock",
      model,
      type: "file",
      output: { embedding, dimensions: embedding.length },
      latencyMs: Date.now() - started,
    }
  } catch (error) {
    return {
      success: false,
      provider: "aws-bedrock",
      model,
      type: "file",
      output: error instanceof Error ? error.message : "Embedding failed",
      error: "EMBED_FAILED",
      latencyMs: Date.now() - started,
    }
  }
}
