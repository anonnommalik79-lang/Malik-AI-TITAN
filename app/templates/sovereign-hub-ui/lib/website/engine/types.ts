import type { AIPlan } from "@/lib/ai/types"
import type { ProjectFile } from "@/lib/work/code/files"

export const ENGINE_VERSION = "malik-website-engine/1"
export const STAGES = ["queued", "planning", "designing", "assets", "coding", "installing", "building", "testing", "preview_ready", "completed"] as const
export type Stage = typeof STAGES[number]
export type JobState = Stage | "failed" | "cancelled" | "paused" | "resuming"
export type Check = { status: "pass" | "fail" | "not_run" | "not_required"; details: string[] }
export type Design = {
  direction: string; audience: string; composition: string; typography: string; palette: string[]
  spacing: string; motion: string; accessibility: string[]; performance: string[]
  stack: "static" | "next"; sections: string[]; interactions: string[]
  files: Array<{ path: string; purpose: string }>
  mediaQueries: Array<{ slot: string; kind: "image" | "video"; query: string }>
}
export type Asset = {
  slot: string; kind: "image" | "video"; url: string; poster?: string
  source: "pexels" | "nasa" | "unsplash"; sourcePage: string; credit: string; license: string
  creatorUrl?: string
  verifiedAt: string; mime: string; width?: number; height?: number; srcSet?: string
}
export type Event = { seq: number; at: string; stage: JobState; message: string }
export type Revision = { id: string; at: string; summary: string }
export type WebsiteJob = {
  version: typeof ENGINE_VERSION; id: string; owner: string; actor: string; plan: AIPlan; modelId: string
  workspaceRoot: string; prompt: string; originalPrompt: string; title: string
  state: JobState; checkpoint: Stage; cursor: number; repairAttempts: number; failures: number
  lease?: { token: string; until: number }; retryAt?: number; error?: string
  createdAt: string; updatedAt: string; revision: number
  authorizationExpiresAt: number
  files: ProjectFile[]; revisions: Revision[]; events: Event[]; design?: Design; assets: Asset[]
  checks: { static: Check; dependencies: Check; build: Check; browser: Check; media: Check }
  execution?: { id: string; status: "queued" | "running" | "completed" | "failed"; previewUrl?: string; polls?: number }
}
export const blankChecks = (): WebsiteJob["checks"] => ({
  static: { status: "not_run", details: [] }, dependencies: { status: "not_run", details: [] },
  build: { status: "not_run", details: [] }, browser: { status: "not_run", details: [] }, media: { status: "not_run", details: [] },
})
export const terminal = (state: JobState) => state === "completed" || state === "failed" || state === "cancelled"
export function event(job: WebsiteJob, message: string) {
  job.updatedAt = new Date().toISOString()
  job.events.push({ seq: (job.events.at(-1)?.seq || 0) + 1, at: job.updatedAt, stage: job.state, message: message.slice(0, 1200) })
  job.events = job.events.slice(-200)
}
export function transition(job: WebsiteJob, next: Stage, message: string) {
  const current = STAGES.indexOf(job.checkpoint)
  if (STAGES.indexOf(next) !== current + 1) throw new Error("INVALID_STAGE_TRANSITION")
  job.state = next; job.checkpoint = next; job.failures = 0; job.retryAt = undefined; job.error = undefined
  event(job, message)
}
