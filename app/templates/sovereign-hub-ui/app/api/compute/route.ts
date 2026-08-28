import { cookies } from "next/headers"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getDemoComputePageData } from "@/lib/malik-compute/adapter"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" }

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  const guestMode = (await cookies()).get("malik-guest")?.value === "1"
  if (!user && !guestMode) return Response.json({ error: "Authentication required." }, { status: 401, headers })

  // Never accept an email, admin flag or role from query/body/client storage.
  return Response.json(getDemoComputePageData(isVerifiedOwner(user)), { headers })
}
