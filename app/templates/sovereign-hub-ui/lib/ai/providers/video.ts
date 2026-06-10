import type { AIProvider, AIProviderId, AIRequest, AIResponse } from "../types"
import { providerOrder } from "../provider-order"
import { providerFetch } from "./base"

type VideoProviderId = "aws-bedrock" | "runway" | "luma" | "fal" | "veo"

const GEMINI_VIDEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

function has(name: string) {
  return Boolean(process.env[name]?.trim())
}

function falKey() {
  return process.env.FAL_KEY || process.env.FAL_API_KEY
}

function runwayKey() {
  return process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY
}

function veoKey() {
  return process.env.GOOGLE_VEO_API_KEY || process.env.VEO_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
}

function bedrockBearerToken() {
  return process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.BEDROCK_API_KEY || process.env.AWS_BEDROCK_API_KEY
}

function bedrockRegion() {
  return process.env.BEDROCK_REGION || process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || "us-east-1"
}

function bedrockVideoModel() {
  return (
    process.env.BEDROCK_VIDEO_MODEL_ID ||
    process.env.AWS_BEDROCK_VIDEO_MODEL ||
    process.env.BEDROCK_VIDEO_MODEL ||
    "amazon.nova-reel-v1:0"
  )
}

function bedrockVideoFallbackModel() {
  return process.env.BEDROCK_VIDEO_FALLBACK_MODEL_ID || ""
}

function bedrockOutputS3Uri() {
  return (
    process.env.BEDROCK_VIDEO_OUTPUT_S3_URI ||
    process.env.AWS_BEDROCK_VIDEO_OUTPUT_S3_URI ||
    process.env.VIDEO_OUTPUT_S3_URI ||
    ""
  )
}

function aspectRatio(input: AIRequest) {
  const value = String(input.metadata?.aspectRatio || input.metadata?.format || "16:9")
  return value === "9:16" ? "9:16" : "16:9"
}

function duration(input: AIRequest) {
  const value = Number(input.metadata?.duration || 5)
  return Math.min(10, Math.max(5, value))
}

function runwayRatio(input: AIRequest) {
  return aspectRatio(input) === "9:16" ? "720:1280" : "1280:720"
}

function bedrockDimension(input: AIRequest) {
  return aspectRatio(input) === "9:16" ? "720x1280" : "1280x720"
}

function safeSeed() {
  return Math.floor(Math.random() * 2_147_483_647)
}

function queued(
  provider: VideoProviderId,
  model: string,
  started: number,
  output: Record<string, unknown>,
): AIResponse {
  return {
    success: true,
    provider: provider as AIProviderId,
    model,
    type: "video",
    output: {
      provider,
      model,
      status: "queued",
      ...output,
    },
    latencyMs: Date.now() - started,
  }
}

function extractJsonError(payload: any, fallback: string) {
  return payload?.error?.message || payload?.error || payload?.message || payload?.detail || fallback
}

async function generateWithBedrock(input: AIRequest) {
  const started = Date.now()
  const token = bedrockBearerToken()
  const s3Uri = bedrockOutputS3Uri()
  const region = bedrockRegion()
  const model = bedrockVideoModel()
  const fallbackModel = bedrockVideoFallbackModel()

  if (!token) throw new Error("AWS_BEARER_TOKEN_BEDROCK / BEDROCK_API_KEY not configured")
  if (!s3Uri) throw new Error("BEDROCK_VIDEO_OUTPUT_S3_URI not configured")

  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/async-invoke`

  function payloadFor(modelId: string) {
    return {
      modelId,
      modelInput: {
        taskType: "TEXT_VIDEO",
        textToVideoParams: {
          text: input.prompt,
        },
        videoGenerationConfig: {
          durationSeconds: duration(input),
          fps: 24,
          dimension: bedrockDimension(input),
          seed: safeSeed(),
        },
      },
      outputDataConfig: {
        s3OutputDataConfig: {
          s3Uri,
        },
      },
    }
  }

  async function start(modelId: string) {
    const response = await providerFetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payloadFor(modelId)),
      signal: input.signal,
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(extractJsonError(payload, `Bedrock video returned ${response.status}`))
    }

    const invocationArn = payload?.invocationArn || payload?.invocationId || payload?.id
    if (!invocationArn) throw new Error("Bedrock video returned no invocationArn")

    return queued("aws-bedrock", modelId, started, {
      jobId: invocationArn,
      invocationArn,
      statusUrl: `/api/ai/video/status?provider=aws-bedrock&jobId=${encodeURIComponent(invocationArn)}`,
      outputS3Uri: s3Uri,
    })
  }

  try {
    return await start(model)
  } catch (error) {
    if (!fallbackModel) throw error
    return await start(fallbackModel)
  }
}

async function generateWithRunway(input: AIRequest) {
  const started = Date.now()
  const key = runwayKey()
  if (!key) throw new Error("RUNWAYML_API_SECRET or RUNWAY_API_KEY not configured")
  const model = process.env.RUNWAY_VIDEO_MODEL || "gen4.5"

  const response = await providerFetch("https://api.dev.runwayml.com/v1/text_to_video", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      model,
      promptText: input.prompt,
      ratio: runwayRatio(input),
      duration: duration(input),
    }),
    signal: input.signal,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractJsonError(payload, `Runway returned ${response.status}`))
  if (!payload?.id) throw new Error("Runway returned no task id")

  return queued("runway", model, started, {
    jobId: payload.id,
    statusUrl: `https://api.dev.runwayml.com/v1/tasks/${payload.id}`,
  })
}

