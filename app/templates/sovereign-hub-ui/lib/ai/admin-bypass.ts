import type { AIPlan } from "./types"

import { MALIK_OWNER_EMAIL, isOwnerEmail } from "../auth/admin-policy"

export type AdminUserLike = {
  email?: string | null
  userEmail?: string | null
  username?: string | null
  id?: string | null
  plan?: AIPlan | string | null
  isAdmin?: boolean | null
  isOwner?: boolean | null
}

export function normalizeUserEmail(user?: AdminUserLike | string | null) {
  if (typeof user === "string") return user.trim().toLowerCase()
  return String(user?.email || user?.userEmail || user?.username || "").trim().toLowerCase()
}

export function getAdminEmails() {
  return [MALIK_OWNER_EMAIL]
}

export function isAdminUser(user?: AdminUserLike | string | null) {
  return isOwnerEmail(normalizeUserEmail(user))
}

export function appEnvironment() {
  return String(process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV || process.env.NODE_ENV || "production").toLowerCase()
}

export function isLocalEnvironment() {
  const env = appEnvironment()
  return env === "development" || env === "local" || env === "test"
}

export function isDevBypassEnabled() {
  const enabled = String(process.env.DEV_BYPASS_LIMITS || "").toLowerCase() === "true"
  return enabled && isLocalEnvironment()
}

export function canBypassLimits(user?: AdminUserLike | string | null) {
  return isAdminUser(user) || isDevBypassEnabled()
}

export function getUserPlan(user?: AdminUserLike | string | null): AIPlan {
  if (isAdminUser(user)) return "owner"
  if (isDevBypassEnabled()) return "owner"

  if (typeof user === "object" && user?.plan) {
    const plan = String(user.plan).toLowerCase()
    if (plan === "pro" || plan === "ultra" || plan === "owner") return plan as AIPlan
  }

  return "free"
}

export function getBypassStatus(user?: AdminUserLike | string | null) {
  const admin = isAdminUser(user)
  const devBypass = isDevBypassEnabled()
  const canBypass = admin || devBypass
  const plan = getUserPlan(user)

  return {
    admin,
    devBypass,
    canBypass,
    plan,
    appEnvironment: appEnvironment(),
    label: admin ? "Admin mode active" : devBypass ? "Dev bypass limits enabled" : "Production limits active",
    message: admin
      ? "All limits unlocked for owner."
      : devBypass
        ? "Limits disabled only in development/local mode."
        : "Usage limits are active for this user.",
  }
}

export function shouldShowPaywall(input: {
  user?: AdminUserLike | string | null
  limitReached?: boolean
  plan?: AIPlan
}) {
  if (canBypassLimits(input.user)) return false
  const plan = input.plan || getUserPlan(input.user)
  if (plan === "pro" || plan === "ultra" || plan === "owner") return false
  return Boolean(input.limitReached)
}

