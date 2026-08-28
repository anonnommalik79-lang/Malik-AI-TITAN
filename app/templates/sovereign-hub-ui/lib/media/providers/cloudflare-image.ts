import {
  DEFAULT_MALIK_IMAGE_MODEL_ID,
  getMalikImageModel,
  type MalikImageModelId,
} from "../image-models"
import { imageProviderTimeoutMs } from "../config"
import type { ImageAspectRatio, ImageMode } from "../types"

const PROMPT_COMPILER_MODEL = process.env.CLOUDFLARE_IMAGE_PROMPT_MODEL?.trim() || "@cf/zai-org/glm-4.7-flash"

function cloudflareAccountId(): string {
  return (
    process.env.CLOUDFLARE_IMAGE_ACCOUNT_ID?.trim() ||
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    process.env.CF_ACCOUNT_ID?.trim() ||
    ""
  )
}

function cloudflareApiToken(): string {
  return (
    process.env.CLOUDFLARE_IMAGE_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_API_TOKEN?.trim() ||
    process.env.CF_API_TOKEN?.trim() ||
    ""
  )
}

export function cloudflareImageConfigured(): boolean {
  return Boolean(cloudflareAccountId() && cloudflareApiToken())
}

function imageSize(aspectRatio: ImageAspectRatio = "1:1") {
  if (aspectRatio === "16:9") return { width: 1344, height: 768 }
  if (aspectRatio === "9:16") return { width: 768, height: 1344 }
  if (aspectRatio === "4:5") return { width: 896, height: 1120 }
  if (aspectRatio === "4:3") return { width: 1152, height: 864 }
  return { width: 1024, height: 1024 }
}

function numericEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] || fallback)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function hasCyrillic(value: string) {
  return /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/u.test(value)
}

function extractText(payload: any): string {
  const candidates = [
    payload?.result?.response,
    payload?.result?.text,
    payload?.response,
    payload?.text,
    payload?.result?.choices?.[0]?.message?.content,
    payload?.choices?.[0]?.message?.content,
  ]
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || ""
}

function extractImage(payload: any): string {
  const result = payload?.result ?? payload
  const candidates = [
    result?.image,
    result?.url,
    result?.imageUrl,
    result?.resultUrl,
    result?.images?.[0],
    result?.images?.[0]?.url,
    payload?.image,
    payload?.url,
  ]

  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim())
  if (!value) return ""
  if (value.startsWith("http") || value.startsWith("data:")) return value
  return `data:image/jpeg;charset=utf-8;base64,${value}`
}

function modeInstruction(mode?: ImageMode) {
  if (mode === "realistic") return "Render as a believable photorealistic photograph unless the user explicitly requests another style."
  if (mode === "product") return "Prioritize clean product presentation, accurate materials, readable hierarchy, and controlled studio composition."
  if (mode === "design") return "Prioritize graphic-design precision, clean layout, legible requested text, and exact visual hierarchy."
  if (mode === "cinematic") return "Prioritize cinematic composition and lighting without changing the requested subject or scene."
  return ""
}