async function generateWithLuma(input: AIRequest) {
  const started = Date.now()
  const key = process.env.LUMA_API_KEY
  if (!key) throw new Error("LUMA_API_KEY not configured")
  const model = process.env.LUMA_VIDEO_MODEL || "ray-2"

  const response = await providerFetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: input.prompt,
      model,
      resolution: "720p",
      duration: `${duration(input)}s`,
      aspect_ratio: aspectRatio(input),
    }),
    signal: input.signal,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractJsonError(payload, `Luma returned ${response.status}`))
  if (!payload?.id) throw new Error("Luma returned no generation id")

  return queued("luma", model, started, {
    jobId: payload.id,
    statusUrl: `https://api.lumalabs.ai/dream-machine/v1/generations/${payload.id}`,
  })
}

async function generateWithFal(input: AIRequest) {
  const started = Date.now()
  const key = falKey()
  if (!key) throw new Error("FAL_KEY or FAL_API_KEY not configured")
  const model = process.env.FAL_VIDEO_MODEL || "fal-ai/minimax-video"

  const response = await providerFetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: {
      authorization: `Key ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prompt: input.prompt }),
    signal: input.signal,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractJsonError(payload, `FAL queue returned ${response.status}`))
  if (!payload?.request_id) throw new Error("FAL returned no request id")

  return queued("fal", model, started, {
    jobId: payload.request_id,
    statusUrl: payload.status_url,
    responseUrl: payload.response_url,
    cancelUrl: payload.cancel_url,
  })
}

async function generateWithVeo(input: AIRequest) {
  const started = Date.now()
  const key = veoKey()
  if (!key) throw new Error("GOOGLE_VEO_API_KEY or VEO_API_KEY not configured")

  const model = process.env.GOOGLE_VEO_MODEL || process.env.VEO_MODEL || "veo-3.1-generate-preview"
  const endpoint = `${GEMINI_VIDEO_BASE_URL}/models/${model}:predictLongRunning`

  const response = await providerFetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      instances: [{ prompt: input.prompt }],
      parameters: {
        aspectRatio: aspectRatio(input),
      },
    }),
    signal: input.signal,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractJsonError(payload, `Google Veo returned ${response.status}`))

  const operationName = payload?.name
  if (!operationName) throw new Error("Google Veo returned no operation name")

  return queued("veo", model, started, {
    jobId: operationName,
    operationName,
    statusUrl: `${GEMINI_VIDEO_BASE_URL}/${operationName}`,
  })
}

const handlers: Record<string, (input: AIRequest) => Promise<AIResponse>> = {
  "aws-bedrock": generateWithBedrock,
  runway: generateWithRunway,
  luma: generateWithLuma,
  fal: generateWithFal,
  veo: generateWithVeo,
}

function isConfigured(provider: string) {
  if (provider === "aws-bedrock") return Boolean(bedrockBearerToken()) && Boolean(bedrockOutputS3Uri())
  if (provider === "runway") return Boolean(runwayKey())
  if (provider === "luma") return has("LUMA_API_KEY")
  if (provider === "fal") return Boolean(falKey())
  if (provider === "veo") return Boolean(veoKey())
  return false
}

export const videoProviderRouter: AIProvider = {
  id: "veo",
  title: "Video Provider Router",
  supports: ["video"],

  healthCheck() {
    const providers = Object.keys(handlers)
    const configured = providers.filter(isConfigured)

    return {
      provider: "veo",
      configured: configured.length > 0,
      supports: ["video"],
      models: providers,
      message: configured.length
        ? `Video router ready. Configured: ${configured.join(", ")}. Long-running providers return queued jobs.`
        : "No video provider configured. Add GOOGLE_VEO_API_KEY, FAL_KEY, LUMA_API_KEY, Runway, or AWS Bedrock video keys.",
    }
  },

  async sendMessage(input) {
    return this.generateVideo(input)
  },

  async generateCode() {
    throw new Error("Video router does not generate code.")
  },

  async generateImage() {
    throw new Error("Video router does not generate images.")
  },

  async generateVideo(input: AIRequest): Promise<AIResponse> {
    const errors: string[] = []
    const requested = input.provider || String(input.metadata?.requestedProvider || "")
    const order = providerOrder("VIDEO_PROVIDER_ORDER", ["veo", "fal", "luma", "runway", "aws-bedrock"], requested)

    for (const provider of order) {
      const handler = handlers[provider]
      if (!handler) continue

      if (!isConfigured(provider)) {
        errors.push(`${provider}: not configured`)
        continue
      }

      try {
        return await handler(input)
      } catch (error) {
        errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    throw new Error(
      errors.length
        ? errors.join(" | ")
        : "No video provider configured. Add GOOGLE_VEO_API_KEY, FAL_KEY, LUMA_API_KEY, RUNWAYML_API_SECRET, or AWS Bedrock video keys.",
    )
  },

  async analyzeFile() {
    throw new Error("Video router does not analyze files.")
  },
}
