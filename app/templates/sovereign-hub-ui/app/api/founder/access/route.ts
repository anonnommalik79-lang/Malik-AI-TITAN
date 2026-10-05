import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  if (!isVerifiedOwner(user)) return Response.json({ ok: false }, {
    status: 403, headers: { "Cache-Control": "private, no-store" },
  })
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } })
}
