import { isValidMediaAssetId, readMediaAsset } from "@/lib/media/asset-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id?: string }> | { id?: string } }

async function resolveId(context: RouteContext) {
  const params = await Promise.resolve(context?.params)
  return String(params?.id || "")
}

function missing() {
  return Response.json(
    { ok: false, error: "MEDIA_ASSET_NOT_FOUND", publicError: "Файл результата больше недоступен. Повторите генерацию." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  )
}

/**
 * Serves one generated image/video from the durable asset store.
 *
 * The id is minted server-side and the bytes never change, so this can be cached
 * forever — that is what makes a reloaded chat show the real result instantly
 * instead of restarting the generation animation.
 */
export async function GET(_request: Request, context: RouteContext) {
  const id = await resolveId(context)
  if (!isValidMediaAssetId(id)) return missing()

  const asset = readMediaAsset(id)
  if (!asset) return missing()

  return new Response(new Uint8Array(asset.buffer), {
    status: 200,
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(asset.bytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  })
}

export async function HEAD(_request: Request, context: RouteContext) {
  const id = await resolveId(context)
  if (!isValidMediaAssetId(id)) return new Response(null, { status: 404 })

  const asset = readMediaAsset(id)
  if (!asset) return new Response(null, { status: 404 })

  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(asset.bytes),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
