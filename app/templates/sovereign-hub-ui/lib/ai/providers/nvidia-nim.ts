import { createOpenAICompatibleProvider } from "./openai-compatible"

export const nvidiaNimProvider = createOpenAICompatibleProvider({
  id: "nvidia-nim",
  title: "NVIDIA NIM",
  keyEnv: "NVIDIA_NIM_API_KEY",
  baseUrl: process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1",
  supports: ["chat", "code", "general", "enterprise"],
  enabled: () => process.env.NVIDIA_NIM_ENABLED === "true",
})
