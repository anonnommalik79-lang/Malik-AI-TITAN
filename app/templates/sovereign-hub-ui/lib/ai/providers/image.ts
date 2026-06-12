import type { AIProvider, AIRequest, AIResponse } from "../types"
import { providerOrder } from "../provider-order"
import { awsBedrockProvider } from "./aws-bedrock"
import { providerFetch } from "./base"

function configured(name: string) {
  return Boolean(process.env[name]?.trim())
}

function falKey() {
  return process.env.FAL_KEY || process.env.FAL_API_KEY
}

function cloudflareAccountId() {
  return process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || ""
}

function cloudflareApiToken() {
  return process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || ""
}

function extractCloudflareImage(payload: any) {
  const result = payload?.result
  if (!result) return ""

  if (typeof result === "string") {
    return result.startsWith("http") || result.startsWith("data:")
      ? result
      : `data:image/png;base64,${result}`
  }

  if (typeof result?.image === "string") {
    const image = result.image
    return image.startsWith("http") || image.startsWith("data:")
      ? image
      : `data:image/png;base64,${image}`
  }

  if (typeof result?.url === "string") return result.url

  if (Array.isArray(result?.images) && typeof result.images[0] === "string") {
    const image = result.images[0]
    return image.startsWith("http") || image.startsWith("data:")
      ? image
      : `data:image/png;base64,${image}`
  }

  return ""
}

function buildCloudflareImagePrompt(rawPrompt: string) {
  const source = String(rawPrompt || "").trim()
  const lower = source.toLowerCase()
  const requested = source.slice(0, 500)
  const quality = "ultra realistic, cinematic lighting, high detail, sharp focus, 4k, professional composition, no text, no watermark, no random unrelated scene"

  if (/трансформ|transformer/.test(lower)) {
    return [
      "MAIN SUBJECT: a giant humanoid transformer robot, full body visible, mechanical armored body, metal plates, glowing blue eyes, heroic cinematic pose.",
      "The image MUST clearly show a robot transformer as the central subject.",
      "Do NOT show only a normal street, bus, motorcycle, bicycle, empty city, or electrical transformer box.",
      "Scene: futuristic night city, dramatic atmosphere, neon reflections, smoke, cinematic lighting.",
      quality,
      `Original user request: ${requested}`,
    ].join(" ")
  }

  if (/иконк|icon|логотип|logo|эмблем|emblem|аватар|avatar/.test(lower)) {
    return [
      "MAIN SUBJECT: professional modern icon logo emblem, centered composition, clean silhouette, premium design, app icon style.",
      "If the user mentions a football club, create a football club badge/shield emblem with strong sports identity.",
      "No random street scene, no people unless requested, no long text.",
      quality,
      `Original user request: ${requested}`,
    ].join(" ")
  }

  if (/футбол|football|club|клуб/.test(lower)) {
    return [
      "MAIN SUBJECT: football club visual identity, premium sports badge or football player scene depending on request.",
      "Make the football subject clear and central.",
      quality,
      `Original user request: ${requested}`,
    ].join(" ")
  }

  if (/казахстан|kazakhstan|алматы|almaty|астана|astana|город|city/.test(lower)) {
    return [
      "MAIN SUBJECT: futuristic Kazakhstan AI city at night, neon cyan and royal purple, cinematic skyline, advanced technology, premium startup aesthetic.",
      "The Kazakhstan futuristic city must be clearly visible.",
      quality,
      `Original user request: ${requested}`,
    ].join(" ")
  }

  if (/[а-яё]/i.test(source)) {
    return [
      "Interpret the following Russian/Kazakh user request as an English image generation prompt.",
      "Depict the requested main subject exactly, not a random unrelated scene.",
      quality,
      `User request: ${requested}`,
    ].join(" ")
  }

  return `${requested}. ${quality}`
}

async function generateWithCloudflare(input: AIRequest): Promise<AIResponse> {
  const started = Date.now()
  const accountId = cloudflareAccountId()
  const token = cloudflareApiToken()

  if (!accountId || !token) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN not configured")
  }

  const model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell"
  const finalPrompt = buildCloudflareImagePrompt(input.prompt)

  const response = await providerFetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: finalPrompt,
      num_steps: Number(process.env.CLOUDFLARE_IMAGE_STEPS || 4),
    }),
    signal: input.signal,
  }, Number(process.env.IMAGE_PROVIDER_TIMEOUT_MS || 90_000))

  const contentType = response.headers.get("content-type") || ""

  if (contentType.startsWith("image/")) {
    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      success: true,
      provider: "cloudflare",
      model,
      type: "image",
      output: {
        resultUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
        provider: "cloudflare",
        model,
      },
      latencyMs: Date.now() - started,
    }
  }

  const payload = await response.json().catch(() => ({}))

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.errors?.[0]?.message || payload?.message || `Cloudflare Workers AI returned ${response.status}`)
  }

  const resultUrl = extractCloudflareImage(payload)

  if (!resultUrl) {
    throw new Error("Cloudflare Workers AI returned no image payload")
  }

  return {
    success: true,
    provider: "cloudflare",
    model,
    type: "image",
    output: {
      resultUrl,
      provider: "cloudflare",
      model,
    },
    latencyMs: Date.now() - started,
  }
}

