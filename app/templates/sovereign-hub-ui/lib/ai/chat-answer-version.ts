import type { MalikModelId } from "./malik-models"
import type { MalikResponseMetrics } from "./token-telemetry"
import type { MalikMessageResearch } from "./web-research-types"

export type ChatAnswerVersion = {
  content: string
  at: number
  research?: MalikMessageResearch
  modelId?: MalikModelId
  responseMetrics?: MalikResponseMetrics
}

export function snapshotChatAnswer(answer: Omit<ChatAnswerVersion, "at">, at: number): ChatAnswerVersion {
  return {
    content: answer.content,
    at,
    // Keep sources in their original order so [n] still points to the same
    // page. The old activity log is unnecessary for rendering this version.
    ...(answer.research ? { research: { ...answer.research, steps: [] } } : {}),
    ...(answer.modelId ? { modelId: answer.modelId } : {}),
    ...(answer.responseMetrics ? { responseMetrics: answer.responseMetrics } : {}),
  }
}
