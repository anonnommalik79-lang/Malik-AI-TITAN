import type { AIRequest, AIResponse } from "../types"
import { bedrockLegacyImageModel, modelChainForMode } from "../config"
import { bedrockConfigured, invokeBedrock } from "./bedrock-provider"

export async function generateBedrockImage(input: AIRequest): Promise<AIResponse> {
  const started = Date.now()
  if (!bedrockConfigured()) {
    return {
      success: false,
      provider: "aws-bedrock",
      model: "unconfigured",
      type: "image",
      output: "Image generation provider is not configured.",
      error: "BEDROCK_NOT_CONFIGURED",
      latencyMs: 0,
    }
  }

  const models = modelChainForMode("photo")
  const candidates = models.length ? models : [bedrockLegacyImageModel()]
  let lastError = "Image generation failed"

  for (const model of candidates) {
    try {
      const result = await invokeBedrock(
        `/model/${encodeURIComponent(model)}/invoke`,
        {
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
        },
        input.signal,
      )
      const base64 = result?.images?.[0]
      if (!base64) throw new Error("Bedrock returned no image")
      return {
        success: true,
        provider: "aws-bedrock",
        model,
        type: "image",
        output: { resultUrl: `data:image/png;base64,${base64}`, provider: "aws-bedrock", model },
        latencyMs: Date.now() - started,
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError
    }
  }

  return {
    success: false,
    provider: "aws-bedrock",
    model: candidates[0] || "image",
    type: "image",
    output: lastError,
    error: "IMAGE_GENERATION_FAILED",
    latencyMs: Date.now() - started,
  }
}
