import { createHash } from "node:crypto"

import { readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"
import type { VideoJobStatus, VideoProviderId } from "./types"

export type StoredVideoJob = {
  taskId: string
  provider: VideoProviderId
  userId: string
  prompt: string
  status: VideoJobStatus
  model: string
  videoUrl?: string
  error?: string
  statusUrl?: string
  responseUrl?: string
  /** Provider credential selector only; secrets are never persisted. */
  credentialSlot?: number
  createdAt: string
  updatedAt: string
}

type MalikVideoJobsGlobal = typeof globalThis & {
  __malikVideoJobs?: Map<string, StoredVideoJob>
}

function jobs() {
  const scope = globalThis as MalikVideoJobsGlobal
  if (!scope.__malikVideoJobs) scope.__malikVideoJobs = new Map<string, StoredVideoJob>()
  return scope.__malikVideoJobs
}

function hash(value: string) {
  return createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex")
}

function jobKey(userId: string, taskId: string) {
  return `private/system/malik-video-jobs/${hash(userId)}/${hash(taskId)}.json`
}

function sameUser(left: string, right: string) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase()
}

async function persist(job: StoredVideoJob) {
  jobs().set(job.taskId, job)
  await writePrivateJson(jobKey(job.userId, job.taskId), job)
  return job
}

export async function saveVideoJob(job: StoredVideoJob) {
  return persist(job)
}

export async function getVideoJob(taskId: string, userId?: string): Promise<StoredVideoJob | null> {
  const id = String(taskId || "").trim()
  if (!id) return null

  const cached = jobs().get(id) || null
  if (cached) {
    if (userId && !sameUser(cached.userId, userId)) return null
    return cached
  }

  // Durable lookup requires the authenticated owner because private state is
  // partitioned by account. Never probe provider task IDs across users.
  if (!userId) return null

  const stored = await readPrivateJson<StoredVideoJob>(jobKey(userId, id))
  if (!stored || stored.taskId !== id || !sameUser(stored.userId, userId)) return null
  jobs().set(stored.taskId, stored)
  return stored
}

export async function getLatestVideoJobForUser(userId: string): Promise<StoredVideoJob | null> {
  const normalized = userId.trim().toLowerCase()
  let latest: StoredVideoJob | null = null

  for (const job of jobs().values()) {
    if (job.userId.trim().toLowerCase() !== normalized) continue
    if (job.status !== "queued" && job.status !== "generating") continue
    if (!latest || Date.parse(job.createdAt) > Date.parse(latest.createdAt)) latest = job
  }

  return latest
}

export async function patchVideoJob(
  taskId: string,
  patch: Partial<StoredVideoJob>,
  userId?: string,
) {
  const current = await getVideoJob(taskId, userId)
  if (!current) return null
  const next = { ...current, ...patch, taskId: current.taskId, userId: current.userId, updatedAt: new Date().toISOString() }
  return persist(next)
}
