import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { verifyFounderHistoryViewer, founderHistoryAccessDenied } from "@/lib/server/founder-viewer-verification"
import { founderMessageStorageCheck, founderMessageStorageMode } from "@/lib/server/founder-message-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { user } = await getOptionalWorkOSAuth()
  if (!await verifyFounderHistoryViewer(user)) return founderHistoryAccessDenied(user, request)
  const result = await founderMessageStorageCheck()
  return Response.json({ ok: true, storage: founderMessageStorageMode(), ...result }, { headers: { "Cache-Control": "private, no-store" } })
}
