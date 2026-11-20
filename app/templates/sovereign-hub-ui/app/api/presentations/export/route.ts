import { readFile } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import { normalizeDeck } from "@/lib/presentations/deck"
import { PPTX_MIME } from "@/lib/presentations/download"
import { deckPhotoJobs, pptxFileName } from "@/lib/presentations/pptx"
import { buildServerPptx } from "@/lib/server/pptx-assets"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { renderBandwidthBlocked, renderResponseBudgetBytes, renderResponseFitsBudget } from "@/lib/server/render-bandwidth"
import { fetchPublicPage } from "@/lib/malik-research/public-page-fetch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Images arrive as URLs or data URLs; a whole deck with pictures fits well within this. */
const MAX_BODY_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const IMAGE_TIMEOUT_MS = 8_000

/**
 * The shared public-page reader checks and pins the address on every hop and
 * enforces the byte limit while streaming the response.
 */
function fetchableImageUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  return url.username || url.password ? null : url
}

async function imageBytes(value: string, signal: AbortSignal): Promise<Buffer | null> {
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)) {
    try {
      const buffer = Buffer.from(value.slice(value.indexOf(",") + 1), "base64")
      return buffer.length && buffer.length <= MAX_IMAGE_BYTES ? buffer : null
    } catch {
      return null
    }
  }
  if (/^\/presentations\/showcase\/[a-z-]+\.webp$/u.test(value)) {
    return readFile(join(process.cwd(), "public", value.slice(1)), { signal }).catch(() => null)
  }
  const url = fetchableImageUrl(value)
  if (!url) return null

  try {
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS)])
    const response = await fetchPublicPage(url.href, timeout, MAX_IMAGE_BYTES, { media: "image" })
    if (!response.ok || !response.body) return null
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (!/^image\/(?:png|jpe?g|webp|gif|avif)$/.test(type)) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.length && buffer.length <= MAX_IMAGE_BYTES ? buffer : null
  } catch {
    return null
  }
}

function photoForExport(bytes: Buffer, size: number, quality: number) {
  return sharp(bytes, { limitInputPixels: 32_000_000 }).rotate()
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer()
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
  const bytes = await imageBytes(target, request.signal)
  if (!bytes) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } })
  try {
    let out = await photoForExport(bytes, 1920, 82)
    if (!renderResponseFitsBudget(out.length)) out = await photoForExport(bytes, 1280, 70)
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
    const supplied = (body.deck as { slides: unknown[] }).slides.length
    if (supplied !== deck.slides.length) return Response.json({ ok: false, error: "Некоторые слайды повреждены. Откройте их в редакторе и повторите экспорт." }, { status: 422, headers: { "cache-control": "no-store" } })

    // Resize as each source comes in so the originals cannot accumulate in memory.
    const photos = new Map<string, Buffer>()
    const jobs = deckPhotoJobs(deck)
    const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(18_000)])
    await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, async () => {
      while (jobs.length && !deadline.aborted) {
        const job = jobs.shift()!
        const bytes = await imageBytes(job.url, deadline)
        if (!bytes) continue
        const picture = await photoForExport(bytes, 1440, 80).catch(() => null)
        if (picture) photos.set(job.key, picture)
      }
    }))

    // The richest version that fits the response budget: art and photos
    // first, then lighter copies, never at the cost of any text or shape.
    const { file, tier, missingPhotos } = await buildServerPptx(deck, photos, renderResponseBudgetBytes())
    if (!renderResponseFitsBudget(file.length)) return renderBandwidthBlocked("presentation-pptx", file.length)

    const name = pptxFileName(deck.title)
    return new Response(new Uint8Array(file), {
      headers: {
        "content-type": PPTX_MIME,
        "content-disposition": `attachment; filename="presentation.pptx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "content-length": String(file.length),
        "cache-control": "no-store",
        "x-malik-router": "presentation-export-v2",
        "x-malik-bandwidth-mode": `tier-${tier}`,
        "x-malik-missing-photos": String(missingPhotos),
        "x-content-type-options": "nosniff",
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
