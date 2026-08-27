type ProviderGroup = "text" | "code" | "image" | "video" | "auth" | "backend"
import { buildPublicEngine, type PublicEngine, type PublicEngineId } from "@/lib/brand-provider-map"

type ProviderDefinition = {
  id: string
  title: string
  group: ProviderGroup | `${ProviderGroup}/${ProviderGroup}`
  requiredEnv: string[]
  mode?: "all" | "any"
  modelEnv?: string[]
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  { id: "kimi", title: "Kimi", group: "text/code", requiredEnv: ["MOONSHOT_API_KEY"], modelEnv: ["KIMI_MODEL", "KIMI_CODE_MODEL"] },
  { id: "openai", title: "OpenAI", group: "text/code", requiredEnv: ["OPENAI_API_KEY"], modelEnv: ["OPENAI_MODEL", "OPENAI_CODE_MODEL", "OPENAI_IMAGE_MODEL"] },
  { id: "gemini", title: "Google Gemini", group: "text/code", requiredEnv: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"], mode: "any", modelEnv: ["GEMINI_MODEL", "GEMINI_CODE_MODEL"] },
  { id: "anthropic", title: "Anthropic Claude", group: "text/code", requiredEnv: ["ANTHROPIC_API_KEY"], modelEnv: ["ANTHROPIC_MODEL", "ANTHROPIC_CODE_MODEL"] },
  { id: "awsBedrock", title: "AWS Bedrock", group: "text/code", requiredEnv: ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"], mode: "all", modelEnv: ["AWS_BEDROCK_TEXT_MODEL", "AWS_BEDROCK_CODE_MODEL", "AWS_BEDROCK_IMAGE_MODEL", "AWS_BEDROCK_VIDEO_MODEL"] },
  { id: "cerebras", title: "Cerebras Fast", group: "text/code", requiredEnv: ["CEREBRAS_API_KEY"], modelEnv: ["CEREBRAS_MODEL", "CEREBRAS_CODE_MODEL"] },
  { id: "groq", title: "Groq", group: "text/code", requiredEnv: ["GROQ_API_KEY"], modelEnv: ["GROQ_MODEL", "GROQ_CODE_MODEL"] },
  { id: "grok", title: "Grok", group: "text/code", requiredEnv: ["XAI_API_KEY"], modelEnv: ["GROK_MODEL", "GROK_CODE_MODEL"] },
  { id: "nvidiaNim", title: "NVIDIA NIM", group: "text/code", requiredEnv: ["NVIDIA_NIM_API_KEY", "NVIDIA_NIM_ENABLED"], mode: "all", modelEnv: ["NVIDIA_NIM_MODEL", "NVIDIA_NIM_CODE_MODEL"] },
  { id: "deepseek", title: "DeepSeek", group: "text/code", requiredEnv: ["DEEPSEEK_API_KEY"], modelEnv: ["DEEPSEEK_MODEL"] },
  { id: "openrouter", title: "OpenRouter", group: "text/code", requiredEnv: ["OPENROUTER_API_KEY"], modelEnv: ["OPENROUTER_MODEL", "OPENROUTER_CODE_MODEL"] },
  { id: "stability", title: "Stability AI", group: "image", requiredEnv: ["STABILITY_API_KEY"] },
  { id: "fal", title: "FAL", group: "image/video", requiredEnv: ["FAL_KEY", "FAL_API_KEY"], mode: "any", modelEnv: ["FAL_IMAGE_MODEL", "FAL_VIDEO_MODEL"] },
  { id: "luma", title: "Luma", group: "video", requiredEnv: ["LUMA_API_KEY"], modelEnv: ["LUMA_VIDEO_MODEL"] },
  { id: "runway", title: "Runway", group: "video", requiredEnv: ["RUNWAYML_API_SECRET", "RUNWAY_API_KEY"], mode: "any", modelEnv: ["RUNWAY_VIDEO_MODEL"] },
  { id: "googleVeo", title: "Google Veo", group: "video", requiredEnv: ["GOOGLE_VEO_API_KEY", "VEO_API_KEY"], mode: "any", modelEnv: ["GOOGLE_VEO_MODEL"] },
  { id: "workos", title: "WorkOS AuthKit", group: "auth", requiredEnv: ["WORKOS_CLIENT_ID", "WORKOS_API_KEY", "WORKOS_COOKIE_PASSWORD"], mode: "all" },
  { id: "backend", title: "Malik Backend", group: "backend", requiredEnv: ["MALIK_BACKEND_URL"] },
]

function present(name: string) {
  return Boolean(process.env[name]?.trim())
}

export function envGroupConfigured(requiredEnv: string[], mode: "all" | "any" = "any") {
  return mode === "all" ? requiredEnv.every(present) : requiredEnv.some(present)
}

function missingEnv(requiredEnv: string[], mode: "all" | "any" = "any") {
  if (mode === "any" && requiredEnv.some(present)) return []
  return requiredEnv.filter((name) => !present(name))
}

function firstConfigured(names: string[] = []) {
  return names.map((name) => process.env[name]?.trim()).find(Boolean)
}

export function getProviderRows() {
  return PROVIDER_DEFINITIONS.map((provider) => {
    const configured = envGroupConfigured(provider.requiredEnv, provider.mode)
    return {
      ...provider,
      configured,
      ready: configured,
      missingEnv: missingEnv(provider.requiredEnv, provider.mode),
      model: firstConfigured(provider.modelEnv),
      region: provider.id === "awsBedrock" ? process.env.AWS_REGION?.trim() : undefined,
    }
  })
}

function backendBaseUrl() {
  return (process.env.MALIK_BACKEND_URL || "http://127.0.0.1:10000").trim().replace(/\/$/, "")
}

export async function getBackendStatus() {
  const configured = present("MALIK_BACKEND_URL")
  if (!configured || process.env.MALIK_BACKEND_PROXY_ENABLED !== "true") {
    return { configured, reachable: false, ready: false, mode: "direct-routing" }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1200)

  try {
    const response = await fetch(`${backendBaseUrl()}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    })
    return { configured, reachable: response.ok, ready: response.ok, mode: response.ok ? "proxy-ready" : "provider-fallback" }
  } catch {
    return { configured, reachable: false, ready: false, mode: "provider-fallback" }
  } finally {
    clearTimeout(timer)
  }
}

export function getMediaReadiness() {
  const rows = getProviderRows()
  const hasGroup = (group: ProviderGroup) => rows.filter((row) => row.group.split("/").includes(group))
  const publicRow = (row: ReturnType<typeof getProviderRows>[number]) => ({
    id: row.id,
    title: row.title,
    configured: row.configured,
    ready: row.ready,
    missingEnv: row.missingEnv,
    model: row.model,
    region: row.region,
  })
  const publicRows = (group: ProviderGroup) => hasGroup(group).map(publicRow)
  const selectedRows = (ids: string[]) => ids.flatMap((id) => {
    const row = rows.find((item) => item.id === id)
    return row ? [publicRow(row)] : []
  })

  return {
    text: publicRows("text"),
    code: publicRows("code"),
    image: selectedRows(["openai", "stability", "fal", "awsBedrock"]),
    video: publicRows("video"),
  }
}

export function getPublicEngineReadiness(): PublicEngine[] {
  const rows = getProviderRows()
  const any = (...ids: string[]) => ids.some((id) => rows.find((row) => row.id === id)?.configured)
  const engines: Array<[PublicEngineId, PublicEngine["group"], boolean]> = [
    ["core", "text", any("cerebras", "openai", "gemini", "groq", "openrouter")],
    ["reasoning", "text", any("cerebras", "kimi", "anthropic", "grok", "deepseek")],
    ["code", "code", any("cerebras", "openai", "kimi", "anthropic", "gemini", "grok", "deepseek", "openrouter", "awsBedrock", "nvidiaNim")],
    ["vision", "image", any("openai", "stability", "fal", "awsBedrock")],
    ["cinema", "video", any("googleVeo", "runway", "luma", "fal")],
    ["infrastructure", "infrastructure", any("awsBedrock", "nvidiaNim", "backend")],
    ["identity", "identity", any("workos")],
  ]
  return engines.map(([id, group, configured]) => buildPublicEngine(id, group, configured))
}