async function callCloudflare(model: string, init: RequestInit, signal?: AbortSignal) {
  const accountId = cloudflareAccountId()
  const token = cloudflareApiToken()
  if (!accountId || !token) {
    throw new Error("CLOUDFLARE_IMAGE_ACCOUNT_ID and CLOUDFLARE_IMAGE_API_TOKEN are not configured")
  }

  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
  }

  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${token}`)

  const timer = setTimeout(() => controller.abort(), imageProviderTimeoutMs())
  try {
    return await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
}

async function compilePrompt(rawPrompt: string, mode?: ImageMode, signal?: AbortSignal): Promise<string> {
  const source = String(rawPrompt || "").trim().slice(0, 4000)
  if (!source) return source

  let translated = source
  if (hasCyrillic(source) && cloudflareImageConfigured()) {
    try {
      const response = await callCloudflare(
        PROMPT_COMPILER_MODEL,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: [
                  "You are a lossless image-prompt compiler for Russian and Kazakh users.",
                  "Translate the user's visual request into concise natural English for a text-to-image model.",
                  "Do not invent, remove, soften, or replace requested visual details.",
                  "Preserve exact counts, colors, materials, identities, names, brands, camera instructions, left/right/top/bottom positions, foreground/background relations, poses, actions, ages and visual style.",
                  "If the user requests visible text, lettering, a title, a sign, UI copy, a logo wordmark, or quotes any text, preserve that visible text VERBATIM in its original language and spelling; do not translate the text that must appear inside the image.",
                  "Never add decorative objects, people, vehicles, text, logos, watermarks or scenery that the user did not request.",
                  "Return ONLY the final image prompt. No explanation, no markdown, no quotation wrapper.",
                ].join(" "),
              },
              { role: "user", content: source },
            ],
            max_tokens: 900,
            temperature: 0.05,
          }),
        },
        signal,
      )

      if (response.ok) {
        const payload = await response.json().catch(() => ({}))
        translated = extractText(payload) || source
      }
    } catch {
      translated = source
    }
  }

  const exactness = [
    "STRICT FIDELITY RULES:",
    "Follow the user's requested subject and composition exactly.",
    "Preserve object counts, colors, positions, spatial relationships, identities, poses and actions.",
    "Do not add unrequested people, objects, vehicles, words, logos, watermarks or background elements.",
    "Any requested visible text must be spelled exactly as specified.",
    "Keep anatomy, perspective, geometry, lighting and materials coherent and high quality.",
  ].join(" ")

  return [translated, modeInstruction(mode), exactness].filter(Boolean).join("\n\n")
}

function jsonRequestBody(modelId: MalikImageModelId, prompt: string, width: number, height: number) {
  if (modelId === "flux-schnell") {
    return {
      prompt,
      steps: Math.round(numericEnv("MALIK_IMAGE_SCHNELL_STEPS", 4, 1, 8)),
    }
  }

  if (modelId === "leonardo-phoenix") {
    return {
      prompt,
      width,
      height,
      guidance: numericEnv("MALIK_IMAGE_PHOENIX_GUIDANCE", 7, 2, 10),
      num_steps: Math.round(numericEnv("MALIK_IMAGE_PHOENIX_STEPS", 25, 1, 50)),
      negative_prompt: "unrequested objects, extra people, duplicated subjects, wrong count, wrong text, misspelled text, watermark, random logo, malformed anatomy, distorted geometry, low detail",
    }
  }

  return {
    prompt,
    width,
    height,
    guidance: numericEnv("MALIK_IMAGE_LUCID_GUIDANCE", 7, 0, 10),
    num_steps: Math.round(numericEnv("MALIK_IMAGE_LUCID_STEPS", 28, 1, 40)),
  }
}

export async function generateCloudflareImage({
  prompt,
  aspectRatio = "1:1",
  mode,
  modelId = DEFAULT_MALIK_IMAGE_MODEL_ID,
  signal,
}: {
  prompt: string
  aspectRatio?: ImageAspectRatio
  mode?: ImageMode
  modelId?: MalikImageModelId
  signal?: AbortSignal
}): Promise<{ imageUrl: string; modelId: MalikImageModelId; providerModel: string; compiledPrompt: string }> {
  if (!cloudflareImageConfigured()) {
    throw new Error("Cloudflare Workers AI image account is not configured")
  }

  const model = getMalikImageModel(modelId)
  const { width, height } = imageSize(aspectRatio)
  const compiledPrompt = await compilePrompt(prompt, mode, signal)

  let response: Response
  if (model.requestKind === "multipart") {
    const form = new FormData()
    form.append("prompt", compiledPrompt)
    form.append("width", String(width))
    form.append("height", String(height))

    if (modelId === "flux-klein-4b") {
      form.append("guidance", String(numericEnv("MALIK_IMAGE_KLEIN_GUIDANCE", 4.5, 0, 10)))
    }
    if (modelId === "malik-image-1-premium") {
      // FLUX.2 Dev is intentionally slower than the fast models. Sixteen steps
      // keeps MalikImage 1.0 in the premium quality lane while avoiding the
      // long mobile request that previously ended as Safari "Load failed".
      form.append("steps", String(Math.round(numericEnv("MALIK_IMAGE_DEV_STEPS", 16, 1, 50))))
      form.append("guidance", String(numericEnv("MALIK_IMAGE_DEV_GUIDANCE", 5, 0, 10)))
    }

    response = await callCloudflare(model.providerModel, { method: "POST", body: form }, signal)
  } else {
    response = await callCloudflare(
      model.providerModel,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(jsonRequestBody(modelId, compiledPrompt, width, height)),
      },
      signal,
    )
  }

  const contentType = response.headers.get("content-type") || ""
  if (contentType.startsWith("image/")) {
    if (!response.ok) throw new Error(`Cloudflare Workers AI returned ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    return {
      imageUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
      modelId,
      providerModel: model.providerModel,
      compiledPrompt,
    }
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const message = payload?.errors?.[0]?.message || payload?.error?.message || payload?.message
    throw new Error(message || `Cloudflare Workers AI returned ${response.status}`)
  }

  const imageUrl = extractImage(payload)
  if (!imageUrl) throw new Error(`${model.label} returned no image payload`)

  return { imageUrl, modelId, providerModel: model.providerModel, compiledPrompt }
}
