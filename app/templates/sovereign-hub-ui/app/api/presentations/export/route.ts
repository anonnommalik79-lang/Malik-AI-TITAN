import { isIP } from "node:net"
import sharp from "sharp"
import { normalizeDeck } from "@/lib/presentations/deck"
import { deckPhotoJobs, pptxFileName } from "@/lib/presentations/pptx"
import { buildServerPptx } from "@/lib/server/pptx-assets"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { renderBandwidthBlocked, renderResponseBudgetBytes, renderResponseFitsBudget } from "@/lib/server/render-bandwidth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Images arrive as URLs or data URLs; a whole deck with pictures fits well within this. */
const MAX_BODY_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const IMAGE_TIMEOUT_MS = 8_000

/**
 * Only public https images are fetched, from hosts that are names rather than
 * addresses, and never from this machine. The URL came from a browser, so
 * without these rules the export would be a way to make the server fetch
 * whatever the browser asked it to.
 */
function fetchableImageUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  const host = url.hostname.toLowerCase()
  if (!host || isIP(host) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null
  return url
}

/** The original bytes of a picture: an inline data URL or a public https image. */
async function imageBytes(value: string): Promise<Buffer | null> {
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)) {
    try {
      const buffer = Buffer.from(value.slice(value.indexOf(",") + 1), "base64")
      return buffer.length && buffer.length <= MAX_IMAGE_BYTES ? buffer : null
    } catch {
      return null
    }
  }
  const url = fetchableImageUrl(value)
  if (!url) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow", cache: "no-store" })
    if (!response.ok) return null
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (!/^image\/(?:png|jpe?g|webp|gif|avif)$/.test(type)) return null
    const declared = Number(response.headers.get("content-length") || 0)
    if (declared > MAX_IMAGE_BYTES) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.length && buffer.length <= MAX_IMAGE_BYTES ? buffer : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * One slide photo, re-encoded, for the browser's own PowerPoint builder when
 * the photo's host does not allow it to be read across origins. Signed-in
 * users only, the same public-https rules as the export, one picture per
 * response so it stays inside the response budget.
 */
export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return new Response(null, { status: 401, headers: { "cache-control": "no-store" } })
  const target = new URL(request.url).searchParams.get("image") || ""
  if (!fetchableImageUrl(target)) return new Response(null, { status: 400, headers: { "cache-control": "no-store" } })
  const bytes = await imageBytes(target)
  if (!bytes) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } })
  try {
    let out = await sharp(bytes).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    if (!renderResponseFitsBudget(out.length)) out = await sharp(bytes).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70, mozjpeg: true }).toBuffer()
    if (!renderResponseFitsBudget(out.length)) return renderBandwidthBlocked("presentation-photo", out.length)
    return new Response(new Uint8Array(out), {
      headers: { "content-type": "image/jpeg", "content-length": String(out.length), "cache-control": "private, max-age=600", "x-malik-router": "presentation-photo-v1" },
    })
  } catch {
    return new Response(null, { status: 415, headers: { "cache-control": "no-store" } })
  }
}

/**
 * Turns the deck on screen into a .pptx file.
 *
 * Free, because it is arithmetic on a deck that was already paid for. Signed-in
 * users only, because it does fetch pictures on the user's behalf. A picture
 * that cannot be fetched is replaced by an empty panel rather than failing the
 * whole export — the person gets their deck either way.
 */
export async function POST(request: Request) {
  try {
    const entitlement = await resolveRequestEntitlement(request)
    if (!entitlement.authenticated) {
      return Response.json({ ok: false, error: "Войдите в аккаунт, чтобы скачать презентацию." }, { status: 401, headers: { "cache-control": "no-store" } })
    }

    const body = await readJsonBodyLimited<Record<string, unknown>>(request, MAX_BODY_BYTES)
    const deck = normalizeDeck(body.deck)
    if (!deck) return Response.json({ ok: false, error: "Презентация пуста или повреждена." }, { status: 400, headers: { "cache-control": "no-store" } })

    // Every picture on the deck, by the slot it fills. Four at a time —
    // enough to be quick, few enough not to open a dozen connections.
    const photos = new Map<string, Buffer>()
    const jobs = deckPhotoJobs(deck).slice(0, 40)
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (jobs.length) {
        const job = jobs.shift()!
        const bytes = await imageBytes(job.url)
        if (bytes) photos.set(job.key, bytes)
      }
    }))

    // The richest version that fits the response budget: art and photos
    // first, then lighter copies, never at the cost of any text or shape.
    const { file, tier } = await buildServerPptx(deck, photos, renderResponseBudgetBytes())
    if (!renderResponseFitsBudget(file.length)) return renderBandwidthBlocked("presentation-pptx", file.length)

    const name = pptxFileName(deck.title)
    return new Response(new Uint8Array(file), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "content-disposition": `attachment; filename="presentation.pptx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "content-length": String(file.length),
        "cache-control": "no-store",
        "x-malik-router": "presentation-export-v2",
        "x-malik-bandwidth-mode": `tier-${tier}`,
      },
    })
  } catch (error) {
    if (error instanceof RequestSafetyError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } })
    }
    console.warn("[MALIK_PRESENTATION_EXPORT]", error instanceof Error ? error.message : String(error))
    return Response.json({ ok: false, error: "Не удалось собрать файл PowerPoint." }, { status: 500, headers: { "cache-control": "no-store" } })
  }
}
