import type { AIPlan } from "./types"
import { ROUTER_AUTO_TEXT_CATALOG, ROUTER_TEXT_CATALOG, type RouterCatalogAccess, type RouterCatalogBrand } from "./router-catalog"

export type MalikModelId = string
export type MalikModelTier = "free" | "pro"
export type MalikModelProvider =
  | "malik-orchestrator" | "modelscope" | "aihubmix" | "groq" | "cloudflare"
  | "cerebras" | "nemotron-openrouter" | "together" | "deepseek"
  | "xkiro" | "llm7" | "nara"

export type MalikModelBrand = RouterCatalogBrand | "malik" | "baidu"

export type MalikModelDefinition = {
  id: MalikModelId
  label: string
  description: string
  tier: MalikModelTier
  provider: MalikModelProvider
  providerModel: string
  capabilities: readonly ("text" | "vision" | "code" | "tools" | "reasoning")[]
  brand: MalikModelBrand
  access?: RouterCatalogAccess
  hidden?: boolean
  autoEligible?: boolean
}

const MALIK_MODEL_STORAGE_KEY = "malik_selected_model_v5"

function inferCapabilities(providerModel: string): MalikModelDefinition["capabilities"] {
  const value = providerModel.toLowerCase()
  const vision = /(?:omni|\bvl\b|-vl-|vision|gemini)/i.test(value)
  return vision
    ? ["text", "vision", "code", "tools", "reasoning"]
    : ["text", "code", "tools", "reasoning"]
}

const ROUTER_TEXT_MODELS: MalikModelDefinition[] = ROUTER_TEXT_CATALOG.map((entry) => ({
  id: `router:${entry.provider}:${entry.providerModel}`,
  label: entry.label,
  description: `${entry.provider === "xkiro" ? "xKiro" : entry.provider === "llm7" ? "LLM7" : "NaraRouter"} · ${entry.access === "free" ? "Free route" : "Pro route"}`,
  tier: entry.access === "catalog" ? "pro" : "free",
  provider: entry.provider,
  providerModel: entry.providerModel,
  capabilities: inferCapabilities(entry.providerModel),
  brand: entry.brand,
  access: entry.access,
  autoEligible: entry.autoEligible,
}))

const LLM7_DEFAULT_MODEL: MalikModelDefinition = {
  id: "router:llm7:default",
  label: "LLM7 Default",
  description: "LLM7 · Free dynamic router",
  tier: "free",
  provider: "llm7",
  providerModel: "default",
  capabilities: ["text", "code", "tools", "reasoning"],
  brand: "router",
  access: "free",
  autoEligible: true,
}

const legacy = (
  id: string,
  label: string,
  provider: MalikModelProvider,
  providerModel: string,
  brand: MalikModelBrand,
  capabilities: MalikModelDefinition["capabilities"],
): MalikModelDefinition => ({
  id, label, provider, providerModel, brand, capabilities,
  description: "Internal fallback", tier: "free", hidden: true, autoEligible: true,
})

const LEGACY_INTERNAL_MODELS: MalikModelDefinition[] = [
  legacy("malik-coder-32b", "MalikCoder 1.0", "malik-orchestrator", "MalikCoder-1.0", "malik", ["text", "code", "tools", "reasoning"]),
  legacy("malik-bonsai-27b", "Ternary-Bonsai-27B", "together", "Prism-ML/Ternary-Bonsai-27B", "router", ["text", "vision", "code", "tools", "reasoning"]),
  legacy("malik-glm-47-flash", "GLM-4.7-Flash", "cloudflare", "@cf/zai-org/glm-4.7-flash", "zai", ["text", "code", "tools", "reasoning"]),
  legacy("malik-gemma-4-26b", "Gemma 4 26B A4B IT", "cloudflare", "@cf/google/gemma-4-26b-a4b-it", "google", ["text", "vision", "code", "tools", "reasoning"]),
  legacy("malik-nemotron-3-120b", "NVIDIA Nemotron 3 Super 120B-A12B", "cloudflare", "@cf/nvidia/nemotron-3-120b-a12b", "nvidia", ["text", "code", "tools", "reasoning"]),
  legacy("malik-deepseek-v41", "DeepSeek V4.1 Flash", "deepseek", "deepseek-flash", "deepseek", ["text", "vision", "code", "tools", "reasoning"]),
  legacy("nvidia-nemotron-ultra-550b", "NVIDIA Nemotron 3 Ultra 550B", "nemotron-openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia", ["text", "code", "tools", "reasoning"]),
  legacy("malik-qwen-397b", "Qwen3.5-397B-A17B", "modelscope", "Qwen/Qwen3.5-397B-A17B", "qwen", ["text", "vision", "code", "tools", "reasoning"]),
  legacy("malik-reason-753b", "GLM-5.2", "modelscope", "ZhipuAI/GLM-5.2", "zai", ["text", "code", "tools", "reasoning"]),
  legacy("malik-core-300b", "ERNIE 4.5 300B-A47B-PT", "modelscope", "PaddlePaddle/ERNIE-4.5-300B-A47B-PT", "baidu", ["text", "code", "reasoning"]),
  legacy("malik-flash-53", "GLM-5.3", "aihubmix", "coding-glm-5.3-free", "zai", ["text", "code", "tools", "reasoning"]),
  legacy("malik-vision-k3", "Kimi K3", "aihubmix", "coding-kimi-k3-free", "kimi", ["text", "vision", "code", "tools", "reasoning"]),
  legacy("malik-20b", "GPT-OSS 20B", "groq", "openai/gpt-oss-20b", "openai", ["text", "reasoning"]),
  legacy("malik-fast-120b", "GPT-OSS 120B", "cerebras", "gpt-oss-120b", "openai", ["text", "code", "tools", "reasoning"]),
  legacy("malik-27b", "Qwen3.8-27B", "groq", "qwen/qwen3.8-27b", "qwen", ["text", "vision", "code", "tools", "reasoning"]),
  legacy("malik-8b", "Llama 3.1 8B Instruct Fast", "cloudflare", "@cf/meta/llama-3.1-8b-instruct-fast", "meta", ["text"]),
  legacy("malik-30b", "Qwen3-30B-A3B", "cloudflare", "@cf/qwen/qwen3-30b-a3b-fp8", "qwen", ["text", "reasoning"]),
  legacy("malik-vision-26b", "Gemma 4 26B A4B IT", "cloudflare", "@cf/google/gemma-4-26b-a4b-it", "google", ["text", "vision", "tools", "reasoning"]),
  legacy("malik-70b", "Llama 3.3 70B Instruct", "cloudflare", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "meta", ["text"]),
  legacy("malik-120b", "GPT-OSS 120B", "groq", "openai/gpt-oss-120b", "openai", ["text", "tools", "reasoning"]),
  legacy("malik-agent-120b", "NVIDIA Nemotron 3 Super 120B-A12B", "cloudflare", "@cf/nvidia/nemotron-3-120b-a12b", "nvidia", ["text", "tools", "reasoning"]),
]

