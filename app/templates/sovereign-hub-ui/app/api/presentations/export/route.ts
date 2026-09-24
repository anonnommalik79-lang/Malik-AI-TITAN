import { isIP } from "node:net"
import { normalizeDeck } from "@/lib/presentations/deck"
import { IMAGE_LAYOUTS } from "@/lib/presentations/types"
import { buildPptx, pptxFileName } from "@/lib/presentations/pptx"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

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

async function imageAsDataUrl(value: string): Promise<string | null> {
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)) {
    return value.length <= MAX_IMAGE_BYTES * 1.4 ? value : null
  }
  const url = fetchableImageUrl(value)
  if (!url) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow", cache: "no-store" })
    if (!response.ok) return null
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (!/^image\/(?:png|jpe?g|webp|gif)$/.test(type)) return null
    const declared = Number(response.headers.get("content-length") || 0)
    if (declared > MAX_IMAGE_BYTES) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_IMAGE_BYTES) return null
    return `data:${type};base64,${buffer.toString("base64")}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
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

    // Every picture on the deck: one per photo slide, one per gallery photo
    // (keyed "slideId#index"). Four at a time — enough to be quick, few
    // enough not to open a dozen connections for one download.
    const images = new Map<string, string>()
    const jobs: Array<[string, string]> = deck.slides.flatMap((slide): Array<[string, string]> => {
      if (slide.layout === "gallery") {
        return slide.items.flatMap((item, index): Array<[string, string]> => (item.image?.url ? [[`${slide.id}#${index}`, item.image.url]] : []))
      }
      return IMAGE_LAYOUTS.has(slide.layout) && slide.imageUrl ? [[slide.id, slide.imageUrl]] : []
    }).slice(0, 40)
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (jobs.length) {
        const [key, url] = jobs.shift() as [string, string]
        const data = await imageAsDataUrl(url)
        if (data) images.set(key, data)
      }
    }))

    const file = await buildPptx(deck, images)
    const name = pptxFileName(deck.title)
    return new Response(new Uint8Array(file), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "content-disposition": `attachment; filename="presentation.pptx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "content-length": String(file.length),
        "cache-control": "no-store",
        "x-malik-router": "presentation-export-v1",
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
