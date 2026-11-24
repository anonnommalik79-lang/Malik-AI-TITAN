import { createHmac } from "node:crypto"
import { isIP } from "node:net"
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
  // Only trust the header supplied/overwritten by the deployment's trusted edge.
  // If no trusted header is configured, share a conservative anonymous bucket.
  const trustedHeader = (process.env.MALIK_TRUST_PROXY_IP_HEADER || "").trim().toLowerCase()
  const raw = ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"].includes(trustedHeader)
    ? request.headers.get(trustedHeader) || "" : ""
  const candidate = raw.split(",").at(-1)?.trim() || ""
  const networkHint = isIP(candidate) ? candidate : "unknown-network"
  const clientHint = networkHint
  const secret = process.env.MALIK_GUEST_ID_SALT
    || process.env.WORKOS_COOKIE_PASSWORD
    || "malik-guest-rate-limit-v1"
  const digest = createHmac("sha256", secret).update(clientHint).digest("hex").slice(0, 24)
  return `guest:${digest}`
}

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getOptionalWorkOSAuth>>["user"]>

async function signedInEntitlement(user: SignedInUser & { email: string }): Promise<RequestEntitlement> {
  // Unverified email addresses must not inherit email-based owner/paid grants.
  if (!user.emailVerified) {
    return { authenticated: true, userId: `workos:${user.id}`, plan: "free" }
  }
  const email = user.email.trim().toLowerCase()
  return { authenticated: true, userId: email, plan: isVerifiedOwner(user) ? "owner" : await entitledPlan(email) }
}

export async function resolveRequestEntitlement(request: Request): Promise<RequestEntitlement> {
  const { user } = await getOptionalWorkOSAuth()
  if (!user?.email) {
    return { authenticated: false, userId: anonymousGuestId(request), plan: "free" }
  }
  return signedInEntitlement(user as SignedInUser & { email: string })
}

/** The signed-in viewer of a server-rendered page, or null for a visitor. */
export async function resolveViewerEntitlement(): Promise<RequestEntitlement | null> {
  const { user } = await getOptionalWorkOSAuth()
  if (!user?.email) return null
  return signedInEntitlement(user as SignedInUser & { email: string })
}
