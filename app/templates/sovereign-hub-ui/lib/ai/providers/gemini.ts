import type { AIProvider, AIRequest, AIResponse } from "../types"
import { modelFor } from "../models"
import { hasEnv, health, providerFetch, responseType } from "./base"

/**
 * Google renames and retires model ids faster than this file gets edited, and a
 * single hardcoded id is a single point of failure: when "gemini-1.5-pro" was
 * retired, every request to the strongest configured provider came back 404 and
 * the site builder silently fell through to its generic local template.
 *
 * So the id is a list, tried in order, and the first one that answers is
 * remembered for the rest of the process. An explicit GEMINI_MODEL /
 * GEMINI_CODE_MODEL still wins outright.
 */
const GEMINI_CANDIDATES: Record<"code" | "chat", string[]> = {
  code: ["gemini-3-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-flash-latest"],
  chat: ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-flash-latest"],
}

/** Model ids proven to work in this process, so the list is walked once. */
const workingGeminiModel = new Map<string, string>()

function geminiCandidates(task: string, override?: string) {
  const explicit = override
    || (task === "code" || task === "debug" || task === "project"
      ? process.env.GEMINI_CODE_MODEL?.trim()
      : process.env.GEMINI_MODEL?.trim())
  if (explicit) return [explicit]

  const lane = task === "code" || task === "debug" || task === "project" ? "code" : "chat"
  const known = workingGeminiModel.get(lane)
  const candidates = GEMINI_CANDIDATES[lane]
  return known ? [known, ...candidates.filter((model) => model !== known)] : candidates
}

/** A missing or renamed model is worth trying the next candidate for; a bad key is not. */
function modelMissing(status: number, message: string) {
  return status === 404 || status === 400 || /not found|not supported|unknown model|deprecated|retired/i.test(message)
}

function geminiContents(input: AIRequest) {
  const messages = input.messages?.length ? input.messages : [{ role: "user" as const, content: input.prompt }]
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
}

export const geminiProvider: AIProvider = {
  id: "gemini",
  title: "Google Gemini",
  supports: ["chat", "code", "debug", "project", "file_analysis", "research", "general"],

  healthCheck() {
    return health("gemini", hasEnv("GEMINI_API_KEY") || hasEnv("GOOGLE_GENERATIVE_AI_API_KEY"), this.supports, [modelFor("gemini", "chat")])
  },

  async sendMessage(input: AIRequest): Promise<AIResponse> {
    const started = Date.now()
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!key) throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY not configured")

    const task = input.task || "chat"
    const lane = task === "code" || task === "debug" || task === "project" ? "code" : "chat"
    const candidates = geminiCandidates(task, input.model)
    let lastError = ""

    for (const model of candidates) {
      const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: geminiContents(input),
          generationConfig: {
            temperature: input.temperature ?? 0.35,
            maxOutputTokens: input.maxTokens || Number(process.env.MAX_OUTPUT_TOKENS || 1600),
          },
        }),
        signal: input.signal,
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        lastError = payload?.error?.message || `Gemini returned ${response.status}`
        // Only a missing model is worth another candidate. A rejected key or a
        // spent quota would fail identically on every one of them.
        if (modelMissing(response.status, lastError) && candidates.length > 1) continue
        throw new Error(lastError)
      }

      workingGeminiModel.set(lane, model)
      const output = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || ""
      return {
        success: true,
        provider: "gemini",
        model,
        type: responseType(input.task),
        output,
        usage: payload?.usageMetadata,
        latencyMs: Date.now() - started,
      }
    }

    throw new Error(lastError || "Gemini returned no usable model")
  },

  async generateCode(input) {
    return this.sendMessage({ ...input, task: input.task || "code", maxTokens: input.maxTokens || Number(process.env.MAX_CODE_OUTPUT_TOKENS || 4000) })
  },

  async generateImage() {
    throw new Error("Gemini image generation is not enabled in Stage 1 core.")
  },

  async generateVideo() {
    throw new Error("Gemini video generation is not enabled in Stage 1 core.")
  },

  async analyzeFile(input) {
    const fileText = input.attachments?.map((file) => `${file.name}\n${file.text || file.url || ""}`).join("\n\n") || ""
    return this.sendMessage({ ...input, task: "file_analysis", prompt: `${input.prompt}\n\n${fileText}` })
  },
}

