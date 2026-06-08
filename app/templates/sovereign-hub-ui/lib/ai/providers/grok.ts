import { createOpenAICompatibleProvider } from "./openai-compatible"

export const grokProvider = createOpenAICompatibleProvider({
  id: "grok",
  title: "Grok Reasoning",
  keyEnv: "XAI_API_KEY",
  baseUrl: process.env.GROK_BASE_URL || "https://api.x.ai/v1",
  supports: ["chat", "code", "debug", "research", "general"],
})
