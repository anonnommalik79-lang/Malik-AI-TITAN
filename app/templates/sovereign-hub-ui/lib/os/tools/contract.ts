import type { ArtifactDraft } from "../store"
import type { Artifact, OsFlow, OsProject, OsTask, ProjectSource, SideEffect, ToolName, ValidationReport } from "../types"

/**
 * The Action/Tool contract. Every capability of Malik AI that a flow can
 * use is a ToolDefinition: a name, what it may cost, how long it may take,
 * how its input is checked, and a run() that returns artifacts. Tools never
 * talk to the browser, never see provider keys, and never write storage
 * directly — the executor stores what they return.
 */

export type OwnerContext = {
  userId: string
  plan: string
  authenticated: boolean
}

export type TextRequest = {
  system: string
  prompt: string
  maxTokens: number
  reasoningEffort?: "low" | "medium" | "high"
  temperature?: number
  signal?: AbortSignal
  allowCatalog?: boolean
}

export type TextResult = { content: string; provider: string; model: string }

export type WebSource = { title: string; url: string; domain: string; snippet?: string; text?: string; publishedAt?: string; provider?: string }

export type ImageRequest = { prompt: string; aspectRatio: "1:1" | "16:9" | "4:5"; mode: "design" | "product" | "cinematic" | "realistic"; owner: OwnerContext; signal?: AbortSignal }

export type ImageResult = {
  url: string
  provider: string
  providerModel?: string
  /** Served by the provider's CDN; may expire. */
  ephemeral: boolean
  /** Copied into Malik object storage. */
  durable: boolean
}

export type SiteRequest = { prompt: string; userId: string; signal?: AbortSignal }
export type SiteResult = {
  html: string
  plan: { brand: { name: string }; hero: { title: string }; sections: unknown[]; locale: string } & Record<string, unknown>
  provider: string
  model: string
  plannerUsed: boolean
  quality: { score: number; issues: string[] }
}

export type DeckSlide = Record<string, unknown> & { id: string; layout: string }
export type DeckOutlineItem = { title: string; point: string; layout: string }
export type DeckOutlineResult = { title: string; items: DeckOutlineItem[] }

export type CodeRequest = { prompt: string; userId: string; signal?: AbortSignal }
export type CodeResult = {
  title: string
  files: Array<{ path: string; content: string }>
  provider: string
  model: string
  qaPassed: boolean
  downloadUrl?: string
  artifactId?: string
  error?: string
}

/**
 * Everything a tool may reach outside itself. The server wires the real
 * implementations (lib/os/runtime.ts); tests pass their own.
 */
export type ToolDeps = {
  text(request: TextRequest): Promise<TextResult>
  search(queries: string[], options: { signal?: AbortSignal; maxPages?: number; onStatus?: (text: string) => void }): Promise<WebSource[]>
  image: {
    check(owner: OwnerContext): Promise<{ ok: true } | { ok: false; code: string; message: string }>
    generate(request: ImageRequest): Promise<ImageResult>
    record(owner: OwnerContext): Promise<void>
  }
  site(request: SiteRequest): Promise<SiteResult>
  presentation: {
    reserve(owner: OwnerContext, cost: number): Promise<{ ok: true } | { ok: false; code: string; message: string }>
    refund(owner: OwnerContext, cost: number): Promise<void>
    maxSlides(owner: OwnerContext): Promise<number>
    outline(input: { topic: string; count: number; language: "ru" | "kk" | "en"; signal?: AbortSignal }): Promise<DeckOutlineResult>
    slides(input: { topic: string; outline: DeckOutlineResult; startIndex: number; count: number; language: "ru" | "kk" | "en" }): Promise<{ slides: Array<{ index: number; slide: DeckSlide }>; missing: number[] }>
  }
  code(request: CodeRequest): Promise<CodeResult>
  /** Renders an edited site plan again (the site skill engine). */
  renderSite?(plan: Record<string, unknown>, prompt: string): Promise<{ html: string; plan: Record<string, unknown> }>
  now(): number
  sleep(ms: number, signal?: AbortSignal): Promise<void>
  random(): number
}

export type DependencyOutput = { task: OsTask; artifacts: Artifact[] }

export type ToolContext = {
  owner: OwnerContext
  flow: Readonly<OsFlow>
  task: Readonly<OsTask>
  project: Readonly<OsProject>
  deps: ToolDeps
  signal: AbortSignal
  /** 1 for the first try. */
  attempt: number
  /** The self-check of the previous attempt, when it did not pass. */
  feedback?: ValidationReport
  /** Operational status for the timeline ("Читаю источники…"). */
  activity(text: string, progress?: number): void
  /** A finished dependency by step id ("brand", "research" …). */
  dependency(stepId: string): DependencyOutput | null
  /** Artifacts given to this task directly (continuation, editing). */
  inputs: Artifact[]
  /** Records that this task spent credits, so a retry does not spend them again. */
  markCharged(): Promise<void>
}

export type ToolResult = {
  artifacts: ArtifactDraft[]
  facts?: Record<string, string>
  decisions?: string[]
  sources?: ProjectSource[]
  provider?: string
}

export type ToolDefinition = {
  name: ToolName
  label: string
  sideEffect: SideEffect
  timeoutMs: number
  /** Returns a reason when the input cannot be used. */
  validate?(input: Record<string, unknown>): string | null
  run(context: ToolContext): Promise<ToolResult>
}
