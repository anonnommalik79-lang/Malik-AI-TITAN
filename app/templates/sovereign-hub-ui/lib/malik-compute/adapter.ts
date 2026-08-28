import { DEFAULT_DAILY_COMPUTE } from "./config"
import { estimateCompute, MalikComputeError, MalikComputeService } from "./service"
import type { ComputeFailure, ComputeLedger, ComputeOperation, ComputePageData, ComputeStore } from "./types"

// Development/demo only. Not durable, distributed, or a production billing store.
export class MemoryComputeStore implements ComputeStore {
  private readonly days = new Map<string, Map<string, ComputeLedger>>()
  constructor(private readonly dailyLimit = DEFAULT_DAILY_COMPUTE) {
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 0) throw new Error("Invalid daily compute limit.")
  }
  read(userId: string, day: string): ComputeLedger {
    return structuredClone(this.days.get(day)?.get(userId) ?? {
      dailyLimit: this.dailyLimit, used: 0, reserved: 0,
      usage: { chat: 0, agent: 0, research: 0, image: 0, voice: 0, video: 0, plugin: 0 },
      requests: 0, failedRequests: 0, fallbackCount: 0, reservations: Object.create(null),
    })
  }
  update(userId: string, day: string, change: (ledger: ComputeLedger) => void) {
    const ledger = this.read(userId, day)
    // Keep request IDs such as "__proto__" out of Object.prototype.
    ledger.reservations = Object.assign(Object.create(null), ledger.reservations)
    change(ledger)
    if (!this.days.has(day)) this.days.set(day, new Map())
    this.days.get(day)!.set(userId, structuredClone(ledger))
    return structuredClone(ledger)
  }
  list(day: string) { return [...(this.days.get(day)?.values() ?? [])].map((entry) => structuredClone(entry)) }
}

export function classifyComputeFailure(error: unknown): ComputeFailure {
  const value = error as { code?: string; status?: number; name?: string } | null
  if (value?.status === 429 || value?.code === "PROVIDER_RATE_LIMITED") return "PROVIDER_RATE_LIMITED"
  if (value?.status === 408 || value?.status === 504 || value?.name === "TimeoutError" || value?.code === "ETIMEDOUT" || value?.code === "PROVIDER_TIMEOUT") return "PROVIDER_TIMEOUT"
  if ((value?.status && value.status >= 500) || value?.code === "PROVIDER_UNAVAILABLE") return "PROVIDER_UNAVAILABLE"
  return "EXECUTION_FAILED"
}

// Ready integration boundary. No provider routing, names, SDKs or raw errors here.
// The caller supplies authenticated identity, a server-generated request ID,
// an upper-bound estimate and measured usage. A fallback stays in this reservation.
export async function executeWithCompute<T>(input: {
  service: MalikComputeService
  userId: string
  requestId: string
  operation: ComputeOperation
  estimate?: number
  execute: (reportFallback: () => void) => Promise<{ value: T; actualCompute: number }>
}): Promise<{ ok: true; value: T; charged: number; refunded: number } | { ok: false; code: string; message: string }> {
  let reservation: ReturnType<MalikComputeService["reserveCompute"]> | undefined
  try {
    reservation = input.service.reserveCompute(input.userId, input.estimate ?? estimateCompute(input.operation), input.operation, input.requestId)
    if (reservation.replayed) {
      // Do not execute/charge a completed request twice; caller may replay its cached result.
      throw new MalikComputeError("MALIK_COMPUTE_REQUEST_DUPLICATE", "This request is already being processed or has completed.")
    }
    const result = await input.execute(() => input.service.recordFallback(reservation!))
    const settled = input.service.settleCompute(reservation, result.actualCompute)
    return { ok: true, value: result.value, charged: settled.actual, refunded: settled.refund }
  } catch (error) {
    if (reservation && !reservation.replayed) input.service.failCompute(reservation, classifyComputeFailure(error))
    if (error instanceof MalikComputeError) return { ok: false, code: error.code, message: error.message }
    return { ok: false, code: classifyComputeFailure(error), message: "Malik AI is temporarily unavailable. Please try again. Your Compute was not charged." }
  }
}

// TODO production: replace with a durable per-user store and authoritative usage.
// /api/stream was inspected: it drops usage metadata and also serves cached and
// multimodal answers. Keep its working behavior intact until those paths can
// provide a trusted cost and cancellation/expiry policy to executeWithCompute.
export function getDemoComputePageData(includeAdmin: boolean, now = () => new Date()): ComputePageData {
  const snapshotTime = now()
  const service = new MalikComputeService(new MemoryComputeStore(), () => snapshotTime)
  for (const [operation, amount] of [["chat", 84], ["agent", 50], ["research", 61], ["image", 45]] as const) {
    const reservation = service.reserveCompute("demo", amount, operation, "demo-" + operation)
    service.settleCompute(reservation, amount)
  }
  return {
    mode: "demo",
    balance: service.getComputeBalance("demo"),
    ...(includeAdmin ? { admin: service.getAdminStats() } : {}),
  }
}
