import type { COMPUTE_WEIGHTS } from "./config"

export type ComputeOperation = keyof typeof COMPUTE_WEIGHTS
export type ProviderFailure =
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
export type ComputeFailure = ProviderFailure | "EXECUTION_FAILED"

export interface ComputeBalance {
  day: string
  resetsAt: string
  dailyLimit: number
  used: number
  reserved: number
  remaining: number
  usage: Record<ComputeOperation, number>
}

export interface ComputeReservation {
  id: string
  userId: string
  day: string
  operation: ComputeOperation
  amount: number
  status: "reserved" | "settled" | "failed"
  actual: number
  refund: number
  failure?: ComputeFailure
  expiresAt?: string
  jobId?: string
  jobRoute?: string
}

export interface ComputeLedger {
  dailyLimit: number
  used: number
  reserved: number
  usage: Record<ComputeOperation, number>
  requests: number
  failedRequests: number
  fallbackCount: number
  reservations: Record<string, ComputeReservation>
}

// update must be atomic per user/day. The v1 adapter does this synchronously
// in one process. A production database adapter must preserve that guarantee.
export interface ComputeStore {
  read(userId: string, day: string): ComputeLedger
  update(userId: string, day: string, change: (ledger: ComputeLedger) => void): ComputeLedger
  list(day: string): ComputeLedger[]
}

export interface ComputeAdminStats {
  requests: number
  used: number
  reserved: number
  capacity: number
  remaining: number
  failedRequests: number
  fallbackCount: number
  usage: Record<ComputeOperation, number>
  providerHealth: null
  routingDistribution: null
}

export interface ComputePageData {
  mode: "live"
  balance: ComputeBalance
  guest: boolean
  storage: "configured-directory" | "local-directory"
  admin?: ComputeAdminStats
}
