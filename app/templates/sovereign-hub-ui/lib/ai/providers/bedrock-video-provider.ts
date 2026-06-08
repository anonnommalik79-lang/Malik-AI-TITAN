import type { AIResponse } from "../types"
import { modelChainForMode } from "../config"
import { bedrockConfigured } from "./bedrock-provider"

export type VideoJobStatus = "queued" | "processing" | "pending_implementation" | "failed" | "ready"

export function createBedrockVideoJob(prompt: string): AIResponse {
  const models = modelChainForMode("video")
  const configured = bedrockConfigured() && models.length > 0
  const jobId = crypto.randomUUID()

  if (!configured) {
    return {
      success: false,
      provider: "aws-bedrock",
      model: "unconfigured",
      type: "video",
      output: {
        jobId,
        status: "failed" as VideoJobStatus,
        message: "Video provider is not configured. Set BEDROCK_VIDEO_MODEL_ID in Render.",
      },
      error: "VIDEO_NOT_CONFIGURED",
      latencyMs: 0,
    }
  }

  return {
    success: true,
    provider: "aws-bedrock",
    model: models[0],
    type: "video",
    output: {
      jobId,
      status: "pending_implementation" as VideoJobStatus,
      message:
        "Video provider is configured. Full Nova Reel async pipeline requires S3 output wiring; job structure is ready.",
      prompt,
      models,
      pollUrl: `/api/ai/video/status?jobId=${jobId}`,
    },
    latencyMs: 0,
  }
}
