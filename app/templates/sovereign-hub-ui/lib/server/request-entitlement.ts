import { createHmac } from "node:crypto"
import type { AIPlan } from "@/lib/ai/types"
import { entitledPlan } from "@/lib/server/billing-store"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"

export type RequestEntitlement = {
  authenticated: boolean
  userId: string
  plan: AIPlan
}

function anonymousGuestId(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const networkHint = request.headers.get("cf-connecting-ip")?.trim()
    || forwarded
    || request.headers.get("x-real-ip")?.trim()
    || "unknown-network"
  const clientHint = [
    networkHint,
    request.headers.get("user-agent") || "unknown-agent",
    request.headers.get("accept-language") || "",
  ].join("|")
  const secret = process.env.MALIK_GUEST_ID_SALT
    || process.env.WORKOS_COOKIE_PASSWORD
    || "malik-guest-rate-limit-v1"
  const digest = createHmac("sha256", secret).update(clientHint).digest("hex").slice(0, 24)
  return `guest:${digest}`
}

export async function resolveRequestEntitlement(request: Request): Promise<RequestEntitlement> {
  const { user } = await getOptionalWorkOSAuth()
  if (!user?.email) {
    return { authenticated: false, userId: anonymousGuestId(request), plan: "free" }
  }
  // Unverified email addresses must not inherit email-based owner/paid grants.
  if (!user.emailVerified) {
    return { authenticated: true, userId: `workos:${user.id}`, plan: "free" }
  }
  const email = user.email.trim().toLowerCase()
  return { authenticated: true, userId: email, plan: isVerifiedOwner(user) ? "owner" : await entitledPlan(email) }
}
