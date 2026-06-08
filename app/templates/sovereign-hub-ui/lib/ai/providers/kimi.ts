import { createOpenAICompatibleProvider } from "./openai-compatible"

export const kimiProvider = createOpenAICompatibleProvider({
  id: "kimi",
  title: "Kimi Reasoning",
  keyEnv: "MOONSHOT_API_KEY",
  baseUrl: process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1",
  supports: ["chat", "code", "debug", "project", "research", "general"],
})
