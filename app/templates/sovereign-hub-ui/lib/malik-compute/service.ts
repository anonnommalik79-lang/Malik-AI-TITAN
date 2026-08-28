import { COMPUTE_WEIGHTS, COMPUTE_RESERVATION_TTL_MS, MAX_AGENT_COMPUTE } from "./config"
import type {
  ComputeAdminStats, ComputeBalance, ComputeFailure, ComputeOperation,
  ComputeReservation, ComputeStore, ComputeLedger,
} from "./types"

export class MalikComputeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "MalikComputeError"
  }
}

function units(value: number, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new MalikComputeError("MALIK_COMPUTE_INVALID_AMOUNT", "Compute must be a non-negative whole number.")
  }
  return value
}

export function estimateCompute(operation: ComputeOperation, quantity = 1) {
  if (!Object.hasOwn(COMPUTE_WEIGHTS, operation)) {
    throw new MalikComputeError("MALIK_COMPUTE_INVALID_OPERATION", "Unknown capability.")
  }
  return units(COMPUTE_WEIGHTS[operation] * units(quantity, 1), 1)
}

function limitReached(): never {
  throw new MalikComputeError("MALIK_COMPUTE_LIMIT_REACHED", "You’ve reached today’s Malik usage limit.")
}

function usageTemplate() {
  return { chat: 0, agent: 0, research: 0, image: 0, voice: 0, video: 0, plugin: 0 }
}

export class MalikComputeService {
  constructor(private readonly store: ComputeStore, private readonly now = () => new Date()) {}

  private day() { return this.now().toISOString().slice(0, 10) }
  private identity(userId: string) {
    if (!userId.trim()) throw new MalikComputeError("MALIK_COMPUTE_INVALID_USER", "A user identity is required.")
  }

  private expire(ledger: ComputeLedger) {
    for (const item of Object.values(ledger.reservations)) {
      if (item.status === "reserved" && item.expiresAt && Date.parse(item.expiresAt) <= this.now().getTime()) {
        ledger.reserved -= item.amount
        ledger.failedRequests += 1
        Object.assign(item, { status: "failed", actual: 0, refund: item.amount, failure: "PROVIDER_TIMEOUT" })
      }
    }
  }

  getComputeBalance(userId: string): ComputeBalance {
    this.identity(userId)
    const day = this.day()
    let ledger = this.store.read(userId, day)
    if (Object.values(ledger.reservations).some((item) => item.status === "reserved" && item.expiresAt && Date.parse(item.expiresAt) <= this.now().getTime())) {
      ledger = this.store.update(userId, day, (current) => this.expire(current))
    }
    return {
      day, resetsAt: new Date(Date.parse(day + "T00:00:00Z") + 86400000).toISOString(),
      dailyLimit: ledger.dailyLimit, used: ledger.used, reserved: ledger.reserved,
      remaining: ledger.dailyLimit - ledger.used - ledger.reserved,
      usage: { ...ledger.usage },
    }
  }

  hasEnoughCompute(userId: string, requiredAmount: number) {
    return this.getComputeBalance(userId).remaining >= units(requiredAmount)
  }

  // requestId is a server-owned idempotency key, reused for retries of one request.
  reserveCompute(userId: string, amount: number, operation: ComputeOperation, requestId: string): ComputeReservation & { replayed: boolean } {
    this.identity(userId)
    units(amount, 1)
    estimateCompute(operation)
    if (!requestId.trim()) throw new MalikComputeError("MALIK_COMPUTE_INVALID_REQUEST", "A request identity is required.")
    if (operation === "agent" && amount > MAX_AGENT_COMPUTE) {
      throw new MalikComputeError("MALIK_COMPUTE_AGENT_BUDGET", "Agent compute budget exceeded.")
    }
    const day = this.day()
    let replayed = false
    const ledger = this.store.update(userId, day, (current) => {
      this.expire(current)
      const existing = current.reservations[requestId]
      if (existing) {
        if (existing.amount !== amount || existing.operation !== operation) {
          throw new MalikComputeError("MALIK_COMPUTE_REQUEST_CONFLICT", "Request identity already used.")
        }
        replayed = true
        return
      }
      if (current.dailyLimit - current.used - current.reserved < amount) limitReached()
      current.reserved += amount
      current.requests += 1
      current.reservations[requestId] = {
        id: requestId, userId, day, operation, amount, status: "reserved", actual: 0, refund: 0,
        expiresAt: new Date(this.now().getTime() + COMPUTE_RESERVATION_TTL_MS).toISOString(),
      }
    })
    return { ...ledger.reservations[requestId], replayed }
  }

