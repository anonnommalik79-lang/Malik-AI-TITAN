export type IntelligenceKind =
  | "chat"
  | "image"
  | "video"
  | "code"
  | "website"
  | "app"
  | "document"
  | "presentation"
  | "agent"
  | "research"

export type IntelligenceStatus =
  | "idle"
  | "routing"
  | "planning"
  | "generating"
  | "validating"
  | "rendering"
  | "ready"
  | "failed"

export type IntelligenceProvider =
  | "local"
  | "openai"
  | "groq"
  | "xai"
  | "luma"
  | "fal"
  | "runway"
  | "google-veo"
  | "custom"

export type IntentSignal = {
  key: string
  weight: number
  matched: boolean
}

export type IntelligenceIntent = {
  kind: IntelligenceKind
  prompt: string
  confidence: number
  providerGroup: "text" | "media" | "code" | "workflow"
  signals: IntentSignal[]
  language?: string
  framework?: string
  aspectRatio?: "1:1" | "16:9" | "9:16"
  duration?: 5 | 8 | 12
  shouldOpenCanvas: boolean
  shouldSaveHistory: boolean
}

export type IntelligenceTask = {
  id: string
  kind: IntelligenceKind
  prompt: string
  status: IntelligenceStatus
  provider?: IntelligenceProvider
  createdAt: string
  updatedAt: string
  progress: number
  result?: IntelligenceResult
  error?: string
}

export type IntelligenceResult = {
  ok: boolean
  kind: IntelligenceKind
  title: string
  summary: string
  content?: string
  url?: string
  imageUrl?: string
  videoUrl?: string
  files?: GeneratedFile[]
  storyboard?: Storyboard
  diagnostics?: Diagnostic[]
  nextActions?: string[]
}

export type GeneratedFile = {
  path: string
  language: string
  content: string
  purpose: string
}

export type Storyboard = {
  title: string
  aspectRatio: string
  duration?: number
  frames: Array<{ time: string; label: string; shot: string; motion: string }>
}

export type Diagnostic = {
  level: "info" | "warning" | "error"
  code: string
  message: string
}

export type LanguageProfile = {
  id: string
  title: string
  family: string
  extensions: string[]
  defaultFile: string
  comment: string
  runHint: string
  compileHint?: string
  confidence: number
}

export type ProviderHealth = {
  id: IntelligenceProvider | string
  title: string
  configured: boolean
  group: "text" | "image" | "video" | "code" | "storage"
  score: number
  notes: string[]
}

export type LaunchMetric = {
  label: string
  value: string
  tone: "cyan" | "violet" | "emerald" | "amber" | "rose"
}