export const MALIK_MAX_MODEL: MalikModelDefinition = {
  id: "malik-max",
  label: "MalikLLM MAX",
  description: "Auto · multi-provider failover",
  tier: "free",
  provider: "malik-orchestrator",
  providerModel: "auto",
  capabilities: ["text", "vision", "code", "tools", "reasoning"],
  brand: "malik",
  access: "free",
  autoEligible: true,
}

export const MALIK_MODELS: readonly MalikModelDefinition[] = [
  MALIK_MAX_MODEL,
  ...ROUTER_TEXT_MODELS,
  LLM7_DEFAULT_MODEL,
  ...LEGACY_INTERNAL_MODELS,
]

export const PUBLIC_MALIK_MODELS = MALIK_MODELS.filter((model) => !model.hidden)
export const DEFAULT_MALIK_MODEL_ID: MalikModelId = "malik-max"
export const FREE_MALIK_MODELS = PUBLIC_MALIK_MODELS.filter((model) => model.tier === "free")
export const PRO_MALIK_MODELS = PUBLIC_MALIK_MODELS.filter((model) => model.tier === "pro")

const ROUTER_AUTO_IDS = ROUTER_AUTO_TEXT_CATALOG.map((entry) => `router:${entry.provider}:${entry.providerModel}`)
const LEGACY_AUTO_IDS = LEGACY_INTERNAL_MODELS
  .filter((model) => model.provider !== "malik-orchestrator")
  .map((model) => model.id)
export const MAX_ROUTER_MODEL_IDS: readonly MalikModelId[] = [
  ...ROUTER_AUTO_IDS,
  LLM7_DEFAULT_MODEL.id,
  ...LEGACY_AUTO_IDS,
]

export function isMalikModelId(value: unknown): value is MalikModelId {
  return typeof value === "string" && MALIK_MODELS.some((model) => model.id === value)
}

export function getMalikModel(modelId: MalikModelId): MalikModelDefinition {
  const model = MALIK_MODELS.find((candidate) => candidate.id === modelId)
  if (!model) throw new Error(`Unknown Malik model: ${modelId}`)
  return model
}

export function hasMalikProAccess(plan: AIPlan | string | null | undefined): boolean {
  return plan === "pro" || plan === "ultra" || plan === "owner"
}

export function canUseMalikModel(modelId: MalikModelId, plan: AIPlan | string | null | undefined): boolean {
  if (!isMalikModelId(modelId)) return false
  const model = getMalikModel(modelId)
  return model.hidden === true || model.tier === "free" || hasMalikProAccess(plan)
}

export function loadMalikModelSelection(): MalikModelId {
  if (typeof window === "undefined") return DEFAULT_MALIK_MODEL_ID
  try {
    const saved = window.localStorage.getItem(MALIK_MODEL_STORAGE_KEY)
    return isMalikModelId(saved) && !getMalikModel(saved).hidden ? saved : DEFAULT_MALIK_MODEL_ID
  } catch {
    return DEFAULT_MALIK_MODEL_ID
  }
}

export function saveMalikModelSelection(modelId: MalikModelId): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(MALIK_MODEL_STORAGE_KEY, modelId)
  } catch {
    // Storage is a preference only.
  }
}
