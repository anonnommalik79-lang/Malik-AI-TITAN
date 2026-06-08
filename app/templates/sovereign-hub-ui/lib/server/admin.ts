import { timingSafeEqual } from "node:crypto"

const DEFAULT_ADMINS = [
  "amangeldymalik38@gmail.com",
  "anonnommalik79@gmail.com",
]

function list(value?: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function safeEqual(left?: string | null, right?: string | null) {
  if (!left || !right) return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function malikAdminEmails() {
  return list(process.env.MALIK_ADMIN_USERS).length
    ? list(process.env.MALIK_ADMIN_USERS)
    : DEFAULT_ADMINS
}

export function isMalikAdminEmail(email?: string | null) {
  return Boolean(email && malikAdminEmails().includes(email.trim().toLowerCase()))
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

export function requireMalikAdmin(request: Request) {
  const access = getAdminAccess(request)
  if (!access.authorized) {
    return { access, response: Response.json({ ok: false, error: "admin_access_required" }, { status: 403 }) }
  }
  return { access, response: null }
}
