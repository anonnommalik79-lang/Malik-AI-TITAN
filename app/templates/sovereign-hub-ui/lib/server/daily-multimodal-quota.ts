import crypto from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { computeDirectory } from "@/lib/malik-compute/file-store"

const configuredLimit = Number(process.env.MALIK_MULTIMODAL_DAILY_TOKENS || 30_000)
export const DAILY_MULTIMODAL_TOKEN_LIMIT = Number.isFinite(configuredLimit) && configuredLimit > 0
  ? Math.floor(configuredLimit)
  : 30_000

type StoredQuota = {
  day: string
  used: number
}

function utcDay() {
  return new Date().toISOString().slice(0, 10)
}

function quotaDir() {
  return path.join(computeDirectory(), "multimodal-quota")
}

function quotaPath(userId: string) {
  const digest = crypto.createHash("sha256").update(userId || "guest").digest("hex").slice(0, 32)
  return path.join(quotaDir(), `${digest}.json`)
}

function readStored(userId: string): StoredQuota {
  try {
    const file = quotaPath(userId)
    if (!existsSync(file)) return { day: utcDay(), used: 0 }
    const parsed = JSON.parse(readFileSync(file, "utf8")) as StoredQuota
    if (parsed?.day !== utcDay()) return { day: utcDay(), used: 0 }
    return { day: parsed.day, used: Math.max(0, Math.floor(Number(parsed.used || 0))) }
  } catch {
    return { day: utcDay(), used: 0 }
  }
}

function writeStored(userId: string, value: StoredQuota) {
  const dir = quotaDir()
  mkdirSync(dir, { recursive: true })
  const file = quotaPath(userId)
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temp, JSON.stringify(value), "utf8")
  renameSync(temp, file)
}

export function getDailyMultimodalQuota(userId: string, unlimited = false) {
  if (unlimited) {
    return {
      limit: Number.POSITIVE_INFINITY,
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
      resetAt: `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`,
    }
  }

  const stored = readStored(userId)
  return {
    limit: DAILY_MULTIMODAL_TOKEN_LIMIT,
    used: stored.used,
    remaining: Math.max(0, DAILY_MULTIMODAL_TOKEN_LIMIT - stored.used),
    resetAt: `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`,
  }
}

export function recordDailyMultimodalTokens(userId: string, tokens: number, unlimited = false) {
  if (unlimited) return getDailyMultimodalQuota(userId, true)
  const amount = Math.max(0, Math.floor(Number(tokens || 0)))
  const current = readStored(userId)
  writeStored(userId, { day: utcDay(), used: current.used + amount })
  return getDailyMultimodalQuota(userId, false)
}
