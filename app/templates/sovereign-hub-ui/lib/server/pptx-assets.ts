import "server-only"

import sharp from "sharp"
import { deckTheme } from "@/lib/presentations/themes"
import { backdropSvg } from "@/lib/presentations/design"
import { buildPptx, deckIcons, deckPhotoJobs, iconSvg, type PlacedImage, type PptxAssets } from "@/lib/presentations/pptx"
import type { Deck } from "@/lib/presentations/types"

/**
 * Server-side pictures for a PowerPoint file: the theme's background art and
 * the feature icons rasterised with sharp (librsvg), and photos cut to the
 * exact shape of their slot.
 *
 * The browser builds the full-quality file itself (pptx-browser.ts). This is
 * the fallback, and it has to fit Render's response budget, so it tries
 * progressively lighter versions — smaller art, smaller photos, then no
 * photos — and returns the best one that fits. Text, shapes, charts, tables
 * and notes are identical in every version.
 */

type Tier = { artWidth: number; artQuality: number; photoSide: number; photoQuality: number; photos: boolean; art: boolean }

const TIERS: Tier[] = [
  { artWidth: 1280, artQuality: 74, photoSide: 960, photoQuality: 70, photos: true, art: true },
  { artWidth: 960, artQuality: 64, photoSide: 640, photoQuality: 60, photos: true, art: true },
  { artWidth: 960, artQuality: 60, photoSide: 480, photoQuality: 52, photos: true, art: true },
  { artWidth: 960, artQuality: 60, photoSide: 0, photoQuality: 0, photos: false, art: true },
  { artWidth: 0, artQuality: 0, photoSide: 0, photoQuality: 0, photos: false, art: false },
]

const HERO_SHADE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720" preserveAspectRatio="none"><defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".8"/><stop offset=".42" stop-color="#000" stop-opacity=".5"/><stop offset=".74" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient><linearGradient id="v" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".48" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="1280" height="720" fill="url(#h)"/><rect width="1280" height="720" fill="url(#v)"/></svg>`

const jpeg = (buffer: Buffer) => `data:image/jpeg;base64,${buffer.toString("base64")}`

async function rasterArt(deck: Pick<Deck, "theme" | "slides">, tier: Tier) {
  const theme = deckTheme(deck.theme)
  const art = new Map<string, string>()
  await Promise.all(deck.slides.map(async (slide, index) => {
    const svg = Buffer.from(backdropSvg(theme, slide.layout, index))
    const buffer = await sharp(svg, { density: 72 }).resize(tier.artWidth, Math.round(tier.artWidth * 0.5625)).jpeg({ quality: tier.artQuality, mozjpeg: true }).toBuffer()
    art.set(slide.id, jpeg(buffer))
  }))
  return art
}

async function rasterIcons(deck: Pick<Deck, "theme" | "slides">) {
  const icons = new Map<string, string>()
  await Promise.all(deckIcons(deck).map(async ([name, color]) => {
    const png = await sharp(Buffer.from(iconSvg(name, color, 128))).resize(128, 128).png().toBuffer()
    icons.set(`${name}:${color}`, `data:image/png;base64,${png.toString("base64")}`)
  }))
  return icons
}

/** Photos cut to their slot's proportions (and darkened under hero text). */
async function cutPhotos(deck: Pick<Deck, "theme" | "slides">, sources: Map<string, Buffer>, tier: Tier) {
  const placed = new Map<string, PlacedImage>()
  await Promise.all(deckPhotoJobs(deck).map(async (job) => {
    const source = sources.get(job.key)
    if (!source) return
    try {
      const { w, h } = job.slot.box
      const scale = tier.photoSide / Math.max(w, h)
      const width = Math.max(64, Math.round(w * scale))
      const height = Math.max(64, Math.round(h * scale))
      let image = sharp(source).rotate().resize(width, height, { fit: "cover", position: "attention" })
      if (job.slot.shade === "hero") {
        const shade = await sharp(Buffer.from(HERO_SHADE)).resize(width, height, { fit: "fill" }).png().toBuffer()
        image = sharp(await image.toBuffer()).composite([{ input: shade }])
      }
      placed.set(job.key, { data: jpeg(await image.jpeg({ quality: tier.photoQuality, mozjpeg: true }).toBuffer()), box: job.slot.box })
    } catch {
      /* An unreadable picture leaves the slot's panel. */
    }
  }))
  return placed
}

/**
 * The best file that fits `budget` bytes. `photos` maps a slot key to the
 * original image bytes the caller fetched.
 */
export async function buildServerPptx(deck: Pick<Deck, "title" | "theme" | "slides">, photos: Map<string, Buffer>, budget = Infinity): Promise<{ file: Buffer; tier: number }> {
  let icons = new Map<string, string>()
  try {
    icons = await rasterIcons(deck)
  } catch {
    /* Icons fall back to a plain accent dot. */
  }
  let last: Buffer | null = null
  for (const [index, tier] of TIERS.entries()) {
    try {
      const assets: PptxAssets = {
        icon: (name, color) => icons.get(`${name}:${color}`),
        ...(tier.art ? { backdrops: await rasterArt(deck, tier) } : {}),
        ...(tier.photos && photos.size ? { images: await cutPhotos(deck, photos, tier) } : {}),
      }
      const file = await buildPptx(deck, assets)
      last = file
      if (file.length <= budget) return { file, tier: index }
    } catch (error) {
      if (index === TIERS.length - 1) throw error
    }
  }
  return { file: last || (await buildPptx(deck)), tier: TIERS.length - 1 }
}
