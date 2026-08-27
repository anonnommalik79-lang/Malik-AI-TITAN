import {
  canUseMalikModel,
  getMalikModel,
  isMalikModelId,
  type MalikModelDefinition,
  type MalikModelId,
} from "@/lib/ai/malik-models"
import { providerFetch } from "@/lib/ai/providers/base"
import { hasHiddenGeminiMedia, runHiddenGeminiMultimodal } from "@/lib/server/hidden-gemini-multimodal"
import { resolveRequestEntitlement, type RequestEntitlement } from "@/lib/server/request-entitlement"

type HistoryMessage = { role: "user" | "assistant"; content: string }
type ImageContent = { type: "image_url"; image_url: { url: string } }
type TextContent = { type: "text"; text: string }
type ProviderMessage = {
  role: "system" | "user" | "assistant"
  content: string | Array<TextContent | ImageContent>
}

type MalikAttachment = {
  kind?: string
  mime?: string
  base64?: string
  url?: string
  name?: string
}

type StrictMalikResult = {
  content: string
  provider: string
  model: string
  selectedModelId: MalikModelId
  latencyMs: number
  usage?: any
}

const TEXT_FALLBACK_MODEL: Partial<Record<MalikModelId, MalikModelId>> = {
  "malik-27b": "malik-fast-120b",
  "malik-fast-120b": "malik-20b",
}

export class MalikModelRouteError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 503,
    public readonly modelId?: MalikModelId,
  ) {
    super(message)
    this.name = "MalikModelRouteError"
  }
}

export type StrictMalikSelection = {
  modelId: MalikModelId
  entitlement: RequestEntitlement
}

export async function resolveStrictMalikSelection(request: Request, body: any): Promise<StrictMalikSelection | null> {
  if (body?.model === undefined || body?.model === null || body?.model === "") return null
  if (!isMalikModelId(body.model)) {
    throw new MalikModelRouteError("UNKNOWN_MALIK_MODEL", "Неизвестная модель Malik AI.", 400)
  }

  const entitlement = await resolveRequestEntitlement(request)
  if (!canUseMalikModel(body.model, entitlement.plan)) {
    const model = getMalikModel(body.model)
    throw new MalikModelRouteError(
      "PRO_MODEL_REQUIRED",
      `${model.label} доступна в MalikAI Plus.`,
      403,
      body.model,
    )
  }

  return { modelId: body.model, entitlement }
}

function env(name: string) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function imageUrl(attachment: MalikAttachment): string {
  if (attachment.url?.startsWith("http") || attachment.url?.startsWith("data:image/")) return attachment.url
  if (!attachment.base64) return ""
  const mime = attachment.mime?.startsWith("image/") ? attachment.mime : "image/jpeg"
  return `data:${mime};base64,${attachment.base64}`
}

