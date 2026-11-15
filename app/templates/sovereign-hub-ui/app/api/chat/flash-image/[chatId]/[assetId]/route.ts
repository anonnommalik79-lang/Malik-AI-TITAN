import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { isFlashChatId } from "@/lib/server/malik-flash-browser-bridge"
import { canReadFlashAsset } from "@/lib/server/malik-flash-history"
import { isFlashAssetId, readFlashAsset } from "@/lib/server/malik-flash-assets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const cache = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }

export async function GET(request: Request, context: { params: Promise<{ chatId: string; assetId: string }> }) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return new Response(null, { status: 401, headers: cache })
  const { chatId, assetId } = await context.params
  if (!isFlashChatId(chatId) || !isFlashAssetId(assetId)) return new Response(null, { status: 404, headers: cache })
  try {
    if (!await canReadFlashAsset(entitlement.userId, chatId, assetId)) return new Response(null, { status: 404, headers: cache })
    const asset = await readFlashAsset(entitlement.userId, chatId, assetId)
    if (!asset) return new Response(null, { status: 404, headers: cache })
    const body = Uint8Array.from(Buffer.from(asset.payload, "base64"))
    return new Response(body, { headers: { ...cache, "Content-Type": asset.mime, "Content-Length": String(body.length), "Content-Disposition": "inline" } })
  } catch {
    return new Response(null, { status: 503, headers: cache })
  }
}
