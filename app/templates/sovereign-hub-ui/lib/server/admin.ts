import { timingSafeEqual } from "node:crypto"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { MALIK_OWNER_EMAIL, isOwnerEmail, isVerifiedOwner } from "@/lib/auth/admin-policy"

function safeEqual(left?: string | null, right?: string | null) {
  if (!left || !right) return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function malikAdminEmails() {
  return [MALIK_OWNER_EMAIL]
}

export function isMalikAdminEmail(email?: string | null) {
  return isOwnerEmail(email)
}

export function getAdminAccess(request: Request) {
  const email = request.headers.get("x-malik-admin-email")?.trim().toLowerCase() || ""
  const token = request.headers.get("x-malik-admin-token")
  const tokenReady = Boolean(process.env.MALIK_ADMIN_TOKEN?.trim())
  const authorized = isMalikAdminEmail(email) && tokenReady && safeEqual(token, process.env.MALIK_ADMIN_TOKEN)
  return {
    email,
    authorized,
    debugAllowed: authorized && process.env.MALIK_DEBUG_PROVIDERS === "true",
  }
}

export async function getAdminAccessAsync(request: Request) {
  const headerAccess = getAdminAccess(request)
  if (headerAccess.authorized) return { ...headerAccess, source: "admin-token" as const }

  try {
    const { user } = await getOptionalWorkOSAuth()
    const email = user?.email?.trim().toLowerCase() || ""
    const authorized = isVerifiedOwner(user)
    return {
      email,
      authorized,
      debugAllowed: authorized && process.env.MALIK_DEBUG_PROVIDERS === "true",
      source: "workos-session" as const,
      user: user || null,
    }
  } catch {
    return { ...headerAccess, source: "none" as const }
  }
}

export function requireMalikAdmin(request: Request) {
  const access = getAdminAccess(request)
  if (!access.authorized) {
    return { access, response: Response.json({ ok: false, error: "admin_access_required" }, { status: 403 }) }
  }
  return { access, response: null }
}

export async function requireMalikAdminAsync(request: Request) {
  const access = await getAdminAccessAsync(request)
  if (!access.authorized) {
    return { access, response: Response.json({ ok: false, error: "admin_access_required" }, { status: 403 }) }
  }
  return { access, response: null }
}
