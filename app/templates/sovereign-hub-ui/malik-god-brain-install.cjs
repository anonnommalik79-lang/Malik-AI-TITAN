const fs = require("fs")
const path = require("path")
const cp = require("child_process")

const repo = path.join(process.env.USERPROFILE || process.env.HOME, "Desktop", "Malik-AI-TITAN")
const target = path.join(repo, "app", "templates", "sovereign-hub-ui")

const files = {
  modes: path.join(target, "lib", "ai", "modes.ts"),
  models: path.join(target, "lib", "ai", "models.ts"),
  registry: path.join(target, "lib", "ai", "provider-registry.ts"),
  deepseek: path.join(target, "lib", "ai", "providers", "deepseek.ts"),
  openrouter: path.join(target, "lib", "ai", "providers", "openrouter.ts"),
}

function sh(cmd) {
  console.log("\\n$ " + cmd)
  cp.execSync(cmd, { cwd: target, stdio: "inherit", shell: true })
}

function read(file) {
  return fs.readFileSync(file, "utf8")
}

function write(file, text) {
  fs.writeFileSync(file, text, "utf8")
}

function backup(file) {
  if (!fs.existsSync(file)) throw new Error("File not found: " + file)
  fs.copyFileSync(file, file + ".bak.godbrain.node")
}

function restore(file) {
  const bak = file + ".bak.godbrain.node"
  if (fs.existsSync(bak)) fs.copyFileSync(bak, file)
}

function cleanup(file) {
  const bak = file + ".bak.godbrain.node"
  if (fs.existsSync(bak)) fs.unlinkSync(bak)
}

function replaceProviderBlock(text, name, block) {
  const re = new RegExp(name + ":\\\\s*\\\\{[\\\\s\\\\S]*?\\\\n\\\\s*\\\\},", "m")
  if (!re.test(text)) throw new Error(name + " block not found in models.ts")
  return text.replace(re, block)
}

const modeCode = String.raw`import type { AITaskType } from "./types"
import type { MalikAIMode } from "./config"
import { modelChainForMode } from "./config"

export type ModeRouteStep = {
  provider: "deepseek" | "openrouter" | "aws-bedrock"
  model?: string
  task: AITaskType
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim())
}

function env(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback
}

export function taskForMode(mode: MalikAIMode): AITaskType {
  if (mode === "code") return "code"
  if (mode === "photo") return "image"
  if (mode === "video") return "video"
  return "chat"
}

export function routeStepsForMode(mode: MalikAIMode): ModeRouteStep[] {
  const task = taskForMode(mode)
  const steps: ModeRouteStep[] = []

  const isText =
    task === "chat" ||
    task === "code" ||
    task === "debug" ||
    task === "project" ||
    task === "general" ||
    task === "research" ||
    task === "file_analysis" ||
    task === "enterprise"

  if (isText && hasEnv("DEEPSEEK_API_KEY")) {
    const model =
      mode === "code"
        ? env("DEEPSEEK_CODE_MODEL", env("DEEPSEEK_PRO_MODEL", "deepseek-v4-pro"))
        : mode === "pro" || mode === "deep"
          ? env("DEEPSEEK_PRO_MODEL", env("DEEPSEEK_MODEL", "deepseek-v4-pro"))
          : env("DEEPSEEK_FAST_MODEL", env("DEEPSEEK_MODEL", "deepseek-v4-flash"))

    steps.push({ provider: "deepseek", model, task })
  }

  if (isText && hasEnv("OPENROUTER_API_KEY")) {
    const model =
      mode === "code"
        ? env("OPENROUTER_CODE_MODEL", env("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash:free"))
        : env("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash:free")

    steps.push({ provider: "openrouter", model, task })
  }

  for (const model of modelChainForMode(mode)) {
    steps.push({ provider: "aws-bedrock", model, task })
  }

  return steps
}

export function modeLabel(mode: MalikAIMode): string {
  const labels: Record<MalikAIMode, string> = {
    fast: "MALIK AI Fast — DeepSeek V4 Flash",
    deep: "MALIK AI Deep — DeepSeek V4 Pro",
    pro: "MALIK AI Pro — DeepSeek V4 Pro",
    code: "MALIK AI Code — DeepSeek V4 Pro",
    photo: "MALIK AI Vision",
    video: "MALIK AI Video",
    memory: "MALIK AI Memory",
  }
  return labels[mode]
}

export function modeDescription(mode: MalikAIMode): string {
  const descriptions: Record<MalikAIMode, string> = {
    fast: "Fast answers, business, study, strategy and daily tasks through DeepSeek V4 Flash.",
    deep: "Deep reasoning, medicine explanations, business analysis, research and planning through DeepSeek V4 Pro.",
    pro: "Premium investor-grade reasoning through DeepSeek V4 Pro.",
    code: "Code, debugging and architecture through DeepSeek V4 Pro.",
    photo: "Image generation through configured image providers.",
    video: "Video generation through configured video providers.",
    memory: "Memory and embeddings when configured.",
  }
  return descriptions[mode]
}
`

