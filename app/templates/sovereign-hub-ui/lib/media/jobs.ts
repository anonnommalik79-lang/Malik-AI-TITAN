import type { TitanVideoProviderId } from "./providers/titan-video"
import type { VideoJobStatus } from "./types"

export type StoredVideoJob = {
  taskId: string
  provider: TitanVideoProviderId
  userId: string
  prompt: string
  status: VideoJobStatus
  model: string
  videoUrl?: string
  error?: string
  statusUrl?: string
  responseUrl?: string
  createdAt: string
  updatedAt: string
}

const jobs = new Map<string, StoredVideoJob>()

export function saveVideoJob(job: StoredVideoJob) {
  jobs.set(job.taskId, job)
}

export function getVideoJob(taskId: string): StoredVideoJob | null {
  return jobs.get(taskId) || null
}

export function getLatestVideoJobForUser(userId: string): StoredVideoJob | null {
  const normalized = userId.trim().toLowerCase()
  let latest: StoredVideoJob | null = null

  for (const job of jobs.values()) {
    if (job.userId.trim().toLowerCase() !== normalized) continue
    if (job.status !== "queued" && job.status !== "generating") continue
    if (!latest || Date.parse(job.createdAt) > Date.parse(latest.createdAt)) latest = job
  }

  return latest
}

export function patchVideoJob(taskId: string, patch: Partial<StoredVideoJob>) {
  const current = jobs.get(taskId)
  if (!current) return null
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
  jobs.set(taskId, next)
  return next
}
