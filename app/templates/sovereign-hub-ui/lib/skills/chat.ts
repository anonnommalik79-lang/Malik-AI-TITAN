import "server-only"
import { DEFAULT_MALIK_MODEL_ID, hasMalikProAccess } from "@/lib/ai/malik-models"
import type { MalikModelId } from "@/lib/ai/malik-models"
import type { ExecutionReporter } from "@/lib/ai/chat-execution"
import type { RequestEntitlement } from "@/lib/server/request-entitlement"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { skillChatRequest } from "./chat-intent"
import { getSkillRun, runSkill, skillResultMarkdown, skillRunView } from "./orchestrator"
import { skillRuntime } from "./runtime"
import { skillStore } from "./store"
import { SkillError } from "./types"

export async function runSkillChat(input: { body: Record<string, unknown>; owner?: RequestEntitlement; modelId?: MalikModelId; maxTokens?: number; signal?: AbortSignal; activity?: ExecutionReporter }) {
  const request = skillChatRequest(input.body)
  if (!request) return null
  if (!input.owner?.authenticated) throw new SkillError("SIGN_IN_REQUIRED", 401)
  if (!takeRequestFrequency("skills-chat", input.owner.userId, 8)) throw new SkillError("SKILL_RATE_LIMIT", 429)
  if (Array.isArray(input.body.attachments) && input.body.attachments.length) throw new SkillError("SKILL_TEXT_INPUT_REQUIRED", 400)
  const store = skillStore(), modelId = input.modelId || DEFAULT_MALIK_MODEL_ID
  // A bare /verify targets the previous assistant message; never the whole chat.
  const prompt = request.prompt || (request.skill === "malik.verify" && request.target ? "Проверь предыдущий ответ." : "")
  if (!request.resumeId && (!prompt || request.skill === "malik.verify" && !request.target)) throw new SkillError("SKILL_INPUT_REQUIRED", 400)
  if (request.resumeId) await getSkillRun(store, input.owner.userId, request.resumeId)
  const run = await runSkill({ ownerId: input.owner.userId, skill: request.skill, prompt, target: request.target, modelId,
    requestId: typeof input.body.requestId === "string" ? input.body.requestId : undefined, resumeId: request.resumeId,
    maxTokens: input.maxTokens, signal: input.signal, activity: input.activity }, {
    store, runtime: skillRuntime({ ownerId: input.owner.userId, modelId, allowCatalog: hasMalikProAccess(input.owner.plan) }),
  })
  return { content: skillResultMarkdown(run), provider: "malik-skills-engine", model: modelId, selectedModelId: modelId, usedWeb: Boolean(run.result?.sources.length),
    sources: (run.result?.sources || []).map(s => ({ ...s, domain: new URL(s.url).hostname })), attempts: [], skillRun: skillRunView(run) }
}
