import { withAuth } from "@workos-inc/authkit-nextjs"

export function isWorkOSConfigured() {
  return Boolean(
    process.env.WORKOS_CLIENT_ID?.trim() &&
    process.env.WORKOS_API_KEY?.trim() &&
    (process.env.WORKOS_COOKIE_PASSWORD?.trim().length || 0) >= 32,
  )
}

export async function getOptionalWorkOSAuth() {
  if (!isWorkOSConfigured()) return { user: null, sessionId: undefined }
  return withAuth()
}
