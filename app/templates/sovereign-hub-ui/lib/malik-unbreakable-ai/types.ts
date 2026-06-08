export type UnbreakableStatus =
  | "idle"
  | "checking"
  | "healthy"
  | "degraded"
  | "recovering"
  | "failed"

export type UnbreakableLayer =
  | "ui"
  | "auth"
  | "chat"
  | "media"
  | "code"
  | "storage"
  | "network"
  | "provider"
  | "render"
  | "security"

export type UnbreakableCheck = {
  id: string
  title: string
  layer: UnbreakableLayer
  status: UnbreakableStatus
  score: number
  message: string
  fix?: string
  updatedAt: string
}

export type UnbreakableIncident = {
  id: string
  layer: UnbreakableLayer
  title: string
  message: string
  severity: "low" | "medium" | "high" | "critical"
  createdAt: string
  resolvedAt?: string
  recoveryAction?: string
}

export type UnbreakableProvider = {
  id: string
  title: string
  kind: "text" | "image" | "video" | "code" | "storage" | "auth"
  configured: boolean
  priority: number
  fallback: boolean
  timeoutMs: number
}

export type UnbreakableGeneration = {
  id: string
  kind: "chat" | "image" | "video" | "code" | "website" | "document" | "project"
  prompt: string
  status: UnbreakableStatus
  provider?: string
  resultUrl?: string
  codeFiles?: Array<{ path: string; language: string; content: string }>
  error?: string
  attempts: number
  createdAt: string
  updatedAt: string
}

export type RecoveryPlan = {
  ok: boolean
  title: string
  steps: string[]
  canAutoRecover: boolean
  risk: "safe" | "medium" | "manual"
}

