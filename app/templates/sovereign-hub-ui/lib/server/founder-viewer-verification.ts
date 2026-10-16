import "server-only"

import { isOwnerEmail } from "@/lib/auth/admin-policy"
import { canReadFounderHistory } from "./founder-history-access"
import { fetchWithTimeout } from "@/lib/server/request-safety"

type Viewer = { id?: string; email?: string | null; emailVerified?: boolean } | null | undefined

/** A stale session flag is not proof that WorkOS still considers email unverified.
 * Recheck the signed-in immutable ID with the provider, never an ID from a URL.
 * A failed lookup, different ID/email or an unverified record fails closed.
 */
export async function verifyFounderHistoryViewer(user: Viewer) {
  if (canReadFounderHistory(user)) return true
  if (!user?.id || !isOwnerEmail(user.email)) return false
  const apiKey = process.env.WORKOS_API_KEY?.trim()
  if (!apiKey) return false
  try {
    const response = await fetchWithTimeout(`https://api.workos.com/user_management/users/${encodeURIComponent(user.id)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store",
    }, 4_000)
    if (!response.ok) return false
    const record = await response.json()
    return record?.id === user.id && isOwnerEmail(record.email) && record.email_verified === true
  } catch { return false }
}

export function founderHistoryAccessDenied(user: Viewer, request?: Request) {
  const loginUrl = "/sign-in?returnTo=%2Ffounder%2Fhistory"
  if (request?.headers.get("accept")?.includes("text/html")) {
    return new Response(null, { status: 303, headers: { Location: user ? "/founder/history" : loginUrl, "Cache-Control": "private, no-store" } })
  }
  return Response.json({
    ok: false, error: "FOUNDER_VERIFIED_ACCOUNT_REQUIRED",
    reason: !user ? "SIGN_IN_REQUIRED" : !isOwnerEmail(user.email) ? "OWNER_ACCOUNT_REQUIRED" : "EMAIL_VERIFICATION_REQUIRED",
    message: !user ? "Войдите в аккаунт владельца в этом браузере." : "Нужен подтверждённый аккаунт владельца. Повторите вход или подтвердите email в WorkOS.",
    loginUrl,
  }, { status: 403, headers: { "Cache-Control": "private, no-store" } })
}
