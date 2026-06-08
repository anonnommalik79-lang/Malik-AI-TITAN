import { updateQueueJob } from "./index"
import type { QueueJob } from "./jobs"

export type WorkerHandler<T = unknown> = (job: QueueJob<T>) => Promise<unknown>

export async function runDevWorker<T>(job: QueueJob<T>, handler: WorkerHandler<T>) {
  await updateQueueJob(job.id, { status: "processing" })
  try {
    const result = await handler(job)
    return updateQueueJob(job.id, { status: "completed", result })
  } catch (error) {
    return updateQueueJob(job.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

