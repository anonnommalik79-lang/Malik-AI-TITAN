import type { AIProvider, AIRequest, AIResponse } from "../types"
import { providerOrder } from "../provider-order"
import { providerFetch } from "./base"

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
  return process.env.GOOGLE_VEO_API_KEY || process.env.VEO_API_KEY
}

function aspectRatio(input: AIRequest) {
  return String(input.metadata?.aspectRatio || "16:9")
}

function duration(input: AIRequest) {
  const value = Number(input.metadata?.duration || 5)
  return Math.min(10, Math.max(5, value))
}

function queued(provider: "runway" | "luma" | "fal" | "veo", model: string, started: number, output: Record<string, unknown>): AIResponse {
  return {
    success: true,
    provider,
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
      ratio: aspectRatio(input) === "9:16" ? "720:1280" : "1280:720",
      duration: duration(input),
    }),
    signal: input.signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || payload?.message || `Runway returned ${response.status}`)
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
  if (!response.ok) throw new Error(payload?.detail || payload?.message || `Luma returned ${response.status}`)
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
  if (!response.ok) throw new Error(payload?.detail || payload?.message || `FAL queue returned ${response.status}`)
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
  const model = process.env.GOOGLE_VEO_MODEL || "veo-3.1-generate-preview"

  const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: input.prompt }],
      parameters: { aspectRatio: aspectRatio(input) },
    }),
    signal: input.signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || `Google Veo returned ${response.status}`)
  if (!payload?.name) throw new Error("Google Veo returned no operation name")
  return queued("veo", model, started, {
    jobId: payload.name,
    statusUrl: `https://generativelanguage.googleapis.com/v1beta/${payload.name}`,
  })
}

const handlers: Record<string, (input: AIRequest) => Promise<AIResponse>> = {
  runway: generateWithRunway,
  luma: generateWithLuma,
  fal: generateWithFal,
  veo: generateWithVeo,
}

function isConfigured(provider: string) {
  if (provider === "runway") return Boolean(runwayKey())
  if (provider === "luma") return has("LUMA_API_KEY")
  if (provider === "fal") return Boolean(falKey())
  if (provider === "veo") return Boolean(veoKey())
  return false
}

export const videoProviderRouter: AIProvider = {
  id: "openrouter",
  title: "Video Provider Router",
  supports: ["video"],

  healthCheck() {
    return {
      provider: "openrouter",
      configured: Object.keys(handlers).some(isConfigured),
      supports: ["video"],
      models: ["runway", "luma", "fal", "veo"],
      message: "Video router ready. Long-running providers return queued jobs.",
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
    const order = providerOrder("VIDEO_PROVIDER_ORDER", ["runway", "luma", "fal", "veo"], requested)

    for (const provider of order) {
      const handler = handlers[provider]
      if (!handler || !isConfigured(provider)) continue
      try {
        return await handler(input)
      } catch (error) {
        errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    throw new Error(errors.length ? errors.join(" | ") : "No video provider configured. Add RUNWAYML_API_SECRET, LUMA_API_KEY, FAL_KEY or GOOGLE_VEO_API_KEY.")
  },

  async analyzeFile() {
    throw new Error("Video router does not analyze files.")
  },
}
