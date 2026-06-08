import type { AIProviderId } from "./types"

export type AIJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled"
export type AIJobType = "image" | "video" | "project" | "file_analysis"

export type AIJobInput = {
  prompt: string
  userId?: string
  userEmail?: string
  provider?: "auto" | AIProviderId | string
  style?: string
  quality?: "standard" | "high" | "premium"
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4"
  duration?: 5 | 8 | 10 | 12
  metadata?: Record<string, unknown>
}

export type AIJobOutput = {
  resultUrl?: string
  thumbnailUrl?: string
  provider?: string
  model?: string
  message?: string
  raw?: unknown
}

export type AIJob = {
  id: string
  type: AIJobType
  status: AIJobStatus
  input: AIJobInput
  output?: AIJobOutput
  error?: string
  provider?: string
  model?: string
  createdAt: string
  updatedAt: string
}

const jobs = new Map<string, AIJob>()
const maxJobs = 250

function now() {
  return new Date().toISOString()
}

function createId(type: AIJobType) {
  return `job_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function trimJobs() {
  if (jobs.size <= maxJobs) return
  const oldest = [...jobs.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, jobs.size - maxJobs)
  oldest.forEach((job) => jobs.delete(job.id))
}

export function createAIJob(type: AIJobType, input: AIJobInput): AIJob {
  const stamp = now()
  const job: AIJob = {
    id: createId(type),
    type,
    status: "queued",
    input,
    provider: typeof input.provider === "string" ? input.provider : "auto",
    createdAt: stamp,
    updatedAt: stamp,
  }

  jobs.set(job.id, job)
  trimJobs()
  return job
}

export function updateAIJob(id: string, patch: Partial<AIJob>) {
  const current = jobs.get(id)
  if (!current) return null
  const next: AIJob = { ...current, ...patch, updatedAt: now() }
  jobs.set(id, next)
  return next
}

export function getAIJob(id: string) {
  return jobs.get(id) || null
}

export function listAIJobs(userId?: string) {
  return [...jobs.values()]
    .filter((job) => !userId || job.input.userId === userId || job.input.userEmail === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 100)
}

export async function runInMemoryMediaJob(job: AIJob, runner: (job: AIJob) => Promise<AIJobOutput>) {
  updateAIJob(job.id, { status: "processing" })
  try {
    const output = await runner(job)
    return updateAIJob(job.id, {
      status: "completed",
      output,
      provider: output.provider || job.provider,
      model: output.model,
    })
  } catch (error) {
    return updateAIJob(job.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

