/**
 * Malik AI OS — the shared vocabulary.
 *
 * One user goal becomes a Flow: a graph of Tasks. Tasks call Tools (every
 * capability of Malik AI behind one contract) and produce Artifacts. A
 * Project holds the goal, the decisions made on the way, the sources that
 * were read and every artifact, so the next task — or the next conversation,
 * typed or spoken — continues from the same memory.
 *
 * These types are shared by the server (executor, stores, routes) and the
 * browser (the Superflow block in the chat, mission control, the library),
 * so this file imports nothing.
 */

export type TaskStatus =
  | "planned"
  | "queued"
  | "running"
  | "waiting"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled"

export type FlowStatus = "planned" | "running" | "completed" | "partial" | "failed" | "cancelled"

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ["completed", "failed", "cancelled"]
export const TERMINAL_FLOW_STATUSES: readonly FlowStatus[] = ["completed", "partial", "failed", "cancelled"]

export type ArtifactKind =
  | "text"
  | "code"
  | "image"
  | "video"
  | "audio"
  | "website"
  | "presentation"
  | "document"
  | "dataset"
  | "analysis"
  | "business-plan"

export type ToolName =
  | "goal.understand"
  | "research.web"
  | "brand.create"
  | "image.generate"
  | "site.generate"
  | "presentation.generate"
  | "document.write"
  | "business.plan"
  | "business.launch"
  | "video.script"
  | "code.project"
  | "data.analyze"
  | "artifact.edit"
  | "result.assemble"

export type SideEffect = "none" | "paid" | "external"

/** Why a task failed, in words for the person and a code for the system. */
export type OsError = {
  code: string
  /** Shown in the interface. Never a raw stack or "Load failed". */
  message: string
  retryable: boolean
  provider?: string
  /** What the interface can offer: try again, use a fallback, sign in … */
  action?: "retry" | "fallback" | "sign-in" | "upgrade" | "wait" | "none"
}

export type RetryInfo = {
  attempts: number
  maxAttempts: number
  nextRetryAt?: number
  lastErrorCode?: string
}

export type OsTask = {
  id: string
  type: ToolName
  label: string
  /** Operational status while running ("Ищу источники…"). Never reasoning. */
  activity?: string
  status: TaskStatus
  progress: number
  dependencies: string[]
  /**
   * Dependencies this task reads when they succeed but can run without
   * (a subset of `dependencies`): the site uses the logo if there is one.
   */
  softDependencies?: string[]
  input: Record<string, unknown>
  startedAt?: number
  finishedAt?: number
  artifactIds: string[]
  error?: OsError
  retry: RetryInfo
  /** Provider or route that produced the result (after failover, the one that worked). */
  provider?: string
  /** Stable key: a retry never charges or creates the result twice. */
  idempotencyKey: string
  /** Credits taken for this task, so a retry does not take them again. */
  charged?: boolean
  optional?: boolean
}

export type OsFlow = {
  events?: WorkEvent[]
  id: string
  projectId: string
  ownerId: string
  goal: string
  status: FlowStatus
  tasks: OsTask[]
  createdAt: number
  updatedAt: number
  finishedAt?: number
  /** The request the browser sent; the same id never starts a second flow. */
  clientRequestId: string
  chatId?: string
  quality: QualityTier
  capabilities: Capability[]
  demo?: boolean
  summary?: string
  /** Set when the server restarted while this flow was running. */
  interrupted?: boolean
}

export type Capability =
  | "research"
  | "brand"
  | "image"
  | "website"
  | "presentation"
  | "document"
  | "business-plan"
  | "video-script"
  | "code"
  | "data"

export type QualityTier = "fast" | "balanced" | "deep"

export type ArtifactRelation = "derived-from" | "input-of" | "revision-of" | "illustrates"

export type ArtifactLink = { relation: ArtifactRelation; artifactId: string }

export type Artifact = {
  id: string
  projectId: string
  ownerId: string
  kind: ArtifactKind
  title: string
  createdAt: number
  sourceTool: ToolName | "user" | "import"
  sourceTask?: string
  /** A public URL (media in object storage) — never bytes. */
  url?: string
  /** Text content up to MAX_INLINE_ARTIFACT_CHARS (HTML, markdown, JSON). */
  content?: string
  mime?: string
  summary?: string
  metadata: Record<string, unknown>
  links: ArtifactLink[]
  /** Present only when the artifact is a saved copy, not a new result. */
  fallback?: { kind: "demo-cache"; cachedAt: number; originalCreatedAt: number }
  validation?: ValidationReport
  version?: number
}

export type ValidationReport = {
  ok: boolean
  score: number
  checks: Array<{ id: string; ok: boolean; note: string }>
  checkedAt: number
}

export type ProjectDecision = { id: string; text: string; at: number; source: "user" | "task" | "voice"; taskId?: string }
export type ProjectSource = { url: string; title: string; domain?: string; at: number }

export type OsProject = {
  id: string
  ownerId: string
  title: string
  goal: string
  createdAt: number
  updatedAt: number
  chatId?: string
  decisions: ProjectDecision[]
  sources: ProjectSource[]
  artifactIds: string[]
  flowIds: string[]
  /** Short operational notes the next task reads (brand name, audience …). */
  facts: Record<string, string>
}

export type OsEvent =
  | { type: "work"; flowId: string; event: WorkEvent }
  | { type: "flow"; flow: OsFlow }
  | { type: "task"; flowId: string; task: OsTask }
  | { type: "artifact"; flowId: string; artifact: ArtifactSummary }
  | { type: "done"; flowId: string; status: FlowStatus }

export type WorkEvent = {
  id: string
  at: number
  type: "task.created" | "plan.ready" | "skill.selected" | "tool.started" | "tool.retrying" | "tool.completed" | "tool.failed" | "artifact.ready" | "task.completed" | "task.failed" | "task.cancelled"
  taskId?: string
  tool?: string
  label?: string
  attempt?: number
  durationMs?: number
  artifactId?: string
  error?: string
}

/** What the browser needs to show an artifact card, without its content. */
export type ArtifactSummary = Pick<
  Artifact,
  "id" | "projectId" | "kind" | "title" | "createdAt" | "sourceTool" | "sourceTask" | "url" | "mime" | "summary" | "fallback" | "validation" | "version"
> & { links: ArtifactLink[]; hasContent: boolean; bytes?: number }

export const MAX_INLINE_ARTIFACT_CHARS = 400_000

export function summarizeArtifact(artifact: Artifact): ArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    kind: artifact.kind,
    title: artifact.title,
    createdAt: artifact.createdAt,
    sourceTool: artifact.sourceTool,
    sourceTask: artifact.sourceTask,
    url: artifact.url,
    mime: artifact.mime,
    summary: artifact.summary,
    fallback: artifact.fallback,
    validation: artifact.validation,
    version: artifact.version,
    links: artifact.links,
    hasContent: Boolean(artifact.content),
    bytes: artifact.content ? artifact.content.length : undefined,
  }
}
