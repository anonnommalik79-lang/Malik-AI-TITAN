import "server-only"

import { isOwnerEmail } from "@/lib/auth/admin-policy"

/** Private conversation content needs stronger proof than the public console.
 * The optional WorkOS ID is a server-pinned identity, never a request header.
 */
export function canReadFounderHistory(user?: { id?: string; email?: string | null; emailVerified?: boolean } | null) {
  if (!user || !isOwnerEmail(user.email)) return false
  const pinnedId = process.env.MALIK_OWNER_WORKOS_USER_ID?.trim()
  return user.emailVerified === true || Boolean(pinnedId && user.id === pinnedId)
}
