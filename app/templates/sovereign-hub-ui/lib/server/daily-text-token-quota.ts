import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { computeDirectory } from "@/lib/malik-compute/file-store"

export const DAILY_TEXT_TOKEN_LIMIT = 8_000

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
    return { day, used: 0, updatedAt: new Date().toISOString() }
  }
}

function writeStored(userId: string, value: StoredQuota) {
  const file = quotaPath(userId)
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 })
  renameSync(temporary, file)
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

export function getDailyTextTokenQuota(userId: string, unlimited = false): DailyTextTokenQuota {
  if (unlimited) {
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
    limit: DAILY_TEXT_TOKEN_LIMIT,
    remaining: Math.max(0, DAILY_TEXT_TOKEN_LIMIT - stored.used),
    resetAt: nextUtcResetAt(),
  }
}

export function recordGeneratedTextTokens(userId: string, unlimited: boolean, text: unknown) {
  if (unlimited) return getDailyTextTokenQuota(userId, true)

  const tokens = estimateGeneratedTokens(text)
  if (tokens <= 0) return getDailyTextTokenQuota(userId, false)

  const current = readStored(userId)
  const updated: StoredQuota = {
    day: todayUtc(),
    used: current.used + tokens,
    updatedAt: new Date().toISOString(),
  }
  writeStored(userId, updated)
  return getDailyTextTokenQuota(userId, false)
}
