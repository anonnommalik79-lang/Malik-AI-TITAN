import "server-only"
import * as os from "node:os"

/**
 * Full-quality image generation is intentionally expensive: the default master
 * remains Ultra 8K. The dangerous part is letting several libvips/Sharp 8K
 * pipelines peak at the same time on a small Render instance. One request may be
 * fine while two or three together can starve the Next.js process and make the
 * whole site appear frozen.
 *
 * This gate does not reduce resolution, steps, sharpening or compression
 * quality. It only queues the CPU/RAM-heavy post-processing section. External
 * model generation can still happen concurrently; once results are ready they
 * enter this short delivery queue and leave one by one on small hosts.
 */

type ImageProcessingState = {
  active: number
  waiters: Array<() => void>
}

type MalikImageCapacityGlobal = typeof globalThis & {
  __malikImageProcessingState?: ImageProcessingState
}

const HOST_CPUS = (() => {
  try { return Math.max(1, os.cpus().length) } catch { return 1 }
})()

const HOST_MEMORY_BYTES = (() => {
  try { return Math.max(256 * 1024 * 1024, os.totalmem()) } catch { return 2 * 1024 * 1024 * 1024 }
})()

const HOST_MEMORY_GIB = HOST_MEMORY_BYTES / (1024 ** 3)

function automaticCapacity() {
  // Most free/small containers should run one 8K Sharp pipeline at a time.
  // Bigger machines can safely overlap a few without oversubscribing every core.
  if (HOST_MEMORY_GIB >= 24 && HOST_CPUS >= 12) return 3
  if (HOST_MEMORY_GIB >= 12 && HOST_CPUS >= 8) return 2
  return 1
}

function configuredCapacity() {
  const requested = Number(process.env.IMAGE_POSTPROCESS_CONCURRENCY || 0)
  if (Number.isFinite(requested) && requested > 0) {
    return Math.max(1, Math.min(8, Math.floor(requested)))
  }
  return automaticCapacity()
}

export const MALIK_IMAGE_POSTPROCESS_CAPACITY = configuredCapacity()

function processingState() {
  const scope = globalThis as MalikImageCapacityGlobal
  if (!scope.__malikImageProcessingState) {
    scope.__malikImageProcessingState = { active: 0, waiters: [] }
  }
  return scope.__malikImageProcessingState
}

async function acquireImageProcessingSlot() {
  const state = processingState()

  if (state.active < MALIK_IMAGE_POSTPROCESS_CAPACITY) {
    state.active += 1
    return
  }

  // A queued waiter receives the slot directly from release(). `active` stays
  // unchanged during that handoff, so a brand-new request cannot steal the gap
  // and temporarily push the process above its RAM-safe capacity.
  await new Promise<void>((resolve) => state.waiters.push(resolve))
}

function releaseImageProcessingSlot() {
  const state = processingState()
  const next = state.waiters.shift()
  if (next) {
    queueMicrotask(next)
    return
  }
  state.active = Math.max(0, state.active - 1)
}

export async function withMalikImageProcessingSlot<T>(work: () => Promise<T>): Promise<T> {
  await acquireImageProcessingSlot()
  try {
    return await work()
  } finally {
    releaseImageProcessingSlot()
  }
}

export function malikImageProcessingLoad() {
  const state = processingState()
  return {
    active: state.active,
    queued: state.waiters.length,
    capacity: MALIK_IMAGE_POSTPROCESS_CAPACITY,
  }
}