function buildMessages(input: {
  model: MalikModelDefinition
  prompt: string
  systemPrompt: string
  history?: HistoryMessage[]
  attachments?: MalikAttachment[]
}): ProviderMessage[] {
  const history = (input.history || [])
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .slice(-12)
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .filter((message) => message.content)

  const images = (input.attachments || [])
    .filter((attachment) => attachment?.kind === "image" || attachment?.mime?.startsWith("image/"))
    .map(imageUrl)
    .filter(Boolean)
    .slice(0, 3)

  if (images.length && !input.model.capabilities.includes("vision")) {
    throw new MalikModelRouteError(
      "MODEL_CAPABILITY_MISMATCH",
      `${input.model.label} не принимает изображения.`,
      422,
      input.model.id,
    )
  }

  const prior = history.length && history[history.length - 1]?.role === "user" ? history.slice(0, -1) : history
  const userContent: ProviderMessage["content"] = images.length
    ? [{ type: "text", text: input.prompt }, ...images.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
    : input.prompt

  return [
    { role: "system", content: input.systemPrompt },
    ...prior,
    { role: "user", content: userContent },
  ]
}

function providerConfig(model: MalikModelDefinition) {
  if (model.provider === "cerebras") {
    const key = env("CEREBRAS_API_KEY")
    if (!key) {
      throw new MalikModelRouteError(
        "PROVIDER_NOT_CONFIGURED",
        `${model.label} временно недоступна: Cerebras API не настроен.`,
        503,
        model.id,
      )
    }
    return {
      url: `${(env("CEREBRAS_BASE_URL") || "https://api.cerebras.ai/v1").replace(/\/+$/, "")}/chat/completions`,
      key,
    }
  }

  if (model.provider === "groq") {
    const key = env("GROQ_API_KEY")
    if (!key) {
      throw new MalikModelRouteError(
        "PROVIDER_NOT_CONFIGURED",
        `${model.label} временно недоступна: серверный провайдер не настроен.`,
        503,
        model.id,
      )
    }
    return {
      url: `${(env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/, "")}/chat/completions`,
      key,
    }
  }

  const key = env("CLOUDFLARE_API_TOKEN") || env("CF_API_TOKEN")
  const accountId = env("CLOUDFLARE_ACCOUNT_ID") || env("CF_ACCOUNT_ID")
  if (!key || !accountId) {
    throw new MalikModelRouteError(
      "PROVIDER_NOT_CONFIGURED",
      `${model.label} временно недоступна: серверный провайдер не настроен.`,
      503,
      model.id,
    )
  }
  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`,
    key,
  }
}

function contentFrom(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "string" ? part : part?.text || "").join("").trim()
  }
  return ""
}

async function runFallback(input: {
  failedModelId: MalikModelId
  originalModelId: MalikModelId
  prompt: string
  systemPrompt: string
  history?: HistoryMessage[]
  attachments?: MalikAttachment[]
  maxTokens?: number
  temperature?: number
}): Promise<StrictMalikResult | null> {
  const fallbackModelId = TEXT_FALLBACK_MODEL[input.failedModelId]
  if (!fallbackModelId) return null
  console.warn("[MALIK_MODEL_ROUTE]", JSON.stringify({
    selectedModelId: input.originalModelId,
    failedModelId: input.failedModelId,
    fallbackModelId,
    stage: "fallback",
  }))
  const result = await runStrictMalikModel({
    modelId: fallbackModelId,
    prompt: input.prompt,
    systemPrompt: input.systemPrompt,
    history: input.history,
    attachments: input.attachments,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
  })
  return { ...result, selectedModelId: input.originalModelId }
}

export async function runStrictMalikModel(input: {
  modelId: MalikModelId
  prompt: string
  systemPrompt: string
  history?: HistoryMessage[]
  attachments?: MalikAttachment[]
  maxTokens?: number
  temperature?: number
}): Promise<StrictMalikResult> {
  if (hasHiddenGeminiMedia(input.attachments)) {
    const started = Date.now()
    try {
      const result = await runHiddenGeminiMultimodal({
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        history: input.history,
        attachments: input.attachments,
      })
      console.info("[MALIK_MODEL_ROUTE]", JSON.stringify({
        selectedModelId: input.modelId,
        provider: "hidden-multimodal",
        stage: "success",
        latencyMs: Date.now() - started,
      }))
      return {
        content: result.content,
        provider: result.provider,
        model: result.model,
        selectedModelId: input.modelId,
        latencyMs: Date.now() - started,
        usage: result.usage,
      }
    } catch (error) {
      console.error("[MALIK_MODEL_ROUTE]", JSON.stringify({
        selectedModelId: input.modelId,
        provider: "hidden-multimodal",
        stage: "error",
        error: error instanceof Error ? error.message : String(error),
      }))
      throw new MalikModelRouteError(
        "MULTIMODAL_ENGINE_UNAVAILABLE",
        "Анализ фото, видео или аудио временно недоступен. Проверь мультимодальный API в Render.",
        503,
        input.modelId,
      )
    }
  }

  const model = getMalikModel(input.modelId)
  const started = Date.now()
  const messages = buildMessages({
    model,
    prompt: input.prompt,
    systemPrompt: input.systemPrompt,
    history: input.history,
    attachments: input.attachments,
  })

  console.info("[MALIK_MODEL_ROUTE]", JSON.stringify({
    selectedModelId: model.id,
    label: model.label,
    provider: model.provider,
    providerModel: model.providerModel,
    stage: "request",
  }))

  try {
    const provider = providerConfig(model)
    const response = await providerFetch(provider.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${provider.key}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        model: model.providerModel,
        messages,
        max_tokens: input.maxTokens || Number(process.env.MALIK_GOD_MAX_OUTPUT_TOKENS || 2200),
        temperature: input.temperature ?? Number(process.env.MALIK_GOD_TEMPERATURE || 0.4),
        ...(model.provider === "groq" && /^qwen\/qwen3\./.test(model.providerModel)
          ? { reasoning_effort: "none" }
          : {}),
        stream: false,
      }),
    }, Number(process.env.MALIK_MODEL_PROVIDER_TIMEOUT_MS || 30_000))

    const payload = await response.json().catch(() => ({}))
    const content = contentFrom(payload)
    const latencyMs = Date.now() - started

    console.info("[MALIK_MODEL_ROUTE]", JSON.stringify({
      selectedModelId: model.id,
      label: model.label,
      provider: model.provider,
      providerModel: model.providerModel,
      stage: response.ok && content ? "success" : "error",
      status: response.status,
      latencyMs,
    }))

    if (!response.ok || !content) {
      throw new MalikModelRouteError(
        "SELECTED_MODEL_UNAVAILABLE",
        `${model.label} временно недоступна.`,
        response.status >= 400 ? response.status : 503,
        model.id,
      )
    }

    return {
      content,
      provider: model.provider,
      model: model.providerModel,
      selectedModelId: model.id,
      latencyMs,
      usage: payload?.usage,
    }
  } catch (error) {
    try {
      const fallback = await runFallback({
        failedModelId: model.id,
        originalModelId: input.modelId,
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        history: input.history,
        attachments: input.attachments,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
      })
      if (fallback) return fallback
    } catch (fallbackError) {
      console.error("[MALIK_MODEL_ROUTE]", JSON.stringify({
        selectedModelId: input.modelId,
        failedModelId: model.id,
        stage: "fallback-exhausted",
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      }))
    }

    if (error instanceof MalikModelRouteError) throw error
    console.error("[MALIK_MODEL_ROUTE]", JSON.stringify({
      selectedModelId: model.id,
      label: model.label,
      provider: model.provider,
      providerModel: model.providerModel,
      stage: "exception",
      error: error instanceof Error ? error.message : String(error),
    }))
    throw new MalikModelRouteError(
      "SELECTED_MODEL_UNAVAILABLE",
      `${model.label} временно недоступна. Попробуйте ещё раз или выберите другую модель.`,
      503,
      model.id,
    )
  }
}

export function malikModelErrorPayload(error: unknown) {
  const routeError = error instanceof MalikModelRouteError
    ? error
    : new MalikModelRouteError("MALIK_MODEL_ERROR", "Выбранная модель временно недоступна.", 503)
  return {
    ok: false,
    error: routeError.code,
    message: routeError.message,
    selectedModelId: routeError.modelId,
  }
}
