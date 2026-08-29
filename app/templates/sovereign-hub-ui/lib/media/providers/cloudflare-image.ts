import {
  DEFAULT_MALIK_IMAGE_MODEL_ID,
  getMalikImageModel,
  type MalikImageModelId,
} from "../image-models"
import { imagePromptCompilerTimeoutMs, imageProviderTimeoutMs } from "../config"
import type { ImageAspectRatio, ImageMode } from "../types"

const DEFAULT_PROMPT_COMPILER_MODELS = [
  "@cf/zai-org/glm-4.7-flash",
  "@cf/qwen/qwen3-30b-a3b-fp8",
] as const

function promptCompilerModels(): string[] {
  const requested = process.env.CLOUDFLARE_IMAGE_PROMPT_MODEL?.trim()
  return [requested, ...DEFAULT_PROMPT_COMPILER_MODELS]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, list) => list.indexOf(value) === index)
}

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
  if (mode === "cinematic") return "Use cinematic composition and lighting, but never change the requested subject, action, setting, count, or identity."
  return ""
}

function normalizeVisualRequest(value: string) {
  return String(value || "")
    .replace(/^\s*\/(?:image|img|photo|foto|фото|картинка)(?![\p{L}\p{N}_])\s*:?\s*/iu, "")
    .replace(/^\s*(?:привет|салам|здравствуй(?:те)?|hello|hi|hey)[,!\s—-]*/iu, "")
    .replace(/^\s*(?:пожалуйста|please)[,!\s—-]*/iu, "")
    .replace(/^\s*(?:сгенерируй|сгенерировать|создай|создать|нарисуй|нарисовать|сделай|сделать|generate|create|draw|make)\s+(?:мне\s+)?/iu, "")
    .trim()
}

