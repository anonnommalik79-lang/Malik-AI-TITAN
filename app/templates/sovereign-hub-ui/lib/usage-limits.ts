export type GenerationLimitType = "image" | "video" | "code" | "website"

export type UsageState = {
  imageCount: number
  videoCount: number
  codeCount: number
  lastReset: string
}

const IMAGE_KEY = "MALIK_USAGE_IMAGE_COUNT"
const VIDEO_KEY = "MALIK_USAGE_VIDEO_COUNT"
const CODE_KEY = "MALIK_USAGE_CODE_COUNT"
const RESET_KEY = "MALIK_USAGE_LAST_RESET"

const OWNER_EMAILS = new Set([
  "amangeldymalik38@gmail.com",
  "anonnommalik79@gmail.com",
  "admin@malik.ai",
])

const canUseStorage = () => typeof window !== "undefined" && Boolean(window.localStorage)

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function readNumber(key: string) {
  if (!canUseStorage()) return 0
  const raw = window.localStorage.getItem(key)
  const value = Number(raw || "0")
  return Number.isFinite(value) ? value : 0
}

function writeNumber(key: string, value: number) {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, String(Math.max(0, value)))
}

function resetIfNeeded() {
  if (!canUseStorage()) return
  const today = todayKey()
  const lastReset = window.localStorage.getItem(RESET_KEY)
  if (lastReset === today) return
  window.localStorage.setItem(IMAGE_KEY, "0")
  window.localStorage.setItem(VIDEO_KEY, "0")
  window.localStorage.setItem(CODE_KEY, "0")
  window.localStorage.setItem(RESET_KEY, today)
}

function keyForType(type: GenerationLimitType) {
  if (type === "image") return IMAGE_KEY
  if (type === "video") return VIDEO_KEY
  return CODE_KEY
}

export function isOwnerUser(email?: string | null) {
  return OWNER_EMAILS.has(String(email || "").trim().toLowerCase())
}

export function getUsageState(): UsageState {
  resetIfNeeded()
  return {
    imageCount: readNumber(IMAGE_KEY),
    videoCount: readNumber(VIDEO_KEY),
    codeCount: readNumber(CODE_KEY),
    lastReset: canUseStorage() ? window.localStorage.getItem(RESET_KEY) || todayKey() : todayKey(),
  }
}

export function canUseGeneration(type: GenerationLimitType, userEmail?: string | null) {
  if (isOwnerUser(userEmail)) return true
  const state = getUsageState()
  if (type === "image") return state.imageCount < 1
  if (type === "video") return false
  return state.codeCount < 1
}

export function incrementUsage(type: GenerationLimitType) {
  resetIfNeeded()
  const key = keyForType(type)
  writeNumber(key, readNumber(key) + 1)
  return getUsageState()
}

export function resetUsage() {
  if (!canUseStorage()) return getUsageState()
  window.localStorage.setItem(IMAGE_KEY, "0")
  window.localStorage.setItem(VIDEO_KEY, "0")
  window.localStorage.setItem(CODE_KEY, "0")
  window.localStorage.setItem(RESET_KEY, todayKey())
  return getUsageState()
}

