import "server-only"

import { createHash } from "node:crypto"
import {
  privateJsonStoreConfigured,
  readPrivateJson,
  writePrivateJson,
} from "@/lib/server/private-json-store"

type DailyVoiceUsage = {
  seconds: number
  date: string
  updatedAt: string
}

type VoiceUsageGlobal = typeof globalThis & {
  __malikVoiceUsage?: Map<string, DailyVoiceUsage>
  __malikVoiceUsageLocks?: Map<string, Promise<unknown>>
}

function scope() {
  const global = globalThis as VoiceUsageGlobal
  if (!global.__malikVoiceUsage) global.__malikVoiceUsage = new Map()
  if (!global.__malikVoiceUsageLocks) global.__malikVoiceUsageLocks = new Map()
  return { memory: global.__malikVoiceUsage, locks: global.__malikVoiceUsageLocks }
}

function dayKey() {
  return new Date().toISOString().slice(0, 10)
}

function nextResetAt() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

function limitSeconds() {
  const configured = Number(process.env.VOICE_DAILY_LIMIT_SECONDS || 120)
  return Number.isFinite(configured) && configured > 0 ? configured : 120
}

function accountHash(userId: string) {
  return createHash("sha256").update(String(userId || "").trim().toLowerCase()).digest("hex")
}

function memoryKey(userId: string) {
  return `${dayKey()}:${accountHash(userId)}`
}

function objectKey(userId: string) {
  return `private/system/malik-voice-daily/${dayKey()}/${accountHash(userId)}.json`
}

async function readState(userId: string): Promise<DailyVoiceUsage> {
  const { memory } = scope()
  const key = memoryKey(userId)
  const cached = memory.get(key)
  if (cached?.date === dayKey()) return cached

  const fresh: DailyVoiceUsage = {
    seconds: 0,
    date: dayKey(),
    updatedAt: new Date().toISOString(),
  }

  if (privateJsonStoreConfigured()) {
    const stored = await readPrivateJson<Partial<DailyVoiceUsage>>(objectKey(userId))
    if (stored?.date === fresh.date) {
      fresh.seconds = Math.max(0, Number(stored.seconds) || 0)
      fresh.updatedAt = String(stored.updatedAt || fresh.updatedAt)
    }
  }

  memory.set(key, fresh)
  return fresh
}

async function writeState(userId: string, state: DailyVoiceUsage) {
  scope().memory.set(memoryKey(userId), state)
  if (!privateJsonStoreConfigured()) return "runtime-memory" as const
  const stored = await writePrivateJson(objectKey(userId), state)
  return stored ? "object-storage" as const : "runtime-memory" as const
}

function serialised<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const { locks } = scope()
  const key = accountHash(userId)
  const previous = locks.get(key) || Promise.resolve()
  const next = previous.catch(() => undefined).then(task)
  locks.set(key, next)
  void next.finally(() => {
    if (locks.get(key) === next) locks.delete(key)
  }).catch(() => undefined)
  return next
}

function snapshot(state: DailyVoiceUsage, unlimited = false, storage: "object-storage" | "runtime-memory" = privateJsonStoreConfigured() ? "object-storage" : "runtime-memory") {
  const limit = limitSeconds()
  return {
    unlimited,
    usedSeconds: unlimited ? 0 : state.seconds,
    limitSeconds: unlimited ? Number.MAX_SAFE_INTEGER : limit,
    remainingSeconds: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - state.seconds),
    date: state.date,
    resetAt: nextResetAt(),
    storage,
  }
}

export async function getVoiceUsage(userId: string, unlimited = false) {
  if (unlimited) {
    const state: DailyVoiceUsage = { seconds: 0, date: dayKey(), updatedAt: new Date().toISOString() }
    return snapshot(state, true)
  }
  return snapshot(await readState(userId), false)
}

export function consumeVoiceUsage(userId: string, seconds: number, unlimited = false) {
  return serialised(userId, async () => {
    const safeSeconds = Math.max(0, Math.min(120, Number.isFinite(seconds) ? seconds : 0))
    if (unlimited) return { ok: true as const, ...(await getVoiceUsage(userId, true)) }

    const state = await readState(userId)
    const before = snapshot(state, false)
    if (safeSeconds <= 0) return { ok: true as const, ...before }
    if (before.usedSeconds + safeSeconds > before.limitSeconds + .25) {
      return { ok: false as const, ...before }
    }

    const next: DailyVoiceUsage = {
      seconds: before.usedSeconds + safeSeconds,
      date: before.date,
      updatedAt: new Date().toISOString(),
    }
    const storage = await writeState(userId, next)
    return { ok: true as const, ...snapshot(next, false, storage) }
  })
}
