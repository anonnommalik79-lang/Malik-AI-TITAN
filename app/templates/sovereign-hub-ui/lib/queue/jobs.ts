export type QueueJobStatus = "queued" | "processing" | "completed" | "failed"
export type QueueJobType = "chat" | "image" | "video" | "project" | "file"

export type QueueJob<T = unknown> = {
  id: string
  type: QueueJobType
  status: QueueJobStatus
  payload: T
  result?: unknown
  error?: string
  createdAt: string
  updatedAt: string
}

export type QueueOptions = {
  priority?: number
  delayMs?: number
  attempts?: number
}

