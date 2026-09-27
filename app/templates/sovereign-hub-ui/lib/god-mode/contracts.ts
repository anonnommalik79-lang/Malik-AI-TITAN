export type GodTaskStatus =
  | "queued"
  | "running"
  | "waiting"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled"

export type GodArtifactKind =
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
  | "other"

export type GodFailureClass =
  | "rate_limited"
  | "timeout"
  | "auth"
  | "quota"
  | "provider_unavailable"
  | "invalid_input"
  | "cancelled"
  | "execution_failed"
  | "unknown"

export type GodTask = {
  id: string
  projectId: string
  type: string
  label: string
  status: GodTaskStatus
  progress?: number
  stage?: string
  dependencies: string[]
  artifactIds: string[]
  attempt: number
  maxAttempts: number
  idempotencyKey?: string
  provider?: string
  errorCode?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}

export type GodArtifact = {
  id: string
  projectId: string
  kind: GodArtifactKind
  title: string
  sourceTaskId?: string
  sourceTool?: string
  version: number
  parentArtifactId?: string
  derivedFrom: string[]
  url?: string
  metadata: Record<string, unknown>
  createdAt: string
  approved?: boolean
}

export type GodActivity = {
  id: string
  at: string
  type: string
  message: string
  taskId?: string
  artifactId?: string
  traceId?: string
  metadata?: Record<string, unknown>
}

export type GodProject = {
  schemaVersion: 1
  id: string
  ownerId: string
  title: string
  goal: string
  status: "active" | "completed" | "failed" | "archived"
  createdAt: string
  updatedAt: string
  tasks: Record<string, GodTask>
  artifacts: Record<string, GodArtifact>
  activity: GodActivity[]
  pinnedArtifactIds: string[]
}

export type ProviderFailure = {
  provider: string
  failureClass: GodFailureClass
  status?: number
  code?: string
  retryable: boolean
}

export type ProviderHealth = {
  provider: string
  samples: number
  successRate: number
  averageLatencyMs: number
  p95LatencyMs: number
  consecutiveFailures: number
  cooldownUntil?: string
  disabled: boolean
  score: number
}

export type PerformanceSample = {
  operation: string
  durationMs: number
  ok: boolean
  at: number
  traceId?: string
}
