import { deckTheme, type DeckTheme } from "@/lib/presentations/themes"
import { CANVAS_H, CANVAS_W, backdropDataUrl, bakeBox, type Box, type PhotoSlot } from "@/lib/presentations/design"
import type { Deck, DeckIconName } from "@/lib/presentations/types"
import type { PlacedImage, TextMeasure } from "@/lib/presentations/pptx"

/**
 * The PowerPoint file, built in the browser at full quality.
 *
 * The server can only send back a file of under a megabyte, which used to
 * mean photos shrunk to 480 px and compressed until they smeared. Here there
 * is no such limit, and the browser has what a faithful export needs:
 *
 *  - a canvas, to rasterise the theme's background art (the same SVG the
 *    slide shows) and the feature icons — PNG and JPEG open everywhere,
 *    unlike SVG pictures;
 *  - the photos themselves, cut to their slot with the rounded, arched or
 *    diagonal edge, the shadow or frame, and the slide's own art behind the
 *    corners — so the picture in PowerPoint is the picture on screen;
 *  - real font metrics, so every text box gets a font size that fits it.
 *
 * Nothing is uploaded: the deck becomes a file on this machine.
 */

const ART_SCALE = 1.5
const PHOTO_SCALE = 1.5
const PHOTO_MAX_SIDE = 2400

type Drawable = CanvasImageSource & { width: number; height: number }

function canvas(width: number, height: number) {
  const element = document.createElement("canvas")
  element.width = Math.max(1, Math.round(width))
  element.height = Math.max(1, Math.round(height))
  const context = element.getContext("2d")
  if (!context) throw new Error("Canvas is not available")
  context.imageSmoothingQuality = "high"
  return { element, context }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("image failed to load"))
    image.src = src
  })
}

async function bitmapFrom(response: Response): Promise<Drawable | null> {
  if (!response.ok) return null
  const blob = await response.blob()
  if (!blob.type.startsWith("image/") && blob.type !== "application/octet-stream") return null
  try {
    return await createImageBitmap(blob)
  } catch {
    const url = URL.createObjectURL(blob)
    try {
      return await loadImage(url)
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }
  }
}

/**
 * A photo as pixels a canvas may read. Same-origin and inline pictures load
 * directly; a picture from another site is fetched with CORS (bypassing the
 * cache, which may hold a copy without the CORS header), and if its host does
 * not allow that, through the export route's one-picture proxy.
 */
async function readablePhoto(url: string): Promise<Drawable | null> {
  try {
    const absolute = new URL(url, window.location.href)
    if (absolute.protocol === "data:" || absolute.origin === window.location.origin) return await loadImage(absolute.href)
    try {
      const direct = await bitmapFrom(await fetch(absolute.href, { mode: "cors", cache: "no-store", credentials: "omit" }))
      if (direct) return direct
    } catch {
      /* The host does not allow cross-origin reads; try the proxy. */
    }
    return await bitmapFrom(await fetch(`/api/presentations/export?image=${encodeURIComponent(absolute.href)}`, { cache: "no-store" }))
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ paths */

function roundedPath(ctx: CanvasRenderingContext2D, box: Box, radii: [number, number, number, number]) {
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, box.w / 2, box.h / 2)))
  const { x, y, w, h } = box
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.arcTo(x + w, y, x + w, y + tr, tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
  ctx.lineTo(x + bl, y + h)
  ctx.arcTo(x, y + h, x, y + h - bl, bl)
  ctx.lineTo(x, y + tl)
  ctx.arcTo(x, y, x + tl, y, tl)
  ctx.closePath()
}

/** The outline a photo is cut to, optionally grown by `grow` px on every side. */
function maskPath(ctx: CanvasRenderingContext2D, slot: PhotoSlot, grow = 0) {
  const box = { x: slot.box.x - grow, y: slot.box.y - grow, w: slot.box.w + grow * 2, h: slot.box.h + grow * 2 }
  const mask = slot.mask
  if (mask.kind === "round") return roundedPath(ctx, box, [mask.r + grow, mask.r + grow, mask.r + grow, mask.r + grow])
  if (mask.kind === "arch") return roundedPath(ctx, box, [mask.r + grow, mask.r + grow, mask.foot + grow, mask.foot + grow])
  if (mask.kind === "diagonal") {
    ctx.beginPath()
    ctx.moveTo(box.x + box.w * mask.cut, box.y)
    ctx.lineTo(box.x + box.w, box.y)
    ctx.lineTo(box.x + box.w, box.y + box.h)
    ctx.lineTo(box.x, box.y + box.h)
    ctx.closePath()
    return
  }
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.w, box.h)
}

/** object-fit: cover, centred — the way the slide shows the photo. */
function drawCover(ctx: CanvasRenderingContext2D, image: Drawable, box: Box) {
  const scale = Math.max(box.w / image.width, box.h / image.height)
  const sw = box.w / scale
  const sh = box.h / scale
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, box.x, box.y, box.w, box.h)
}

