import { resolveUserTier, type UserTier } from "@/lib/limits/user-plan"
import { getPersistedUsage, incrementPersistedUsage } from "@/lib/server/usage-persistence"
import type { AIPlan } from "@/lib/ai/types"

type MediaKind = "image" | "video"
export type ImageCreditSize = "1K" | "2K" | "4K"

const memoryImage = new Map<string, number>()
const memoryVideo = new Map<string, number>()

function dateKey(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${values.year}-${values.month}-${values.day}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

export function mediaResetTimeZone() {
  return process.env.MEDIA_RESET_TIMEZONE?.trim() || process.env.IMAGE_RESET_TIMEZONE?.trim() || "Asia/Almaty"
}

function dayKey(userId: string, _kind: MediaKind = "video") {
  return `${dateKey(new Date(), mediaResetTimeZone())}:${userId}`
}

function readLimit(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  try {
    const p = zonedParts(date, timeZone)
    const representedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000
  } catch {
    return 0
  }
}

function nextMidnightInZone(timeZone: string) {
  try {
    const now = new Date()
    const p = zonedParts(now, timeZone)
    const nextLocal = new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0))
    let guess = nextLocal.getTime() - timeZoneOffsetMs(nextLocal, timeZone)
    const refined = new Date(guess)
    guess = nextLocal.getTime() - timeZoneOffsetMs(refined, timeZone)
    return new Date(guess)
  } catch {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  }
}

export function normalizeImageCreditSize(value: unknown): ImageCreditSize {
  const normalized = String(value || "").trim().toUpperCase()
  if (normalized === "2K") return "2K"
  if (normalized === "4K") return "4K"
  return "1K"
}

export function getImageCreditCosts() {
  return {
    "1K": readLimit("IMAGE_COST_1K", 1),
    "2K": readLimit("IMAGE_COST_2K", 2),
    "4K": readLimit("IMAGE_COST_4K", 5),
  } satisfies Record<ImageCreditSize, number>
}

export function imageCreditCost(size: ImageCreditSize) {
  return getImageCreditCosts()[size]
}

export function getMediaDailyLimits() {
  return {
    guest: { images: readLimit("GUEST_DAILY_IMAGE_LIMIT", 10), videos: readLimit("GUEST_DAILY_VIDEO_LIMIT", 0) },
    free: { images: readLimit("FREE_DAILY_IMAGE_LIMIT", 50), videos: readLimit("FREE_DAILY_VIDEO_LIMIT", 1) },
    premium: { images: readLimit("PREMIUM_DAILY_IMAGE_LIMIT", 200), videos: readLimit("PREMIUM_DAILY_VIDEO_LIMIT", 5) },
  }
}

function limitFor(tier: UserTier, kind: MediaKind): number {
  const limits = getMediaDailyLimits()
  // Owner is intentionally unlimited at the Malik AI application layer.
  // The upstream provider may still enforce its own independent quota.
  if (tier === "owner") return Number.MAX_SAFE_INTEGER
  if (kind === "video") {
    if (tier === "premium") return limits.premium.videos
    if (tier === "free") return limits.free.videos
    return limits.guest.videos
  }
  if (tier === "premium") return limits.premium.images
  if (tier === "free") return limits.free.images
  return limits.guest.images
}

function imageDailyCredits(tier: UserTier) {
  if (tier === "owner") return Number.MAX_SAFE_INTEGER
  if (tier === "guest") return readLimit("IMAGE_NEW_USER_DAILY_CREDITS", 5)
  return readLimit("IMAGE_DAILY_CREDITS", 15)
}

function memoryMap(kind: MediaKind) {
  return kind === "image" ? memoryImage : memoryVideo
}

export function nextMediaResetAt(_kind: MediaKind = "video"): string {
  return nextMidnightInZone(mediaResetTimeZone()).toISOString()
}

export async function getImageCreditStatus(input: { userId?: string; plan?: AIPlan }) {
  const userId = input.userId?.trim() || "guest"
  const tier = resolveUserTier(userId === "guest" ? undefined : userId, input.plan || "free")
  const daily = imageDailyCredits(tier)
  const used = await getPersistedUsage(userId, "image")
  const max4kPerDay = tier === "owner"
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Math.floor(readLimit("IMAGE_MAX_4K_PER_DAY", 2)))
  const used4k = await getPersistedUsage(userId, "image4k")
  return {
    plan: tier,
    daily,
    used,
    remaining: tier === "owner" ? Number.MAX_SAFE_INTEGER : Math.max(0, daily - used),
    costs: getImageCreditCosts(),
    max4kPerDay,
    used4k,
    remaining4k: tier === "owner" ? Number.MAX_SAFE_INTEGER : Math.max(0, max4kPerDay - used4k),
    resetAt: nextMediaResetAt("image"),
  }
}

export async function checkImageCreditLimit(input: {
  userId?: string
  plan?: AIPlan
  size: ImageCreditSize
}) {
  const status = await getImageCreditStatus(input)
  const cost = imageCreditCost(input.size)

  if (input.size === "4K" && status.remaining4k <= 0) {
    return {
      ok: false as const,
      ...status,
      cost,
      code: "IMAGE_4K_DAILY_LIMIT_REACHED",
      error: "Лимит 4K на сегодня исчерпан.",
    }
  }

  if (status.remaining < cost) {
    return {
      ok: false as const,
      ...status,
      cost,
      code: "IMAGE_CREDITS_EXHAUSTED",
      error: `Недостаточно фото-кредитов. Нужно ${cost}, осталось ${status.remaining}.`,
    }
  }

  return { ok: true as const, ...status, cost }
}

export async function recordImageCreditUsage(userId: string, size: ImageCreditSize) {
  const cost = imageCreditCost(size)
  await incrementPersistedUsage(userId || "guest", "image", cost)
  if (size === "4K") await incrementPersistedUsage(userId || "guest", "image4k", 1)
  return cost
}

export async function getMediaUsage(userId: string, kind: MediaKind): Promise<number> {
  const eventType = kind === "image" ? "image" : "video"
  const persisted = await getPersistedUsage(userId, eventType)
  if (persisted > 0) return persisted
  return memoryMap(kind).get(dayKey(userId, kind)) || 0
}

export async function checkMediaLimit(input: { userId?: string; plan?: AIPlan; kind: MediaKind }) {
  const userId = input.userId?.trim() || "guest"
  const tier = resolveUserTier(userId === "guest" ? undefined : userId, input.plan || "free")
  const max = limitFor(tier, input.kind)
  const used = await getMediaUsage(userId, input.kind)
  const remaining = Math.max(0, max - used)

  if (used >= max) {
    return { ok: false as const, error: "Daily limit reached", code: "DAILY_LIMIT_REACHED", plan: tier, remaining: 0, resetAt: nextMediaResetAt(input.kind) }
  }
  return { ok: true as const, plan: tier, remaining, resetAt: nextMediaResetAt(input.kind) }
}

export async function recordMediaUsage(userId: string, kind: MediaKind, count = 1) {
  const key = dayKey(userId || "guest", kind)
  const map = memoryMap(kind)
  map.set(key, (map.get(key) || 0) + count)
  await incrementPersistedUsage(userId, kind === "image" ? "image" : "video", count)
}
