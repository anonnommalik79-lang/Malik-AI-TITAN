import type { MalikModelId } from "@/lib/ai/malik-models"
import type { ProjectBuilderResult } from "@/lib/ai/project-builder"
import type { NodeTestReceipt } from "@/lib/selfbuild/executor"

export type SkillId = "forge.autopilot" | "deep.research" | "agent.team" | "malik.verify"
export type SkillTool = "plan" | "search" | "read" | "build" | "inspect" | "test" | "publish" | "write" | "researcher" | "implementer" | "reviewer" | "verify"
export type SkillSource = { url: string; title: string; snippet: string; publishedAt?: string; readAt?: string; read: boolean }
export type SkillCheck = { id: string; status: "pass" | "fail" | "not_run"; scope: string; details: string[] }
export type SkillVerification = { status: "pass" | "fail" | "partial"; checks: SkillCheck[]; limits: string[] }
export type SkillOutput = {
  content?: string
  queries?: string[]
  criteria?: string[]
  sources?: SkillSource[]
  project?: ProjectBuilderResult
  execution?: NodeTestReceipt
  artifact?: { id: string; downloadUrl: string; expiresAt: number; filename: string }
  verification?: SkillVerification
}
export type SkillStepSpec = { id: string; tool: SkillTool; label: string; dependencies: string[]; timeoutMs: number }
export type SkillDefinition = { id: SkillId; version: 1; name: string; description: string; tools: SkillTool[]; steps: SkillStepSpec[] }
export type SkillStep = SkillStepSpec & { status: "pending" | "running" | "completed" | "failed"; attempts: number; output?: SkillOutput; outputHash?: string; error?: string; startedAt?: number; finishedAt?: number }
export type SkillRun = {
  version: "malik-skills/1"; id: string; skill: SkillId; owner: string; fingerprint: string
  prompt: string; target?: string; modelId: MalikModelId; status: "running" | "completed" | "partial" | "failed" | "cancelled"
  steps: SkillStep[]; createdAt: number; updatedAt: number; expiresAt: number; durable: boolean
  lease?: { token: string; until: number }; budget: { calls: number; tokens: number; limit: number }
  error?: string; result?: { content: string; sources: SkillSource[]; verification: SkillVerification; artifact?: SkillOutput["artifact"] }
}
export type SkillModelRequest = { systemPrompt: string; prompt: string; maxTokens: number; signal: AbortSignal }
/** Only these server adapters may cross an external boundary. No arbitrary HTTP,
 * shell, deployment, messaging or Git write is exposed to a model/skill. */
export type SkillRuntime = {
  model(input: SkillModelRequest): Promise<string>
  search(query: string, signal: AbortSignal): Promise<SkillSource[]>
  read(source: SkillSource, signal: AbortSignal): Promise<SkillSource | null>
  build(prompt: string, model: (request: SkillModelRequest) => Promise<string>, signal: AbortSignal): Promise<ProjectBuilderResult>
  test(project: ProjectBuilderResult, signal: AbortSignal): Promise<NodeTestReceipt>
  publish(project: ProjectBuilderResult): Promise<NonNullable<SkillOutput["artifact"]>>
}
export type SkillStore = {
  durable: boolean
  read(owner: string, id: string): Promise<{ value: SkillRun | null; revision: string | null }>
  write(owner: string, id: string, value: SkillRun, revision: string | null): Promise<boolean>
}
export class SkillError extends Error {
  constructor(public code: string, public status = 422, public retryable = false) { super(code); this.name = "SkillError" }
}
