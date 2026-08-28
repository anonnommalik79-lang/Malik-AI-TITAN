import { createHash } from "node:crypto"
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { DEFAULT_DAILY_COMPUTE, COMPUTE_WEIGHTS } from "./config"
import { MalikComputeError } from "./service"
import type { ComputeLedger, ComputeStore } from "./types"

const unavailable = () => new MalikComputeError("MALIK_COMPUTE_STORAGE_UNAVAILABLE", "Не удалось прочитать баланс Compute. Попробуйте позже.")

export function computeDirectory() {
  // Runtime-only data: never let build tracing bundle private ledgers/secrets.
  return path.resolve(/* turbopackIgnore: true */ process.env.MALIK_COMPUTE_DATA_DIR || path.join(process.cwd(), ".data", "malik-compute"))
}

// One Node service / shared persistent volume. No in-memory source of truth.
// Exclusive locks fail closed if another worker is writing the same ledger.
export class FileComputeStore implements ComputeStore {
  constructor(private readonly directory = computeDirectory(), private readonly dailyLimit = DEFAULT_DAILY_COMPUTE) {
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 0) throw unavailable()
  }

  private folder(day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw unavailable()
    return path.join(this.directory, day)
  }

  private file(userId: string, day: string) {
    return path.join(this.folder(day), createHash("sha256").update(userId).digest("hex") + ".json")
  }

  private parse(file: string): ComputeLedger {
    try {
      const ledger = JSON.parse(readFileSync(/* turbopackIgnore: true */ file, "utf8")) as ComputeLedger
      const integer = (n: number) => Number.isSafeInteger(n) && n >= 0
      if (![ledger.dailyLimit, ledger.used, ledger.reserved, ledger.requests, ledger.failedRequests, ledger.fallbackCount].every(integer) ||
          !ledger.reservations || typeof ledger.reservations !== "object" || !ledger.usage ||
          !Object.keys(COMPUTE_WEIGHTS).every((key) => integer(ledger.usage[key as keyof typeof COMPUTE_WEIGHTS])) ||
          ledger.used + ledger.reserved > ledger.dailyLimit ||
          Object.values(ledger.usage).reduce((sum, n) => sum + n, 0) !== ledger.used ||
          Object.values(ledger.reservations).filter((item) => item.status === "reserved").reduce((sum, item) => sum + item.amount, 0) !== ledger.reserved) throw unavailable()
      ledger.reservations = Object.assign(Object.create(null), ledger.reservations)
      return ledger
    } catch { throw unavailable() }
  }

  read(userId: string, day: string): ComputeLedger {
    const file = this.file(userId, day)
    if (existsSync(file)) return this.parse(file)
    return {
      dailyLimit: this.dailyLimit, used: 0, reserved: 0, requests: 0, failedRequests: 0, fallbackCount: 0,
      usage: { chat: 0, agent: 0, research: 0, image: 0, voice: 0, video: 0, plugin: 0 },
      reservations: Object.create(null),
    }
  }

  update(userId: string, day: string, change: (ledger: ComputeLedger) => void) {
    mkdirSync(this.folder(day), { recursive: true, mode: 0o700 })
    const file = this.file(userId, day)
    const lock = file + ".lock"
    let lockFd: number
    try { lockFd = openSync(lock, "wx", 0o600) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw unavailable()
      // A crash may leave a lock. Remove it only when its recorded owner is dead.
      try {
        const pid = Number(readFileSync(/* turbopackIgnore: true */ lock, "utf8"))
        if (Number.isSafeInteger(pid) && pid > 0) {
          try { process.kill(pid, 0) }
          catch (probe) { if ((probe as NodeJS.ErrnoException).code === "ESRCH") unlinkSync(lock) }
        }
      } catch { /* A live writer may still be recording its PID. Retry later. */ }
      throw new MalikComputeError("MALIK_COMPUTE_STORE_BUSY", "Compute сохраняет баланс. Попробуйте ещё раз.")
    }
    const temporary = file + "." + process.pid + ".tmp"
    try {
      writeFileSync(lockFd, String(process.pid))
      const ledger = this.read(userId, day)
      change(ledger)
      const fd = openSync(temporary, "w", 0o600)
      try { writeFileSync(fd, JSON.stringify(ledger)); fsyncSync(fd) } finally { closeSync(fd) }
      renameSync(temporary, file)
      return structuredClone(ledger)
    } finally {
      closeSync(lockFd)
      unlinkSync(lock)
      if (existsSync(temporary)) unlinkSync(temporary)
    }
  }

  list(day: string) {
    const folder = this.folder(day)
    if (!existsSync(folder)) return []
    return readdirSync(/* turbopackIgnore: true */ folder).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map((name) => this.parse(path.join(folder, name)))
  }
}