const deepseekCode = String.raw`import type { AIMessage, AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

function maxTokensFor(input: AIRequest) {
  if (input.maxTokens) return input.maxTokens
  if (input.task === "code" || input.task === "debug" || input.task === "project") {
    return Number(process.env.MAX_CODE_OUTPUT_TOKENS || 5000)
  }
  return Number(process.env.MAX_OUTPUT_TOKENS || 2200)
}

function temperatureFor(input: AIRequest) {
  if (typeof input.temperature === "number") return input.temperature
  if (input.task === "code" || input.task === "debug") return 0.18
  if (input.task === "research" || input.task === "file_analysis") return 0.22
  return 0.28
}

function attachmentContext(input: AIRequest) {
  const files = ((input as any).attachments || []) as Array<any>
  const text = files
    .map((file, index) => {
      const body = file.text || file.url || file.name || ""
      if (!body) return ""
      return "Attachment " + (index + 1) + ": " + (file.name || file.kind || "file") + "\\n" + body
    })
    .filter(Boolean)
    .join("\\n\\n")

  return text ? "\\n\\nUSER ATTACHMENTS / CONTEXT:\\n" + text : ""
}

function buildMalikSystemPrompt(input: AIRequest) {
  const task = input.task || "chat"
  const mode = String(((input as any).metadata && (input as any).metadata.malikMode) || task)

  return [
    "You are MALIK AI V6.5 TITAN, a sovereign AI command layer built in Kazakhstan by a young founder.",
    "",
    "CORE STYLE:",
    "- Answer in the user's language.",
    "- Be direct, useful, structured and fast.",
    "- Give exact steps, commands, code, tables, plans, checklists and decisions when helpful.",
    "- Never pretend to have done something that was not done.",
    "",
    "CURRENT MODE: " + mode,
    "CURRENT TASK: " + task,
    "",
    "CAPABILITIES:",
    "1. Business: market analysis, startup strategy, pricing, unit economics, investor pitch, GTM, competitors, roadmap, risks.",
    "2. Coding: TypeScript, Next.js, React, API routes, backend, deployment, GitHub, Render, Cloudflare, AWS, debugging.",
    "3. Medical education and health triage:",
    "   - Explain diseases, cancer signs, symptoms, medical reports and possible risk levels safely.",
    "   - Do not claim a final diagnosis, cure, or replace a doctor.",
    "   - Red flags such as severe chest pain, trouble breathing, stroke signs, black stool, severe bleeding, fainting, suicidal intent, or rapidly worsening symptoms require urgent medical care.",
    "   - For cancer or serious disease questions, explain what symptoms can mean, what tests doctors use, what questions to ask, and when to seek care.",
    "4. Law/finance: general information and risk framing, not guaranteed legal/financial advice.",
    "5. Cyber/OSINT: lawful, defensive, educational, consent-based help only.",
    "6. Education: explain from zero to advanced.",
    "7. Project assistant: help build MALIK AI, QADAM X, apps, websites, design, presentations, prompts, APIs.",
    "",
    "OUTPUT RULES:",
    "- Code task: complete working code or exact terminal commands.",
    "- Business task: clear decision, plan, risks and next actions.",
    "- Medical task: safe education, red flags and doctor-next-steps.",
    "- If uncertain, say what is uncertain and how to verify it.",
  ].join("\\n")
}

function buildMalikMessages(input: AIRequest): AIMessage[] {
  const system: AIMessage = { role: "system", content: buildMalikSystemPrompt(input) }
  const context = attachmentContext(input)

  if (input.messages?.length) {
    const cleaned = input.messages.filter((message) => message.role !== "system")
    if (context && cleaned.length) {
      const last = cleaned[cleaned.length - 1]
      cleaned[cleaned.length - 1] = { ...last, content: last.content + context }
    }
    return [system, ...cleaned]
  }

  return [system, { role: "user", content: input.prompt + context }]
}

export const deepSeekProvider: AIProvider = {
  id: "deepseek",
  title: "DeepSeek V4 — MALIK Brain",
  supports: ["chat", "code", "debug", "project", "file_analysis", "research", "general", "enterprise"] as any,

  healthCheck() {
    return health("deepseek", hasEnv("DEEPSEEK_API_KEY"), this.supports, [
      modelFor("deepseek", "chat"),
      modelFor("deepseek", "code"),
      modelFor("deepseek", "file_analysis"),
    ])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.DEEPSEEK_API_KEY
    if (!key) throw new Error("DEEPSEEK_API_KEY not configured")
    if (key.startsWith("sk-or-v1-")) throw new Error("DEEPSEEK_API_KEY contains OpenRouter key. Use official DeepSeek sk- key.")

    const model = modelFor("deepseek", input.task || "chat", input.model)

    const response = await providerFetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({
        model,
        messages: buildMalikMessages(input),
        temperature: temperatureFor(input),
        max_tokens: maxTokensFor(input),
      }),
      signal: input.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || "DeepSeek returned " + response.status)

    return {
      success: true,
      provider: "deepseek",
      model,
      type: responseType(input.task),
      output: payload?.choices?.[0]?.message?.content || "",
      usage: payload?.usage,
      latencyMs: Date.now() - started,
    }
  },

  async generateCode(input: AIRequest) {
    return this.sendMessage({ ...input, task: input.task || "code", maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 5000) })
  },

  async generateImage() {
    throw new Error("DeepSeek does not support image generation.")
  },

  async generateVideo() {
    throw new Error("DeepSeek does not support video generation.")
  },

  async analyzeFile(input: AIRequest) {
    return this.sendMessage({ ...input, task: "file_analysis" })
  },
}
`