function normalizeCompilerOutput(value: string) {
  return String(value || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/^```(?:text|json|markdown)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^\s*(?:final\s+)?(?:image\s+)?prompt\s*:\s*/i, "")
    .replace(/^\s*["'“”]+|["'“”]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function compilerOutputUsable(value: string) {
  const text = normalizeCompilerOutput(value)
  if (text.length < 12) return false
  if (/\b(?:i cannot|i can't|unable to|sorry|as an ai|не могу|извините|отказываюсь)\b/i.test(text)) return false
  return true
}

function subjectGuard(source: string) {
  const lower = source.toLowerCase()
  const asksHuman = /\b(?:person|people|man|woman|boy|girl|human|portrait)\b/i.test(lower)
    || /(?:человек|люд|мужчин|женщин|девуш|парен|мальчик|девоч)/iu.test(lower)

  if (/(?:трансформ|робот|android|mecha|transformer|robot)/iu.test(lower) && !asksHuman) {
    return "MANDATORY SUBJECT: the main visible subject is a non-human humanoid transformer/robot. Do not replace it with a woman, man, child, portrait, animal, or unrelated object."
  }

  if (/(?:машин|автомоб|car|vehicle|sports car)/iu.test(lower) && !asksHuman) {
    return "MANDATORY SUBJECT: the requested vehicle must be clearly visible as the main subject. Do not replace it with a human portrait or unrelated scene."
  }

  if (/(?:футболист|football player|soccer player)/iu.test(lower)) {
    return "MANDATORY SUBJECT: a football player must be clearly visible as the main subject, with the requested action and setting preserved."
  }

  return ""
}

function subjectNegativePrompt(source: string) {
  const base = "unrelated subject, random scene, wrong object, duplicated subject, wrong count, wrong text, misspelled text, watermark, random logo, malformed anatomy, distorted geometry, low detail"
  const lower = source.toLowerCase()
  const asksHuman = /\b(?:person|people|man|woman|boy|girl|human|portrait)\b/i.test(lower)
    || /(?:человек|люд|мужчин|женщин|девуш|парен|мальчик|девоч)/iu.test(lower)
  if (/(?:трансформ|робот|android|mecha|transformer|robot)/iu.test(lower) && !asksHuman) {
    return `${base}, woman, girl, man, boy, human portrait, fashion portrait`
  }
  return base
}

async function callCloudflare(model: string, init: RequestInit, signal?: AbortSignal, timeoutMs = imageProviderTimeoutMs()) {
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

  const timer = setTimeout(() => controller.abort(), timeoutMs)
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

async function compileWithModel(model: string, source: string, mode?: ImageMode, signal?: AbortSignal) {
  const response = await callCloudflare(
    model,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: [
              "You are a lossless text-to-image prompt compiler for Russian, Kazakh and English users.",
              "Convert the user's request into ONE concise natural-English prompt for an image generator.",
              "The image must depict exactly the requested subject, action, setting, count, identity, pose, colors, materials, camera view and style.",
              "Never substitute the requested subject category: robot stays robot, vehicle stays vehicle, animal stays animal, person stays person.",
              "Remove greetings and command words such as hello, please, generate, create, draw, but preserve every visual requirement.",
              "If the user requests visible text, keep that text verbatim in its original language and spelling.",
              "Do not invent extra people, scenery, props, brands, logos, text or objects.",
              modeInstruction(mode),
              "Return ONLY the final English image prompt. No analysis, no markdown, no labels, no quotation marks.",
            ].filter(Boolean).join(" "),
          },
          { role: "user", content: source },
        ],
        max_completion_tokens: 700,
        temperature: 0,
      }),
    },
    signal,
    imagePromptCompilerTimeoutMs(),
  )

  if (!response.ok) throw new Error(`Prompt compiler ${model} returned ${response.status}`)
  const payload = await response.json().catch(() => ({}))
  return normalizeCompilerOutput(extractText(payload))
}

export async function compileImagePrompt(rawPrompt: string, mode?: ImageMode, signal?: AbortSignal): Promise<string> {
  const raw = String(rawPrompt || "").trim().slice(0, 4000)
  if (!raw) return raw

  const source = normalizeVisualRequest(raw) || raw
  let translated = source

  if (hasCyrillic(source) && cloudflareImageConfigured()) {
    for (const model of promptCompilerModels()) {
      try {
        const candidate = await compileWithModel(model, source, mode, signal)
        if (compilerOutputUsable(candidate)) {
          translated = candidate
          break
        }
      } catch {
        // Try the next multilingual compiler. Never silently accept a broken rewrite.
      }
    }
  }

  const guard = subjectGuard(source)
  return [
    translated,
    guard,
    modeInstruction(mode),
  ].filter(Boolean).join("\n\n")
}

function jsonRequestBody(modelId: MalikImageModelId, prompt: string, width: number, height: number, rawPrompt: string) {
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
      guidance: numericEnv("MALIK_IMAGE_PHOENIX_GUIDANCE", 8.5, 2, 10),
      num_steps: Math.round(numericEnv("MALIK_IMAGE_PHOENIX_STEPS", 30, 1, 50)),
      negative_prompt: subjectNegativePrompt(rawPrompt),
    }
  }

  return {
    prompt,
    width,
    height,
    guidance: numericEnv("MALIK_IMAGE_LUCID_GUIDANCE", 8.5, 0, 10),
    num_steps: Math.round(numericEnv("MALIK_IMAGE_LUCID_STEPS", 30, 1, 40)),
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
  const compiledPrompt = await compileImagePrompt(prompt, mode, signal)

  let response: Response
  if (model.requestKind === "multipart") {
    const form = new FormData()
    form.append("prompt", compiledPrompt)
    form.append("width", String(width))
    form.append("height", String(height))

    if (modelId === "flux-klein-4b") {
      form.append("guidance", String(numericEnv("MALIK_IMAGE_KLEIN_GUIDANCE", 7.5, 0, 10)))
    }
    if (modelId === "malik-image-1-premium") {
      form.append("steps", String(Math.round(numericEnv("MALIK_IMAGE_DEV_STEPS", 16, 1, 50))))
      form.append("guidance", String(numericEnv("MALIK_IMAGE_DEV_GUIDANCE", 7, 0, 10)))
    }

    response = await callCloudflare(model.providerModel, { method: "POST", body: form }, signal)
  } else {
    response = await callCloudflare(
      model.providerModel,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(jsonRequestBody(modelId, compiledPrompt, width, height, prompt)),
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
