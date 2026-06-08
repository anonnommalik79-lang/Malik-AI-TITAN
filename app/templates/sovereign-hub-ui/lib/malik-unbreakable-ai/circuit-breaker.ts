export type CircuitMode = "closed" | "open" | "half-open"

export class UnbreakableCircuitBreaker {
  private failures = 0
  private openedAt = 0
  mode: CircuitMode = "closed"

  constructor(
    readonly id: string,
    private readonly maxFailures = 3,
    private readonly cooldownMs = 30_000,
  ) {}

  canRun() {
    if (this.mode === "closed") return true
    if (Date.now() - this.openedAt > this.cooldownMs) {
      this.mode = "half-open"
      return true
    }
    return false
  }

  success() {
    this.failures = 0
    this.mode = "closed"
  }

  fail() {
    this.failures += 1
    if (this.failures >= this.maxFailures) {
      this.mode = "open"
      this.openedAt = Date.now()
    }
  }

  snapshot() {
    return { id: this.id, mode: this.mode, failures: this.failures, openedAt: this.openedAt }
  }
}

