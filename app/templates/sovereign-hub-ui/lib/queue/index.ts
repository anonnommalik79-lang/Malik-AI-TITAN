import type { QueueJob, QueueJobType, QueueOptions } from "./jobs"

const queue = new Map<string, QueueJob>()

function id(type: QueueJobType) {
  return `queue_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function queueStatus() {
  return {
    configured: Boolean(process.env.REDIS_URL?.trim()),
    mode: process.env.REDIS_URL ? "redis-ready" : "memory-dev",
    size: queue.size,
    message: process.env.REDIS_URL ? "REDIS_URL configured. BullMQ can be enabled later." : "REDIS_URL missing. Using in-memory dev queue.",
  }
}

export async function enqueueJob<T>(type: QueueJobType, payload: T, _options: QueueOptions = {}) {
  const stamp = new Date().toISOString()
  const job: QueueJob<T> = { id: id(type), type, status: "queued", payload, createdAt: stamp, updatedAt: stamp }
  queue.set(job.id, job)
  return job
}

export async function updateQueueJob(id: string, patch: Partial<QueueJob>) {
  const current = queue.get(id)
  if (!current) return null
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
  queue.set(id, next)
  return next
}

export async function getQueueJob(id: string) {
  return queue.get(id) || null
}

export async function listQueueJobs(type?: QueueJobType) {
  return [...queue.values()]
    .filter((job) => !type || job.type === type)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 100)
}

