import { createHash, randomUUID } from "node:crypto"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { computeDirectory } from "@/lib/malik-compute/file-store"
import type { AIPlan } from "@/lib/ai/types"

const configuredDailyTextTokenLimit = Number(process.env.FREE_DAILY_TEXT_TOKEN_LIMIT || 10_000)
export const DAILY_TEXT_TOKEN_LIMIT = Number.isFinite(configuredDailyTextTokenLimit) && configuredDailyTextTokenLimit > 0
  ? Math.floor(configuredDailyTextTokenLimit)
  : 10_000

type StoredQuota = {
  day: string
  used: number
  updatedAt: string
}

export type DailyTextTokenQuota = {
  unlimited: boolean
  used: number
  limit: number | null
  remaining: number | null
  resetAt: string
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function nextUtcResetAt() {
  const now = new Date()
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0,
  )).toISOString()
}

function quotaDirectory() {
  const folder = path.join(computeDirectory(), "text-token-quota")
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  return folder
}

function quotaPath(userId: string) {
  const digest = createHash("sha256").update(userId).digest("hex")
  return path.join(quotaDirectory(), `${digest}.json`)
}

function readStored(userId: string): StoredQuota {
  const day = todayUtc()
  const file = quotaPath(userId)
  if (!existsSync(file)) return { day, used: 0, updatedAt: new Date().toISOString() }

  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<StoredQuota>
    if (parsed.day !== day) return { day, used: 0, updatedAt: new Date().toISOString() }
    return {
      day,
      used: Math.max(0, Math.floor(Number(parsed.used) || 0)),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    // A broken ledger must never silently reset a paid/free allowance.
    throw new Error("DAILY_TEXT_QUOTA_STORAGE_UNAVAILABLE")
  }
}

function writeStored(userId: string, value: StoredQuota) {
  const file = quotaPath(userId)
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 })
    renameSync(temporary, file)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

/**
 * The Compute file ledger already uses an exclusive OS lock. Text allowances
 * need the same protection: atomic rename alone does NOT prevent two Node
 * workers sharing a volume from reading and overwriting each other's count.
 * This protects workers on one filesystem; separate hosts require a durable
 * database ledger before horizontal scaling.
 */
const lockWaitWord = new Int32Array(new SharedArrayBuffer(4))
function withQuotaLock<T>(userId: string, action: () => T): T {
  const lock = quotaPath(userId) + ".lock"
  for (let attempt = 0; attempt < 20; attempt++) {
    let fd: number
    try {
      fd = openSync(lock, "wx", 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new Error("DAILY_TEXT_QUOTA_STORAGE_UNAVAILABLE")
      // Only remove a stale lock when the original process is confirmed gone.
      try {
        const ownerPid = Number(readFileSync(lock, "utf8"))
        if (Number.isSafeInteger(ownerPid) && ownerPid > 0) {
          try { process.kill(ownerPid, 0) }
          catch (probe) {
            if ((probe as NodeJS.ErrnoException).code === "ESRCH") unlinkSync(lock)
          }
        }
      } catch { /* Another worker may still be writing the PID. */ }
      Atomics.wait(lockWaitWord, 0, 0, 5)
      continue
    }
    try {
      writeFileSync(fd, String(process.pid))
      return action()
    } finally {
      closeSync(fd)
      unlinkSync(lock)
    }
  }
  throw new Error("DAILY_TEXT_QUOTA_BUSY")
}

/**
 * Provider usage is not consistently available across free endpoints. For the
 * daily user-facing allowance we therefore estimate generated output at about
 * three characters per token, which is conservative for code/Russian/Kazakh.
 */
export function estimateGeneratedTokens(text: unknown) {
  const value = typeof text === "string" ? text : ""
  if (!value) return 0
  return Math.max(1, Math.ceil(value.length / 3))
}

/**
 * The daily generated-text allowance of a plan. The free cap is a launch
 * guard; it was applied to paying PRO/Ultra accounts too. Paid plans are
 * uncapped unless the owner sets PRO_DAILY_TEXT_TOKEN_LIMIT; the founder
 * account is always uncapped. null means no daily cap.
 */
export function dailyTextTokenLimitFor(plan: AIPlan | boolean | undefined): number | null {
  if (plan === true || plan === "owner") return null
  if (plan === "pro" || plan === "ultra") {
    const configured = Number(process.env.PRO_DAILY_TEXT_TOKEN_LIMIT || "")
    return Number.isFinite(configured) && configured > 0 ? Math.max(DAILY_TEXT_TOKEN_LIMIT, Math.floor(configured)) : null
  }
  return DAILY_TEXT_TOKEN_LIMIT
}

/** `plan` may be the old boolean (true = uncapped) or the account's plan. */
export function getDailyTextTokenQuota(userId: string, plan: boolean | AIPlan = false): DailyTextTokenQuota {
  const limit = dailyTextTokenLimitFor(plan)
  if (limit === null) {
    return {
      unlimited: true,
      used: 0,
      limit: null,
      remaining: null,
      resetAt: nextUtcResetAt(),
    }
  }

  const stored = readStored(userId)
  return {
    unlimited: false,
    used: stored.used,
    limit,
    remaining: Math.max(0, limit - stored.used),
    resetAt: nextUtcResetAt(),
  }
}

export function recordGeneratedTextTokens(userId: string, unlimited: boolean | AIPlan, text: unknown) {
  if (dailyTextTokenLimitFor(unlimited) === null) return getDailyTextTokenQuota(userId, unlimited)

  const tokens = estimateGeneratedTokens(text)
  if (tokens <= 0) return getDailyTextTokenQuota(userId, unlimited)

  return withQuotaLock(userId, () => {
    const current = readStored(userId)
    const updated: StoredQuota = {
      day: todayUtc(),
      used: current.used + tokens,
      updatedAt: new Date().toISOString(),
    }
    writeStored(userId, updated)
    return getDailyTextTokenQuota(userId, unlimited)
  })
}
