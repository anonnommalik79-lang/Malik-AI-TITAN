import type { AIPlan } from "./types"

export type MalikModelId =
  | "malik-8b"
  | "malik-20b"
  | "malik-fast-120b"
  | "malik-27b"
  | "malik-glm-355b"
  | "malik-30b"
  | "malik-vision-26b"
  | "malik-coder-32b"
  | "malik-70b"
  | "malik-120b"
  | "malik-agent-120b"

export type MalikModelTier = "free" | "pro"
export type MalikModelProvider = "groq" | "cloudflare" | "cerebras"

export type MalikModelDefinition = {
  id: MalikModelId
  label: string
  description: string
  tier: MalikModelTier
  provider: MalikModelProvider
  providerModel: string
  capabilities: readonly ("text" | "vision" | "code" | "tools" | "reasoning")[]
}

const MALIK_MODEL_STORAGE_KEY = "malik_selected_model_v2"

export const MALIK_MODELS = [
  {
    id: "malik-20b",
    label: "MalikAI20B",
    description: "Быстрый · Для повседневных задач",
    tier: "free",
    provider: "groq",
    providerModel: "openai/gpt-oss-20b",
    capabilities: ["text", "reasoning"],
  },
  {
    id: "malik-fast-120b",
    label: "MalikAI120B Fast",
    description: "Cerebras · Быстрые ответы и рассуждения",
    tier: "free",
    provider: "cerebras",
    providerModel: "gpt-oss-120b",
    capabilities: ["text", "code", "tools", "reasoning"],
  },
  {
    id: "malik-27b",
    label: "MalikLLM Qwen3.8 27B",
    description: "Groq · 2M токенов/день · Быстрый reasoning",
    tier: "free",
    provider: "groq",
    providerModel: "qwen/qwen3.8-27b",
    capabilities: ["text", "vision", "code", "tools", "reasoning"],
  },
  {
    id: "malik-glm-355b",
    label: "MalikLLM x Glm4.7 355B",
    description: "Cerebras · 355B · Сильный reasoning и код",
    tier: "free",
    provider: "cerebras",
    providerModel: "zai-glm-4.7",
    capabilities: ["text", "code", "tools", "reasoning"],
  },
  {
    id: "malik-8b",
    label: "MalikLLM8B",
    description: "Лёгкая · Быстрые ответы",
    tier: "pro",
    provider: "cloudflare",
    providerModel: "@cf/meta/llama-3.1-8b-instruct-fast",
    capabilities: ["text"],
  },
  {
    id: "malik-30b",
    label: "MalikLLM30B",
    description: "Быстрое рассуждение",
    tier: "pro",
    provider: "cloudflare",
    providerModel: "@cf/qwen/qwen3-30b-a3b-fp8",
    capabilities: ["text", "reasoning"],
  },
  {
    id: "malik-vision-26b",
    label: "MalikVision26B",
    description: "Изображения · Vision",
    tier: "pro",
    provider: "cloudflare",
    providerModel: "@cf/google/gemma-4-26b-a4b-it",
    capabilities: ["text", "vision", "tools", "reasoning"],
  },
  {
    id: "malik-coder-32b",
    label: "MalikCoder32B",
    description: "Продвинутый код",
    tier: "pro",
    provider: "cloudflare",
    providerModel: "@cf/qwen/qwen2.5-coder-32b-instruct",
    capabilities: ["text", "code"],
  },
  {
    id: "malik-70b",
    label: "MalikLLM70B",
    description: "Продвинутый",
    tier: "pro",
    provider: "cloudflare",
    providerModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    capabilities: ["text"],
  },
  {
    id: "malik-120b",
    label: "MalikLLM120B",
    description: "Максимальное рассуждение",
    tier: "pro",
    provider: "groq",
    providerModel: "openai/gpt-oss-120b",
    capabilities: ["text", "tools", "reasoning"],
  },
  {
    id: "malik-agent-120b",
    label: "MalikAgent120B",
    description: "Агенты · Инструменты",
    tier: "pro",
    provider: "cloudflare",
    providerModel: "@cf/nvidia/nemotron-3-120b-a12b",
    capabilities: ["text", "tools", "reasoning"],
  },
] as const satisfies readonly MalikModelDefinition[]

export const DEFAULT_MALIK_MODEL_ID: MalikModelId = "malik-27b"
export const FREE_MALIK_MODELS = MALIK_MODELS.filter((model) => model.tier === "free")
export const PRO_MALIK_MODELS = MALIK_MODELS.filter((model) => model.tier === "pro")

export function isMalikModelId(value: unknown): value is MalikModelId {
  return typeof value === "string" && MALIK_MODELS.some((model) => model.id === value)
}

export function getMalikModel(modelId: MalikModelId): MalikModelDefinition {
  return MALIK_MODELS.find((model) => model.id === modelId) as MalikModelDefinition
}

export function hasMalikProAccess(plan: AIPlan | string | null | undefined): boolean {
  return plan === "pro" || plan === "ultra" || plan === "owner"
}

export function canUseMalikModel(modelId: MalikModelId, plan: AIPlan | string | null | undefined): boolean {
  const model = getMalikModel(modelId)
  return model.tier === "free" || hasMalikProAccess(plan)
}

export function loadMalikModelSelection(): MalikModelId {
  if (typeof window === "undefined") return DEFAULT_MALIK_MODEL_ID
  try {
    const saved = window.localStorage.getItem(MALIK_MODEL_STORAGE_KEY)
    return isMalikModelId(saved) ? saved : DEFAULT_MALIK_MODEL_ID
  } catch {
    return DEFAULT_MALIK_MODEL_ID
  }
}

export function saveMalikModelSelection(modelId: MalikModelId): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(MALIK_MODEL_STORAGE_KEY, modelId)
  } catch {
    // Storage is a preference only; the live React/chat state remains authoritative.
  }
}