async function generateWithStability(input: AIRequest): Promise<AIResponse> {
  const started = Date.now()
  const key = process.env.STABILITY_API_KEY
  if (!key) throw new Error("STABILITY_API_KEY not configured")

  const response = await providerFetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      accept: "application/json",
    },
    body: (() => {
      const form = new FormData()
      form.append("prompt", input.prompt)
      form.append("output_format", "png")
      return form
    })(),
    signal: input.signal,
  }, Number(process.env.IMAGE_PROVIDER_TIMEOUT_MS || 90_000))

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.errors?.[0] || payload?.message || `Stability returned ${response.status}`)

  const b64 = payload?.image
  if (!b64) throw new Error("Stability returned no image payload")
  return {
    success: true,
    provider: "stability",
    model: "stable-image-core",
    type: "image",
    output: {
      resultUrl: `data:image/png;base64,${b64}`,
      provider: "stability",
      model: "stable-image-core",
    },
    latencyMs: Date.now() - started,
  }
}

async function generateWithOpenAI(input: AIRequest): Promise<AIResponse> {
  const started = Date.now()
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error("OPENAI_API_KEY not configured")

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1"
  const response = await providerFetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      size: "1024x1024",
    }),
    signal: input.signal,
  }, Number(process.env.IMAGE_PROVIDER_TIMEOUT_MS || 90_000))

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI Images returned ${response.status}`)

  const item = payload?.data?.[0] || {}
  const resultUrl = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : "")
  if (!resultUrl) throw new Error("OpenAI Images returned no image URL or base64 payload")

  return {
    success: true,
    provider: "openai",
    model,
    type: "image",
    output: {
      resultUrl,
      provider: "openai",
      model,
    },
    latencyMs: Date.now() - started,
  }
}

async function generateWithFal(input: AIRequest): Promise<AIResponse> {
  const started = Date.now()
  const key = falKey()
  if (!key) throw new Error("FAL_KEY or FAL_API_KEY not configured")

  const model = process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell"
  const response = await providerFetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      authorization: `Key ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: input.prompt,
      image_size: "square_hd",
      num_images: 1,
    }),
    signal: input.signal,
  }, Number(process.env.IMAGE_PROVIDER_TIMEOUT_MS || 90_000))

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.detail || payload?.message || `FAL returned ${response.status}`)
  const resultUrl = payload?.images?.[0]?.url || payload?.image?.url
  if (!resultUrl) throw new Error("FAL returned no image URL")

  return {
    success: true,
    provider: "fal",
    model,
    type: "image",
    output: { resultUrl, provider: "fal", model },
    latencyMs: Date.now() - started,
  }
}

const handlers: Record<string, (input: AIRequest) => Promise<AIResponse>> = {
  cloudflare: generateWithCloudflare,
  openai: generateWithOpenAI,
  stability: generateWithStability,
  fal: generateWithFal,
  "aws-bedrock": (input) => awsBedrockProvider.generateImage(input),
}

function isConfigured(provider: string) {
  if (provider === "cloudflare") return Boolean(cloudflareAccountId() && cloudflareApiToken())
  if (provider === "openai") return configured("OPENAI_API_KEY")
  if (provider === "stability") return configured("STABILITY_API_KEY")
  if (provider === "fal") return Boolean(falKey())
  if (provider === "aws-bedrock") return awsBedrockProvider.healthCheck().configured
  return false
}

export const imageProviderRouter: AIProvider = {
  id: "openrouter",
  title: "Image Provider Router",
  supports: ["image"],

  healthCheck() {
    return {
      provider: "openrouter",
      configured: Object.keys(handlers).some(isConfigured),
      supports: ["image"],
      models: ["@cf/black-forest-labs/flux-1-schnell", "gpt-image-1", "stability-core", "fal-ai/flux/schnell", "amazon.nova-canvas-v1:0"],
      message: "Image router ready. Uses the configured provider order with automatic fallback.",
    }
  },

  async sendMessage(input) {
    return this.generateImage(input)
  },

  async generateCode() {
    throw new Error("Image router does not generate code.")
  },

  async generateImage(input: AIRequest): Promise<AIResponse> {
    const errors: string[] = []
    const requested = input.provider || String(input.metadata?.requestedProvider || "")
    const order = providerOrder("IMAGE_PROVIDER_ORDER", ["cloudflare", "fal", "stability", "openai", "aws-bedrock"], requested)

    for (const provider of order) {
      const handler = handlers[provider]
      if (!handler || !isConfigured(provider)) continue
      try {
        return await handler(input)
      } catch (error) {
        errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    throw new Error(errors.length ? errors.join(" | ") : "No image provider configured. Add CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN, OPENAI_API_KEY, STABILITY_API_KEY, FAL_KEY or AWS Bedrock env.")
  },

  async generateVideo() {
    throw new Error("Image router does not generate video.")
  },

  async analyzeFile() {
    throw new Error("Image router does not analyze files.")
  },
}