const openrouterCode = deepseekCode
  .replace('export const deepSeekProvider: AIProvider', 'export const openRouterProvider: AIProvider')
  .replace('id: "deepseek"', 'id: "openrouter"')
  .replace('DeepSeek V4 — MALIK Brain', 'OpenRouter DeepSeek Fallback')
  .replaceAll('hasEnv("DEEPSEEK_API_KEY")', 'hasEnv("OPENROUTER_API_KEY")')
  .replaceAll('modelFor("deepseek"', 'modelFor("openrouter"')
  .replace('const key = process.env.DEEPSEEK_API_KEY', 'const key = process.env.OPENROUTER_API_KEY')
  .replace('if (!key) throw new Error("DEEPSEEK_API_KEY not configured")', 'if (!key) throw new Error("OPENROUTER_API_KEY not configured")')
  .replace('    if (key.startsWith("sk-or-v1-")) throw new Error("DEEPSEEK_API_KEY contains OpenRouter key. Use official DeepSeek sk- key.")\\n\\n', '')
  .replace('"https://api.deepseek.com/chat/completions"', '"https://openrouter.ai/api/v1/chat/completions"')
  .replace('headers: { "content-type": "application/json", authorization: "Bearer " + key },', 'headers: { "content-type": "application/json", authorization: "Bearer " + key, "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://malikaiworld.world", "X-Title": "MALIK AI Sovereign Hub", "X-OpenRouter-Title": "MALIK AI Sovereign Hub" },')
  .replace('provider: "deepseek"', 'provider: "openrouter"')
  .replace('DeepSeek does not support image generation.', 'OpenRouter image generation is not enabled in Stage 1 core.')
  .replace('DeepSeek does not support video generation.', 'OpenRouter video generation is not enabled in Stage 1 core.')

const all = Object.values(files)

try {
  console.log("=== MALIK AI NODE GOD BRAIN INSTALL ===")
  for (const file of all) backup(file)

  write(files.modes, modeCode)

  let models = read(files.models)
  models = replaceProviderBlock(models, "deepseek", String.raw`deepseek: {
    chat: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    code: process.env.DEEPSEEK_CODE_MODEL || process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
    debug: process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
    project: process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
    file_analysis: process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
    research: process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
    general: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    enterprise: process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
  },`)
  models = replaceProviderBlock(models, "openrouter", String.raw`openrouter: {
    chat: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:free",
    code: process.env.OPENROUTER_CODE_MODEL || process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:free",
    debug: process.env.OPENROUTER_CODE_MODEL || process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:free",
    project: process.env.OPENROUTER_CODE_MODEL || process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:free",
    file_analysis: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:free",
    research: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:free",
    general: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:free",
    enterprise: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:free",
  },`)
  write(files.models, models)

  let registry = read(files.registry)
  registry = registry.replace(/import \{ groqModelId \} from "\.\/config"\r?\n/g, "")
  registry = registry.replace('model: step.provider === "groq" ? groqModelId() : step.model,', "model: step.model,")
  write(files.registry, registry)

  write(files.deepseek, deepseekCode)
  write(files.openrouter, openrouterCode)

  sh("npm run build")

  sh("git add app/templates/sovereign-hub-ui/lib/ai/modes.ts app/templates/sovereign-hub-ui/lib/ai/models.ts app/templates/sovereign-hub-ui/lib/ai/provider-registry.ts app/templates/sovereign-hub-ui/lib/ai/providers/deepseek.ts app/templates/sovereign-hub-ui/lib/ai/providers/openrouter.ts")

  let hasChanges = true
  try {
    cp.execSync("git diff --cached --quiet", { cwd: repo, stdio: "ignore", shell: true })
    hasChanges = false
  } catch (_) {
    hasChanges = true
  }

  if (hasChanges) {
    sh('git -C "' + repo + '" commit -m "Install MALIK AI DeepSeek god brain"')
    sh('git -C "' + repo + '" pull --rebase --autostash origin main')
    sh("npm run build")
    sh('git -C "' + repo + '" push origin main')
  } else {
    console.log("No changes to commit.")
  }

  for (const file of all) cleanup(file)

  console.log("=== MALIK AI DEEPSEEK GOD BRAIN PUSHED ===")
} catch (error) {
  console.error("=== FAILED, RESTORING BACKUPS ===")
  console.error(error && error.message ? error.message : error)
  for (const file of all) restore(file)
  process.exit(1)
}