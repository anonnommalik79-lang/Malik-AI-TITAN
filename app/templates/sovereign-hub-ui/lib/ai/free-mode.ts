import { FREE_PROVIDER_IDS, isFreeModeEnabled } from "./provider-status"
import type { AIRequest } from "./types"

/** Restrict routing to Groq / Gemini / OpenRouter when AI_FREE_MODE is enabled. */
export function applyFreeModeRequest(request: AIRequest): AIRequest {
  if (!isFreeModeEnabled()) return request
  return {
    ...request,
    metadata: {
      ...request.metadata,
      allowedProviders: FREE_PROVIDER_IDS,
      freeMode: true,
    },
  }
}