/** The darkening under the words of a full-bleed photo, as on screen. */
function drawHeroShade(ctx: CanvasRenderingContext2D, box: Box) {
  const across = ctx.createLinearGradient(box.x, 0, box.x + box.w, 0)
  across.addColorStop(0, "rgba(0,0,0,.8)")
  across.addColorStop(0.42, "rgba(0,0,0,.5)")
  across.addColorStop(0.74, "rgba(0,0,0,.1)")
  across.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = across
  ctx.fillRect(box.x, box.y, box.w, box.h)
  const up = ctx.createLinearGradient(0, box.y + box.h, 0, box.y)
  up.addColorStop(0, "rgba(0,0,0,.55)")
  up.addColorStop(0.48, "rgba(0,0,0,0)")
  ctx.fillStyle = up
  ctx.fillRect(box.x, box.y, box.w, box.h)
}

/**
 * One photo baked into the image PowerPoint will show: the slide's art
 * behind it, the shadow or frame, the photo cut to its shape.
 */
function bakePhoto(image: Drawable, slot: PhotoSlot, art: Drawable, theme: DeckTheme): PlacedImage {
  const area = bakeBox(slot)
  const scale = Math.min(PHOTO_SCALE, PHOTO_MAX_SIDE / Math.max(area.w, area.h))
  const { element, context: ctx } = canvas(area.w * scale, area.h * scale)
  ctx.scale(scale, scale)
  ctx.translate(-area.x, -area.y)
  ctx.drawImage(art, 0, 0, CANVAS_W, CANVAS_H)

  const { frame } = slot
  if (frame.shadow === "soft") {
    ctx.save()
    ctx.shadowColor = `rgba(0,0,0,${theme.dark ? 0.45 : 0.2})`
    ctx.shadowBlur = 70 * scale
    ctx.shadowOffsetY = 30 * scale
    ctx.fillStyle = `#${theme.surface}`
    maskPath(ctx, slot)
    ctx.fill()
    ctx.restore()
  }
  if (frame.shadow === "hard") {
    ctx.save()
    ctx.translate(10, 10)
    ctx.fillStyle = `#${theme.text}`
    maskPath(ctx, slot)
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  maskPath(ctx, slot)
  ctx.clip()
  drawCover(ctx, image, slot.box)
  if (slot.shade === "hero") drawHeroShade(ctx, slot.box)
  ctx.restore()

  if (frame.stroke) {
    ctx.save()
    ctx.strokeStyle = `#${frame.stroke.color}`
    ctx.lineWidth = frame.stroke.width
    maskPath(ctx, slot, frame.stroke.offset ? frame.stroke.offset + frame.stroke.width / 2 : -frame.stroke.width / 2)
    ctx.stroke()
    ctx.restore()
  }
  return { data: element.toDataURL("image/jpeg", 0.9), box: area, baked: true }
}

/* ------------------------------------------------------------------ text */

/** Text width at 1 pt, measured with the font PowerPoint will use. */
function canvasMeasure(): TextMeasure {
  const { context } = canvas(8, 8)
  const cache = new Map<string, number>()
  return (text, font, bold) => {
    const key = `${font}|${bold ? 1 : 0}|${text}`
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    context.font = `${bold ? 700 : 400} 100px "${font}", Arial, sans-serif`
    const width = context.measureText(text).width / 100
    cache.set(key, width)
    return width
  }
}

/* ---------------------------------------------------------------- export */

export type ExportProgress = (step: "art" | "photos" | "file", done: number, total: number) => void

export async function exportDeckPptx(deck: Deck, onProgress?: ExportProgress): Promise<Blob> {
  const pptx = await import("@/lib/presentations/pptx")
  const theme = deckTheme(deck.theme)

  // The background art of every slide, rasterised once and kept as pixels
  // for the photos that are baked on top of it.
  const artImages = new Map<string, Drawable>()
  const backdrops = new Map<string, string>()
  for (const [index, slide] of deck.slides.entries()) {
    const art = await loadImage(backdropDataUrl(theme, slide.layout, index))
    const { element, context } = canvas(CANVAS_W * ART_SCALE, CANVAS_H * ART_SCALE)
    context.drawImage(art, 0, 0, element.width, element.height)
    artImages.set(slide.id, element)
    backdrops.set(slide.id, element.toDataURL("image/jpeg", 0.92))
    onProgress?.("art", index + 1, deck.slides.length)
  }

  const jobs = pptx.deckPhotoJobs(deck)
  const images = new Map<string, PlacedImage>()
  let done = 0
  const queue = [...jobs]
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift()!
      const photo = await readablePhoto(job.url)
      const slideId = job.key.split("#")[0]
      const art = artImages.get(slideId)
      if (photo && art) {
        try {
          images.set(job.key, bakePhoto(photo, job.slot, art, theme))
        } catch {
          /* A picture the canvas cannot read leaves the slot's panel. */
        }
      }
      done += 1
      onProgress?.("photos", done, jobs.length)
    }
  }))

  const icons = new Map<string, string>()
  for (const [name, color] of pptx.deckIcons(deck)) {
    const svg = pptx.iconSvg(name, color, 192)
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    const { element, context } = canvas(192, 192)
    context.drawImage(image, 0, 0, 192, 192)
    icons.set(`${name}:${color}`, element.toDataURL("image/png"))
  }

  // The deck's text faces are web fonts; PowerPoint's are Office fonts. The
  // measurer uses the Office font, which every desktop already has.
  onProgress?.("file", 0, 1)
  const blob = await pptx.buildPptxBlob(deck, {
    images,
    backdrops,
    icon: (name: DeckIconName, color: string) => icons.get(`${name}:${color}`),
    measure: canvasMeasure(),
  })
  onProgress?.("file", 1, 1)
  return blob
}
