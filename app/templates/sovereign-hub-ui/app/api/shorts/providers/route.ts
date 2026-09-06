import { NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getShortsProviderAccounts } from "@/lib/shorts/provider-accounts"

export const dynamic = "force-dynamic"

/**
 * Which platforms this Malik account has linked.
 *
 * One request answers for every provider, so the connection panel does not have
 * to fan out to /api/tiktok/status and a future /api/youtube/status and then
 * reconcile two different response shapes. /api/tiktok/status stays exactly as
 * it is - this route is additive, and nothing that reads it today changes.
 */
export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  const accounts = await getShortsProviderAccounts(user?.id)
  return NextResponse.json(accounts, { headers: { "Cache-Control": "private, no-store, max-age=0" } })
}
