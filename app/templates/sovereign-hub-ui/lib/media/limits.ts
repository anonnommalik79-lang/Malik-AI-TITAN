import { resolveUserTier, type UserTier } from "@/lib/limits/user-plan"
import { getPersistedUsage, incrementPersistedUsage } from "@/lib/server/usage-persistence"
import type { AIPlan } from "@/lib/ai/types"

type MediaKind = "image" | "video"

const memoryImage = new Map<string, number>()
const memoryVideo = new Map<string, number>()

function dayKey(userId: string) {
  return `${new Date().toISOString().slice(0, 10)}:${userId}`
}

function readLimit(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function getMediaDailyLimits() {
  return {
    guest: { images: readLimit("GUEST_DAILY_IMAGE_LIMIT", 10), videos: readLimit("GUEST_DAILY_VIDEO_LIMIT", 0) },
    free: { images: readLimit("FREE_DAILY_IMAGE_LIMIT", 50), videos: readLimit("FREE_DAILY_VIDEO_LIMIT", 5) },
    premium: { images: readLimit("PREMIUM_DAILY_IMAGE_LIMIT", 200), videos: readLimit("PREMIUM_DAILY_VIDEO_LIMIT", 20) },
  }
}

function limitFor(tier: UserTier, kind: MediaKind): number {
  const limits = getMediaDailyLimits()
  if (tier === "owner") return 999_999
  if (tier === "premium") return kind === "image" ? limits.premium.images : limits.premium.videos
  if (tier === "free") return kind === "image" ? limits.free.images : limits.free.videos
  return kind === "image" ? limits.guest.images : limits.guest.videos
}

function memoryMap(kind: MediaKind) {
  return kind === "image" ? memoryImage : memoryVideo
}

export function nextMediaResetAt(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

export async function getMediaUsage(userId: string, kind: MediaKind): Promise<number> {
  const eventType = kind === "image" ? "image" : "video"
  const persisted = await getPersistedUsage(userId, eventType)
  if (persisted > 0) return persisted
  return memoryMap(kind).get(dayKey(userId)) || 0
}

export async function checkMediaLimit(input: { userId?: string; plan?: AIPlan; kind: MediaKind }) {
  const userId = input.userId?.trim() || "guest"
  const tier = resolveUserTier(userId === "guest" ? undefined : userId, input.plan || "free")
  const max = limitFor(tier, input.kind)
  const used = await getMediaUsage(userId, input.kind)
  const remaining = Math.max(0, max - used)

  if (used >= max) {
    return { ok: false as const, error: "Daily limit reached", code: "DAILY_LIMIT_REACHED", plan: tier, remaining: 0, resetAt: nextMediaResetAt() }
  }
  return { ok: true as const, plan: tier, remaining, resetAt: nextMediaResetAt() }
}

export async function recordMediaUsage(userId: string, kind: MediaKind, count = 1) {
  const key = dayKey(userId || "guest")
  const map = memoryMap(kind)
  map.set(key, (map.get(key) || 0) + count)
  await incrementPersistedUsage(userId, kind === "image" ? "image" : "video", count)
}
