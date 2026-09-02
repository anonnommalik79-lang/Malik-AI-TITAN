import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { isValidMediaAssetId, mediaAssetDirectory } from "@/lib/media/asset-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id?: string }> | { id?: string } }
type AssetInfo = { file: string; mime: string; bytes: number }

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

function safeMime(value: unknown) {
  const mime = String(value || "").split(";")[0].trim().toLowerCase()
  return /^image\/(?:jpeg|jpg|png|webp|gif|avif|svg\+xml)$/.test(mime) || /^video\/(?:mp4|webm)$/.test(mime)
    ? mime
    : "image/jpeg"
}

/**
 * Read only tiny metadata here. The old route called readFileSync for the whole
 * generated master even for HEAD requests, so opening a chat with several 8K
 * images could block the Node event loop on tens of megabytes of disk I/O.
 */
async function assetInfo(id: string): Promise<AssetInfo | null> {
  if (!isValidMediaAssetId(id)) return null
  try {
    const directory = mediaAssetDirectory()
    const file = path.join(directory, `${id}.bin`)
    const metadataFile = path.join(directory, `${id}.json`)
    const fileStat = await stat(file)
    if (!fileStat.isFile() || fileStat.size <= 0) return null

    let mime = "image/jpeg"
    try {
      const metadata = JSON.parse(await readFile(metadataFile, "utf8"))
      mime = safeMime(metadata?.mime)
    } catch {
      // The bytes are authoritative; old assets may predate the metadata file.
    }

    return { file, mime, bytes: fileStat.size }
  } catch {
    return null
  }
}

/**
 * Serves one generated image/video from the durable asset store.
 *
 * The id is minted server-side and the bytes never change, so this can be cached
 * forever. The body is streamed from disk instead of copied into one giant
 * Buffer first, keeping refreshes responsive even when the master is 8K/16K.
 */
export async function GET(_request: Request, context: RouteContext) {
  const id = await resolveId(context)
  const asset = await assetInfo(id)
  if (!asset) return missing()

  const body = Readable.toWeb(createReadStream(asset.file)) as ReadableStream<Uint8Array>
  return new Response(body, {
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
  const asset = await assetInfo(id)
  if (!asset) return new Response(null, { status: 404 })

  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(asset.bytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
