import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"
import { founderMessageStorageCheck, founderMessageStorageMode } from "@/lib/server/founder-message-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  if (!isVerifiedOwner(user)) return Response.json({ ok: false, error: "FOUNDER_ONLY" }, { status: 403, headers: { "Cache-Control": "private, no-store" } })
  const result = await founderMessageStorageCheck()
  return Response.json({ ok: true, storage: founderMessageStorageMode(), ...result }, { headers: { "Cache-Control": "private, no-store" } })
}
