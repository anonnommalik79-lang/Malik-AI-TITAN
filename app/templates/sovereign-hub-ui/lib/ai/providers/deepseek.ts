import type { AIMessage, AIProvider, AIRequest, AIResponse } from "../types"
import { hasEnv, health, providerFetch, responseType } from "./base"
import { buildMalikResponseSystemPrompt } from "../response-intelligence"

function modelForInput(input: AIRequest) {
  if (input.model) return input.model
  if (input.task === "code" || input.task === "debug" || input.task === "project") {
    return process.env.DEEPSEEK_CODE_MODEL || process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro"
  }
  if (input.task === "research" || input.task === "file_analysis" || input.task === "enterprise") {
    return process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro"
  }
  return process.env.DEEPSEEK_FAST_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
}

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
  const files = input.attachments || []
  const text = files
    .map((file, index) => {
      const body = file.text || file.url || file.name || ""
      if (!body) return ""
      return `Attachment ${index + 1}: ${file.name || file.kind || "file"}\n${body}`
    })
    .filter(Boolean)
    .join("\n\n")

  return text ? `\n\nUSER ATTACHMENTS / CONTEXT:\n${text}` : ""
}

function buildMalikSystemPrompt(input: AIRequest) {
  const voiceSystem = input.metadata?.lane === "voice"
    ? input.messages?.filter((message) => message.role === "system").map((message) => message.content).join("\n")
    : ""
  if (voiceSystem) return voiceSystem
  const task = input.task || "chat"
  const mode = String(input.metadata?.malikMode || task)

  return [
    "You are MALIK AI V6.5 TITAN, a sovereign AI command layer built in Kazakhstan.",
    "You are a practical expert AI for real work, not a weak chatbot.",
    "",
    "CORE STYLE:",
    "- Answer in the user's language.",
    "- Be direct, useful, structured and fast.",
    "- Give exact steps, commands, code, tables, plans, checklists and decisions when helpful.",
    "- Never pretend to have done something that was not done.",
    "",
    `CURRENT MODE: ${mode}`,
    `CURRENT TASK: ${task}`,
    "",
    "CAPABILITIES:",
    "1. Business: market analysis, startup strategy, pricing, unit economics, investor pitch, GTM, competitors, roadmap, risks.",
    "2. Coding: TypeScript, Next.js, React, API routes, backend, deployment, GitHub, Render, Cloudflare, AWS, debugging.",
    "3. Medical education and health triage: explain diseases, cancer signs, symptoms, medical reports and risk levels safely. Do not claim a final diagnosis, cure, or replace a doctor. Red flags require urgent medical care.",
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
    "",
    buildMalikResponseSystemPrompt({ prompt: input.prompt, usedWeb: input.task === "research" }),
  ].join("\n")
}

function buildMalikMessages(input: AIRequest): AIMessage[] {
  const system: AIMessage = { role: "system", content: buildMalikSystemPrompt(input) }
  const context = attachmentContext(input)

  if (input.messages?.length) {
    const cleaned = input.messages.filter((message) => message.role !== "system")
    if (context && cleaned.length) {
      const last = cleaned[cleaned.length - 1]
      cleaned[cleaned.length - 1] = { ...last, content: `${last.content}${context}` }
    }
    return [system, ...cleaned]
  }

  return [system, { role: "user", content: `${input.prompt}${context}` }]
}

export const deepSeekProvider: AIProvider = {
  id: "deepseek",
  title: "DeepSeek V4 — MALIK Brain",
  supports: ["chat", "code", "debug", "project", "file_analysis", "research", "general", "enterprise"],

  healthCheck() {
    return health("deepseek", hasEnv("DEEPSEEK_API_KEY"), this.supports, [
      process.env.DEEPSEEK_FAST_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
    ])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.DEEPSEEK_API_KEY
    if (!key) throw new Error("DEEPSEEK_API_KEY not configured")
    if (key.startsWith("sk-or-v1-")) throw new Error("DEEPSEEK_API_KEY contains OpenRouter key. Use official DeepSeek sk- key.")

    const model = modelForInput(input)

    const response = await providerFetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: buildMalikMessages(input),
        temperature: temperatureFor(input),
        max_tokens: maxTokensFor(input),
      }),
      signal: input.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `DeepSeek returned ${response.status}`)

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

  async generateCode(input) {
    return this.sendMessage({ ...input, task: input.task || "code", maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 5000) })
  },

  async generateImage() {
    throw new Error("DeepSeek does not support image generation.")
  },

  async generateVideo() {
    throw new Error("DeepSeek does not support video generation.")
  },

  async analyzeFile(input) {
    return this.sendMessage({ ...input, task: "file_analysis" })
  },
}