  settleCompute(reservation: ComputeReservation, actualAmount: number, operation?: ComputeOperation, fallbackCount = 0): ComputeReservation {
    units(actualAmount)
    if (operation) estimateCompute(operation)
    units(fallbackCount)
    return this.finish(reservation, actualAmount, undefined, operation, fallbackCount)
  }

  failCompute(reservation: ComputeReservation, failure: ComputeFailure): ComputeReservation {
    return this.finish(reservation, 0, failure)
  }

  private finish(reservation: ComputeReservation, actual: number, failure?: ComputeFailure, operation?: ComputeOperation, fallbackCount = 0) {
    this.identity(reservation.userId)
    // Settle against the reservation's day, even if execution crossed midnight.
    const ledger = this.store.update(reservation.userId, reservation.day, (current) => {
      this.expire(current)
      const stored = current.reservations[reservation.id]
      if (!stored) throw new MalikComputeError("MALIK_COMPUTE_RESERVATION_MISSING", "Reservation not found.")
      if (stored.status !== "reserved") {
        // Expired/cancelled work can never charge later.
        if (stored.failure === "PROVIDER_TIMEOUT") return
        if (stored.actual !== actual || stored.failure !== failure || (operation && operation !== stored.operation)) {
          throw new MalikComputeError("MALIK_COMPUTE_REQUEST_CONFLICT", "Reservation already closed.")
        }
        return
      }
      if (actual > stored.amount) {
        throw new MalikComputeError("MALIK_COMPUTE_ESTIMATE_EXCEEDED", "Actual compute exceeds the reservation.")
      }
      current.reserved -= stored.amount
      current.used += actual
      current.fallbackCount += fallbackCount
      if (operation) stored.operation = operation
      current.usage[stored.operation] += actual
      if (failure) current.failedRequests += 1
      stored.actual = actual
      stored.refund = stored.amount - actual
      stored.failure = failure
      stored.status = failure ? "failed" : "settled"
    })
    return { ...ledger.reservations[reservation.id] }
  }

  attachJob(reservation: ComputeReservation, jobId: string, jobRoute: string) {
    this.store.update(reservation.userId, reservation.day, (ledger) => {
      const stored = ledger.reservations[reservation.id]
      if (!stored || stored.status !== "reserved") throw new MalikComputeError("MALIK_COMPUTE_RESERVATION_MISSING", "Reservation not found.")
      stored.jobId = jobId
      stored.jobRoute = jobRoute
    })
  }

  findJob(userId: string, jobId: string, jobRoute: string) {
    // Jobs may cross UTC midnight; their reservation still belongs to the old day.
    for (const date of [this.now(), new Date(this.now().getTime() - 86400000)]) {
      const ledger = this.store.read(userId, date.toISOString().slice(0, 10))
      const match = Object.values(ledger.reservations).find((item) => item.jobId === jobId && item.jobRoute === jobRoute)
      if (match) return { ...match }
    }
    return undefined
  }

  recordFallback(reservation: ComputeReservation) {
    this.store.update(reservation.userId, reservation.day, (current) => {
      if (current.reservations[reservation.id]?.status !== "reserved") {
        throw new MalikComputeError("MALIK_COMPUTE_RESERVATION_MISSING", "An open reservation is required.")
      }
      current.fallbackCount += 1
    })
  }

  // Caller must enforce server-side owner authorization before publishing this.
  getAdminStats(): ComputeAdminStats {
    return this.store.list(this.day()).reduce<ComputeAdminStats>((total, ledger) => {
      this.expire(ledger)
      total.requests += ledger.requests
      total.used += ledger.used
      total.reserved += ledger.reserved
      total.capacity += ledger.dailyLimit
      total.remaining += ledger.dailyLimit - ledger.used - ledger.reserved
      total.failedRequests += ledger.failedRequests
      total.fallbackCount += ledger.fallbackCount
      for (const operation of Object.keys(total.usage) as ComputeOperation[]) total.usage[operation] += ledger.usage[operation]
      return total
    }, {
      requests: 0, used: 0, reserved: 0, capacity: 0, remaining: 0,
      failedRequests: 0, fallbackCount: 0, usage: usageTemplate(),
      providerHealth: null, routingDistribution: null,
    })
  }
}
