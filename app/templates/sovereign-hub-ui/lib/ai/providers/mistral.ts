import { createOpenAICompatibleProvider } from "./openai-compatible"

/**
 * Mistral, for Codestral.
 *
 * Every other provider here is a general chat model asked politely to write
 * code. Codestral is a model trained for it, and Mistral's free tier is one of
 * the few that measures the allowance in billions of tokens a month rather than
 * a handful of requests a day - which is the right shape for a website builder,
 * where one request is a whole HTML document rather than a sentence.
 *
 * The API is OpenAI-compatible, so it needs no client of its own.
 */
export const mistralProvider = createOpenAICompatibleProvider({
  id: "mistral",
  title: "Mistral (Codestral)",
  keyEnv: "MISTRAL_API_KEY",
  baseUrl: process.env.MISTRAL_BASE_URL?.trim() || "https://api.mistral.ai/v1",
  supports: ["chat", "code", "debug", "project", "general", "research"],
})
