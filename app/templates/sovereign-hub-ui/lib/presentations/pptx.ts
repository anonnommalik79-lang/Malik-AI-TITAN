import PptxGenJSModule from "pptxgenjs"
import { createElement } from "react"
import { DECK_ICONS } from "@/lib/presentations/icon-components"
import { deckTheme, type DeckTheme } from "@/lib/presentations/themes"
import {
  BODY_BOTTOM,
  BODY_TOP,
  CANVAS_H,
  CANVAS_W,
  HEAD_H,
  HEAD_TOP,
  HERO_SLOT,
  PAD,
  bulletsVariant,
  coverLayout,
  gallerySlots,
  sidePhotoLayout,
  statOnTiles,
  type Box,
  type PhotoSlot,
} from "@/lib/presentations/design"
import { IMAGE_LAYOUTS, type Deck, type DeckIconName, type Slide } from "@/lib/presentations/types"
import { headlineScale, slideDensity, type SlideDensity } from "@/lib/presentations/visual-fit"

/**
 * The deck as a real PowerPoint file.
 *
 * Every slide is built from native text boxes, shapes, a table and a chart —
 * the text is text, the chart keeps its data, the notes are in the notes pane —
 * on top of the theme's background art, so the file opens in PowerPoint,
 * Keynote, Google Slides and LibreOffice looking like the deck on screen and
 * still editable.
 *
 * Three things used to break a downloaded deck, and each is handled here:
 *
 *  - Text overflowing its box. PowerPoint's "shrink on overflow" is only
 *    applied once someone edits the text, so a file that relies on it opens
 *    with headlines spilling over photos. Every box here gets a font size
 *    computed to fit — measured with the browser's real font metrics when the
 *    file is built in the browser, estimated from a metrics table otherwise.
 *  - Vector art. PptxGenJS cannot make the PNG fallback an SVG needs when it
 *    runs on a server, and every app but PowerPoint 365 then shows a broken
 *    picture. Nothing here is SVG: the background art, icons and photos
 *    arrive rasterised (see pptx-browser.ts and the export route).
 *  - Stretched photos. A photo is cut to its box before it is placed, with
 *    its rounded, arched or diagonal edge and its shadow baked in, so it is
 *    never squashed into a frame of another shape.
 *
 * Geometry is the screen's: the 1280 × 720 canvas from design.ts, at 96 px
 * per inch, which is exactly PowerPoint's 13.333 × 7.5 inch wide slide.
 */

type PptxInstance = {
  layout: string
  title: string
  author: string
  company: string
  subject: string
  addSlide: () => PptxSlide
  write: (options: { outputType: "nodebuffer" | "blob" }) => Promise<unknown>
}

type PptxSlide = {
  background: { color?: string; data?: string; path?: string }
  addText: (text: unknown, options: Record<string, unknown>) => void
  addShape: (shape: string, options: Record<string, unknown>) => void
  addImage: (options: Record<string, unknown>) => void
  addTable: (rows: unknown[], options: Record<string, unknown>) => void
  addChart: (type: string, data: unknown[], options: Record<string, unknown>) => void
  addNotes: (notes: string) => void
}

const PptxGenJS = ((PptxGenJSModule as unknown as { default?: unknown }).default || PptxGenJSModule) as unknown as new () => PptxInstance

/* ------------------------------------------------------------------ inputs */

/** Width of `text` set at 1 pt, in points. */
export type TextMeasure = (text: string, font: string, bold: boolean) => number

/** A picture ready to place: its data URL and the canvas box (px) it covers. */
export type PlacedImage = { data: string; box?: Box; baked?: boolean }

export type PptxAssets = {
  /** Photos by slot key: a slide id, or "slideId#index" for a gallery photo. */
  images?: Map<string, string | PlacedImage>
  /** Each slide's background art, rasterised, by slide id. */
  backdrops?: Map<string, string>
  /** A raster (PNG) icon for a feature card. */
  icon?: (name: DeckIconName, color: string) => string | undefined
  /** Real text metrics; the built-in table is used without it. */
  measure?: TextMeasure
}

/** Every photo a deck shows, with the slot it is placed in. */
export type PhotoJob = { key: string; url: string; slideIndex: number; slot: PhotoSlot; layout: Slide["layout"] }

export function deckPhotoJobs(deck: Pick<Deck, "theme" | "slides">): PhotoJob[] {
  const theme = deckTheme(deck.theme)
  return deck.slides.flatMap((slide, slideIndex): PhotoJob[] => {
    if (slide.layout === "gallery") {
      const slots = gallerySlots(theme, slide.items.length, Boolean(slide.intro))
      return slide.items.flatMap((item, i): PhotoJob[] => (item.image?.url ? [{ key: `${slide.id}#${i}`, url: item.image.url, slideIndex, slot: slots[i], layout: slide.layout }] : []))
    }
    if (!IMAGE_LAYOUTS.has(slide.layout) || !slide.imageUrl) return []
    const slot = slide.layout === "hero"
      ? HERO_SLOT
      : slide.layout === "title"
        ? coverLayout(theme).slot
        : sidePhotoLayout(theme, slide.layout === "image-text" ? slide.imageSide : "right").slot
    return [{ key: slide.id, url: slide.imageUrl, slideIndex, slot, layout: slide.layout }]
  })
}

/* ------------------------------------------------------------- measuring */

/** Line height of "single" spacing as a multiple of the font size, per Office font. */
const LINE_HEIGHT: Record<string, number> = {
  Arial: 1.15, "Arial Black": 1.41, Georgia: 1.14, "Trebuchet MS": 1.16, Verdana: 1.22,
  Calibri: 1.22, Cambria: 1.17, Consolas: 1.17,
}

/** How much wider than Arial a font sets the same text. */
const WIDTH_FACTOR: Record<string, number> = {
  Arial: 1, "Arial Black": 1.24, Georgia: 1.07, "Trebuchet MS": 0.99, Verdana: 1.18,
  Calibri: 0.9, Cambria: 0.99,
}

function charWidth(ch: string) {
  if (ch === " ") return 0.278
  if (/[iljI.,:;'|!]/.test(ch)) return 0.24
  if (/[ft()[\]r\-«»"]/.test(ch)) return 0.34
  if (/[0-9]/.test(ch)) return 0.556
  if (/[mwMWЖжШшЩщЮюЫыМм]/.test(ch)) return ch === ch.toLowerCase() ? 0.78 : 0.9
  if (/[A-ZА-ЯЁӘІҢҒҮҰҚӨҺ]/.test(ch)) return 0.7
  if (/[а-яёәіңғүұқөһ]/.test(ch)) return 0.56
  if (/[a-z]/.test(ch)) return 0.52
  return 0.6
}

/** Text metrics without a browser: an Arial-calibrated table, scaled per font. */
export const estimateTextWidth: TextMeasure = (text, font, bold) => {
  if (font === "Consolas") return text.length * 0.55
  let width = 0
  for (const ch of text) width += charWidth(ch)
  return width * (WIDTH_FACTOR[font] || 1.05) * (bold ? 1.07 : 1)
}

function lineCount(text: string, widthPt: number, size: number, font: string, bold: boolean, measure: TextMeasure) {
  const limit = widthPt / size
  const space = measure(" ", font, bold)
  let lines = 1
  let current = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = measure(word, font, bold)
    if (current === 0) {
      lines += Math.max(0, Math.ceil(w / limit) - 1)
      current = w > limit ? w % limit : w
    } else if (current + space + w <= limit) {
      current += space + w
    } else {
      lines += 1 + Math.max(0, Math.ceil(w / limit) - 1)
      current = w > limit ? w % limit : w
    }
  }
  return lines
}

/** The largest size, at most `max`, at which every paragraph fits the box. */
export function fitFontSize(input: {
  paragraphs: string[]
  widthPt: number
  heightPt: number
  font: string
  bold?: boolean
  max: number
  min?: number
  lineSpacing?: number
  paraGapPt?: number
  measure?: TextMeasure
}) {
  const measure = input.measure || estimateTextWidth
  const min = input.min ?? 9
  const lineHeight = (LINE_HEIGHT[input.font] || 1.18) * (input.lineSpacing || 1)
  // A little slack: PowerPoint wraps a hair earlier than a measured line.
  const width = input.widthPt * 0.95
  for (let size = input.max; size >= min; size -= 0.5) {
    const lines = input.paragraphs.reduce((sum, text) => sum + lineCount(text, width, size, input.font, Boolean(input.bold), measure), 0)
    const height = lines * size * lineHeight + (input.paraGapPt || 0) * Math.max(0, input.paragraphs.length - 1)
    if (height <= input.heightPt) return size
  }
  return min
}

/* ----------------------------------------------------------------- drawing */

const I = (px: number) => Math.round((px / 96) * 10000) / 10000
/** Screen px on the 1280 canvas to points: 1280 px = 960 pt. */
const PT = (px: number) => px * 0.75

type Ctx = {
  slide: PptxSlide
  theme: DeckTheme
  density: SlideDensity
  index: number
  total: number
  assets: PptxAssets
  measure: TextMeasure
}

type TextStyle = {
  role?: "heading" | "body" | "label"
  /** Largest size in points. */
  size: number
  min?: number
  bold?: boolean
  italic?: boolean
  color?: string
  align?: "left" | "center" | "right"
  valign?: "top" | "middle" | "bottom"
  lineSpacing?: number
  charSpacing?: number
  upper?: boolean
  /** Scale with the slide's density (body text), or not (labels, numbers). */
  dense?: boolean
}

function fontOf(ctx: Ctx, role: TextStyle["role"]) {
  return role === "heading" ? ctx.theme.pptxHeadingFont : ctx.theme.pptxBodyFont
}

function densityScale(ctx: Ctx) {
  return ctx.density === "ultra" ? 0.8 : ctx.density === "dense" ? 0.88 : ctx.density === "compact" ? 0.95 : 1
}

/** A text box whose font size is computed to fit it — never left to autofit. */
function text(ctx: Ctx, value: string, box: Box, style: TextStyle) {
  if (!value) return
  const font = fontOf(ctx, style.role)
  const shown = style.upper ? value.toLocaleUpperCase() : value
  const bold = style.bold ?? style.role === "heading"
  const max = style.dense === false ? style.size : style.size * densityScale(ctx)
  const lineSpacing = style.lineSpacing ?? (style.role === "heading" ? 0.95 : 1.08)
  const size = fitFontSize({
    paragraphs: [shown],
    widthPt: PT(box.w),
    heightPt: PT(box.h),
    font,
    bold,
    max,
    min: style.min ?? Math.min(max, 10),
    lineSpacing,
    measure: ctx.measure,
  })
  ctx.slide.addText(shown, {
    x: I(box.x), y: I(box.y), w: I(box.w), h: I(box.h),
    fontFace: font, fontSize: size, bold, italic: Boolean(style.italic),
    color: style.color || (style.role === "heading" ? ctx.theme.text : ctx.theme.muted),
    align: style.align || "left", valign: style.valign || "top",
    margin: 0, lineSpacingMultiple: lineSpacing, fit: "shrink",
    ...(style.charSpacing ? { charSpacing: style.charSpacing } : {}),
  })
}

/**
 * One font size for a row of siblings — every card title, every tile body —
 * so a deck never shows three cards with three different type sizes. The
 * size is the largest at which the longest of them still fits.
 */
function uniform(ctx: Ctx, values: Array<string | undefined>, box: Pick<Box, "w" | "h">, style: TextStyle): TextStyle {
  const font = fontOf(ctx, style.role)
  const bold = style.bold ?? style.role === "heading"
  const max = style.dense === false ? style.size : style.size * densityScale(ctx)
  const lineSpacing = style.lineSpacing ?? (style.role === "heading" ? 0.95 : 1.08)
  const sizes = values.filter((value): value is string => Boolean(value)).map((value) => fitFontSize({
    paragraphs: [style.upper ? value.toLocaleUpperCase() : value],
    widthPt: PT(box.w),
    heightPt: PT(box.h),
    font,
    bold,
    max,
    min: style.min ?? Math.min(max, 10),
    lineSpacing,
    measure: ctx.measure,
  }))
  const size = sizes.length ? Math.min(...sizes) : max
  return { ...style, size, min: size, dense: false }
}

/** A bulleted list fitted as a whole. */
function list(ctx: Ctx, items: string[], box: Box, style: Omit<TextStyle, "role"> & { gap?: number }) {
  if (!items.length) return
  const font = ctx.theme.pptxBodyFont
  const indentPt = 14
  const gap = style.gap ?? 8
  const max = style.size * densityScale(ctx)
  const size = fitFontSize({
    paragraphs: items,
    widthPt: PT(box.w) - indentPt,
    heightPt: PT(box.h),
    font,
    max,
    min: style.min ?? 10,
    lineSpacing: 1.08,
    paraGapPt: gap,
    measure: ctx.measure,
  })
  ctx.slide.addText(items.map((item) => ({ text: item, options: { bullet: { indent: indentPt }, breakLine: true } })), {
    x: I(box.x), y: I(box.y), w: I(box.w), h: I(box.h),
    fontFace: font, fontSize: size, color: style.color || ctx.theme.text,
    valign: "top", margin: 0, paraSpaceAfter: gap, lineSpacingMultiple: 1.08, fit: "shrink",
  })
}

/** A card, a column or a tile, built the way the theme builds surfaces. */
function surface(ctx: Ctx, box: Box, options: { radius?: number } = {}) {
  const t = ctx.theme
  const radius = options.radius ?? t.radius
  const shape = radius > 0 ? "roundRect" : "rect"
  const geometry = { x: I(box.x), y: I(box.y), w: I(box.w), h: I(box.h), ...(radius > 0 ? { rectRadius: I(Math.min(radius, Math.min(box.w, box.h) / 2)) } : {}) }
  switch (t.surfaceStyle) {
    case "glass":
      ctx.slide.addShape(shape, t.dark
        ? { ...geometry, fill: { color: "FFFFFF", transparency: 91 }, line: { color: "FFFFFF", transparency: 80, width: 0.75 } }
        : { ...geometry, fill: { color: "FFFFFF", transparency: 34 }, line: { color: "FFFFFF", transparency: 5, width: 0.75 }, shadow: { type: "outer", blur: 18, offset: 6, angle: 90, color: "782840", opacity: 0.12 } })
      return
    case "outline":
      ctx.slide.addShape(shape, { ...geometry, fill: { color: t.bg, transparency: 100 }, line: { color: t.accent, transparency: 55, width: 1.25 } })
      return
    case "soft":
      ctx.slide.addShape(shape, { ...geometry, fill: { color: t.surface }, line: { color: t.surface, transparency: 100, width: 0 }, shadow: { type: "outer", blur: 16, offset: 6, angle: 90, color: t.dark ? "000000" : "102040", opacity: t.dark ? 0.45 : 0.12 } })
      return
    case "brutal":
      ctx.slide.addShape(shape, { ...geometry, fill: { color: t.surface }, line: { color: t.text, width: 2.25 }, shadow: { type: "outer", blur: 0, offset: 5.25, angle: 45, color: t.text, opacity: 1 } })
      return
    case "line":
      ctx.slide.addShape("line", { x: I(box.x), y: I(box.y), w: I(box.w), h: 0, line: { color: t.text, width: 1.5 } })
      return
    case "panel":
    default:
      ctx.slide.addShape(shape, { ...geometry, fill: { color: t.surface }, line: { color: t.border, width: 0.75 } })
  }
}

/** Inner padding of a surface: a rules-only theme has no box to pad. */
function inset(ctx: Ctx, px: number) {
  return ctx.theme.surfaceStyle === "line" ? { x: 0, top: 18 } : { x: px, top: px }
}

function heading(ctx: Ctx, slide: Slide, value: string) {
  text(ctx, value, { x: PAD, y: HEAD_TOP, w: CANVAS_W - PAD * 2, h: HEAD_H }, {
    role: "heading", size: PT(52) * headlineScale(slide), min: 18, valign: "bottom", upper: ctx.theme.titleCase === "upper", dense: false,
  })
}

function pageNumber(ctx: Ctx) {
  ctx.slide.addText(`${ctx.index + 1} / ${ctx.total}`, {
    x: I(CANVAS_W - PAD - 140), y: I(CANVAS_H - 50), w: I(140), h: I(24),
    fontFace: ctx.theme.pptxBodyFont, fontSize: 9.5, color: ctx.theme.muted, align: "right", margin: 0,
  })
}

/** A photo in its slot: the baked picture, or the theme's quiet panel. */
function photo(ctx: Ctx, key: string, slot: PhotoSlot, credit?: string) {
  const raw = ctx.assets.images?.get(key)
  const image: PlacedImage | undefined = typeof raw === "string" ? { data: raw } : raw
  const { box } = slot
  if (!image?.data) {
    // No picture: a quiet panel keeps the composition instead of a hole.
    ctx.slide.addShape(slot.mask.kind === "round" ? "roundRect" : "rect", {
      x: I(box.x), y: I(box.y), w: I(box.w), h: I(box.h),
      ...(slot.mask.kind === "round" ? { rectRadius: I(slot.mask.r) } : {}),
      fill: { color: ctx.theme.surface }, line: { color: ctx.theme.border, width: 0.75 },
    })
    return
  }
  const placed = image.box || box
  ctx.slide.addImage({ data: image.data, x: I(placed.x), y: I(placed.y), w: I(placed.w), h: I(placed.h) })
  if (credit) {
    // The credit the photo's licence asks for, small in its corner.
    const cw = Math.min(box.w - 20, Math.max(150, credit.length * 5.6))
    ctx.slide.addText(credit, {
      x: I(box.x + box.w - cw - 10), y: I(box.y + box.h - 30), w: I(cw), h: I(20),
      fontFace: ctx.theme.pptxBodyFont, fontSize: 6.5, color: "FFFFFF", align: "right", valign: "middle",
      fill: { color: "000000", transparency: 50 }, margin: [0, 4, 0, 4], fit: "shrink",
    })
  }
}

function icon(ctx: Ctx, name: DeckIconName, color: string, box: Box) {
  const data = ctx.assets.icon?.(name, color)
  if (data) ctx.slide.addImage({ data, x: I(box.x), y: I(box.y), w: I(box.w), h: I(box.h) })
  else ctx.slide.addShape("ellipse", { x: I(box.x + box.w * 0.3), y: I(box.y + box.h * 0.3), w: I(box.w * 0.4), h: I(box.h * 0.4), fill: { color }, line: { color, width: 0 } })
}

function accentRule(ctx: Ctx, x: number, y: number, w = 72, h = 4) {
  ctx.slide.addShape("rect", { x: I(x), y: I(y), w: I(w), h: I(h), fill: { color: ctx.theme.accent }, line: { color: ctx.theme.accent, width: 0 } })
}

/* ---------------------------------------------------------------- layouts */

function drawSlide(ctx: Ctx, slide: Slide) {
  const { theme } = ctx
  const upper = theme.titleCase === "upper"
  const contentW = CANVAS_W - PAD * 2

  switch (slide.layout) {
    case "title": {
      const cover = coverLayout(theme)
      if (slide.imageUrl) photo(ctx, slide.id, cover.slot, slide.imageCredit)
      const w = (slide.imageUrl ? CANVAS_W - cover.textRight : CANVAS_W - PAD) - PAD
      let y = 190
      if (slide.kicker) {
        text(ctx, slide.kicker, { x: PAD, y, w, h: 28 }, { role: "label", size: 12, bold: true, color: theme.accent, charSpacing: 3, upper: true, dense: false })
        y += 44
      }
      const size = PT(slide.imageUrl ? (theme.id === "editorial" ? 60 : 66) : theme.id === "editorial" ? 88 : 84) * headlineScale(slide)
      text(ctx, slide.title, { x: PAD, y, w, h: 470 - y }, { role: "heading", size, min: 22, valign: "bottom", upper, dense: false, lineSpacing: 0.92 })
      accentRule(ctx, PAD, 492)
      if (slide.subtitle) text(ctx, slide.subtitle, { x: PAD, y: 520, w: Math.min(w, 900), h: 130 }, { size: PT(26), min: 11 })
      return
    }

    case "hero": {
      photo(ctx, slide.id, HERO_SLOT, slide.imageCredit)
      if (!ctx.assets.images?.get(slide.id)) {
        ctx.slide.addShape("rect", { x: 0, y: 0, w: I(CANVAS_W), h: I(CANVAS_H), fill: { color: "000000", transparency: 45 }, line: { color: "000000", transparency: 100, width: 0 } })
      }
      const w = CANVAS_W - 88 - 360
      if (slide.kicker) text(ctx, slide.kicker, { x: 88, y: 300, w, h: 28 }, { role: "label", size: 12, bold: true, color: "FFFFFF", charSpacing: 3, upper: true, dense: false })
      text(ctx, slide.title, { x: 88, y: 336, w, h: 196 }, { role: "heading", size: PT(upper ? 72 : 86) * headlineScale(slide), min: 22, valign: "bottom", color: "FFFFFF", upper, dense: false, lineSpacing: 0.92 })
      if (slide.subtitle) text(ctx, slide.subtitle, { x: 88, y: 548, w: 760, h: 92 }, { size: PT(28), min: 11, color: "EDEDED" })
      return
    }

    case "section": {
      text(ctx, slide.number || String(ctx.index + 1).padStart(2, "0"), { x: PAD, y: 150, w: 600, h: 150 }, { role: "heading", size: 112, bold: true, color: theme.accent, dense: false })
      text(ctx, slide.title, { x: PAD, y: 320, w: contentW - 200, h: 170 }, { role: "heading", size: PT(upper ? 60 : 72) * headlineScale(slide), min: 20, valign: "bottom", upper, dense: false })
      if (slide.subtitle) text(ctx, slide.subtitle, { x: PAD, y: 505, w: 880, h: 100 }, { size: PT(26), min: 11 })
      return
    }

    case "bullets": {
      heading(ctx, slide, slide.title)
      let top = BODY_TOP
      if (slide.intro) {
        text(ctx, slide.intro, { x: PAD, y: top - 18, w: 1000, h: 52 }, { size: PT(22), min: 10 })
        top += 44
      }
      if (bulletsVariant(theme, slide, ctx.index) === "grid") {
        const count = slide.points.length
        const columns = count === 3 ? 3 : 2
        const rows = Math.ceil(count / columns)
        const gap = 22
        const tileW = (contentW - gap * (columns - 1)) / columns
        const tileH = Math.min(320, (BODY_BOTTOM + 10 - top - gap * (rows - 1)) / rows)
        const startY = top + Math.max(0, (BODY_BOTTOM - top - (tileH * rows + gap * (rows - 1))) / 2)
        const tilePad = inset(ctx, 28)
        const titleTop = rows > 1 ? 44 : 58
        const bodyTop = titleTop + (rows > 1 ? 44 : 70)
        const titleStyle = uniform(ctx, slide.points.map((p) => p.title), { w: tileW - tilePad.x * 2, h: bodyTop - titleTop - 6 }, { role: "heading", size: PT(27), min: 11, color: theme.text })
        const bodyStyle = uniform(ctx, slide.points.map((p) => p.body), { w: tileW - tilePad.x * 2, h: tileH - tilePad.top - bodyTop - 14 }, { size: PT(19), min: 9 })
        slide.points.forEach((point, i) => {
          const x = PAD + (i % columns) * (tileW + gap)
          const y = startY + Math.floor(i / columns) * (tileH + gap)
          const pad = inset(ctx, 28)
          surface(ctx, { x, y, w: tileW, h: tileH })
          const accent = theme.id === "candy" ? theme.series[i % 3] : theme.accent
          text(ctx, String(i + 1).padStart(2, "0"), { x: x + pad.x, y: y + pad.top - 4, w: 120, h: rows > 1 ? 40 : 52 }, { role: "heading", size: PT(rows > 1 ? 34 : 42), color: accent, dense: false })
          text(ctx, point.title, { x: x + pad.x, y: y + pad.top + titleTop, w: tileW - pad.x * 2, h: bodyTop - titleTop - 6 }, titleStyle)
          if (point.body) text(ctx, point.body, { x: x + pad.x, y: y + pad.top + bodyTop, w: tileW - pad.x * 2, h: tileH - pad.top - bodyTop - 14 }, bodyStyle)
        })
        return
      }
      const rowH = Math.min(118, (BODY_BOTTOM + 20 - top) / slide.points.length)
      const rowTitle = uniform(ctx, slide.points.map((p) => p.title), { w: 400, h: rowH - 28 }, { role: "heading", size: PT(29), min: 11, color: theme.text })
      const rowBody = uniform(ctx, slide.points.map((p) => p.body), { w: contentW - 512, h: rowH - 30 }, { size: PT(22), min: 9 })
      slide.points.forEach((point, i) => {
        const y = top + i * rowH
        ctx.slide.addShape("line", { x: I(PAD), y: I(y), w: I(contentW), h: 0, line: { color: theme.border, width: 0.75 } })
        text(ctx, String(i + 1).padStart(2, "0"), { x: PAD, y: y + 20, w: 56, h: 24 }, { role: "label", size: theme.id === "editorial" ? 20 : 11.5, bold: true, italic: theme.id === "editorial", color: theme.accent, dense: false })
        text(ctx, point.title, { x: PAD + 84, y: y + 16, w: 400, h: rowH - 28 }, rowTitle)
        if (point.body) text(ctx, point.body, { x: PAD + 512, y: y + 18, w: contentW - 512, h: rowH - 30 }, rowBody)
      })
      return
    }

    case "two-column": {
      heading(ctx, slide, slide.title)
      const gap = 28
      const colW = (contentW - gap) / 2
      const h = BODY_BOTTOM - BODY_TOP
      ;[slide.left, slide.right].forEach((column, i) => {
        const x = PAD + i * (colW + gap)
        const pad = inset(ctx, 38)
        surface(ctx, { x, y: BODY_TOP, w: colW, h })
        text(ctx, column.heading, { x: x + pad.x, y: BODY_TOP + pad.top, w: colW - pad.x * 2, h: 44 }, { role: "heading", size: PT(31), min: 12, color: i === 0 ? theme.muted : theme.accent })
        list(ctx, column.points, { x: x + pad.x, y: BODY_TOP + pad.top + 66, w: colW - pad.x * 2, h: h - pad.top - 66 - 30 }, { size: PT(23), min: 9 })
      })
      return
    }

    case "stat": {
      heading(ctx, slide, slide.title)
      const count = slide.stats.length
      const gap = 40
      const cellW = (contentW - gap * (count - 1)) / count
      const tiles = statOnTiles(theme)
      const top = 290
      const longest = Math.max(...slide.stats.map((stat) => stat.value.length), 2)
      const figure = 0.62 * (theme.pptxHeadingFont === "Arial Black" ? 1.24 : theme.pptxHeadingFont === "Verdana" ? 1.15 : 1)
      const valueSize = Math.min(count === 1 ? 150 : 100, Math.floor(PT(cellW - (tiles ? 60 : 0)) / (longest * figure)))
      const labelStyle = uniform(ctx, slide.stats.map((stat) => stat.label), { w: cellW - (tiles ? 60 : 0), h: 90 }, { size: PT(24), min: 10, color: theme.text })
      slide.stats.forEach((stat, i) => {
        const x = PAD + i * (cellW + gap)
        const pad = tiles ? 30 : 0
        if (tiles) surface(ctx, { x, y: top - 30, w: cellW, h: 330 })
        else ctx.slide.addShape("line", { x: I(x), y: I(top), w: I(cellW), h: 0, line: { color: theme.accent, width: 2.25 } })
        text(ctx, stat.value.replace(/ /g, " "), { x: x + pad, y: top + 22, w: cellW - pad * 2, h: 150 }, { role: "heading", size: valueSize, min: 24, color: theme.accent, dense: false })
        text(ctx, stat.label, { x: x + pad, y: top + 184, w: cellW - pad * 2, h: 90 }, labelStyle)
      })
      if (slide.context) text(ctx, slide.context, { x: PAD, y: CANVAS_H - 70, w: contentW - 160, h: 40 }, { size: 12, min: 8 })
      return
    }

    case "quote": {
      // The mark is set in Georgia everywhere: its curly quote reads as a
      // quote in every theme, where a sans face draws two slanted bars.
      ctx.slide.addText("“", { x: I(100), y: I(70), w: I(200), h: I(180), fontFace: "Georgia", fontSize: 150, bold: true, color: theme.accent, margin: 0, valign: "top" })
      text(ctx, slide.quote, { x: 110, y: 230, w: CANVAS_W - 220, h: 300 }, { role: "heading", size: PT(48) * headlineScale(slide), min: 14, color: theme.text, bold: false, lineSpacing: 1.1, dense: false })
      if (slide.author) {
        ctx.slide.addText([
          { text: slide.author, options: { bold: true, color: theme.text, breakLine: Boolean(slide.role) } },
          ...(slide.role ? [{ text: slide.role, options: { color: theme.muted } }] : []),
        ], { x: I(110), y: I(560), w: I(CANVAS_W - 220), h: I(80), fontFace: theme.pptxBodyFont, fontSize: 15.5, margin: 0, valign: "top" })
      }
      return
    }

    case "image-text": {
      const side = sidePhotoLayout(theme, slide.imageSide)
      photo(ctx, slide.id, side.slot, slide.imageCredit)
      const x = side.copy.left
      const w = CANVAS_W - side.copy.left - side.copy.right
      text(ctx, slide.title, { x, y: 120, w, h: 190 }, { role: "heading", size: PT(upper ? 42 : 50) * headlineScale(slide), min: 16, valign: "bottom", upper, dense: false })
      let y = 330
      if (slide.body) {
        const h = slide.points.length ? 150 : 300
        text(ctx, slide.body, { x, y, w, h }, { size: PT(22), min: 10 })
        y += h + 16
      }
      if (slide.points.length) list(ctx, slide.points, { x, y, w, h: CANVAS_H - 60 - y }, { size: PT(23), min: 9 })
      return
    }

    case "cards": {
      heading(ctx, slide, slide.title)
      const count = slide.cards.length
      const gap = 24
      const cardW = (contentW - gap * (count - 1)) / count
      const h = BODY_BOTTOM - BODY_TOP
      const cardPad = inset(ctx, 32)
      const cardTitle = uniform(ctx, slide.cards.map((c) => c.title), { w: cardW - cardPad.x * 2, h: 88 }, { role: "heading", size: PT(32), min: 11, color: theme.text })
      const cardBody = uniform(ctx, slide.cards.map((c) => c.body), { w: cardW - cardPad.x * 2, h: h - cardPad.top - 170 - 24 }, { size: PT(21), min: 9 })
      slide.cards.forEach((card, i) => {
        const x = PAD + i * (cardW + gap)
        const pad = inset(ctx, 32)
        surface(ctx, { x, y: BODY_TOP, w: cardW, h })
        const accent = theme.id === "candy" ? theme.series[i % 3] : theme.accent
        if (theme.surfaceStyle !== "line" && theme.surfaceStyle !== "brutal") {
          ctx.slide.addShape("rect", { x: I(x + Math.min(theme.radius, 20)), y: I(BODY_TOP), w: I(cardW - Math.min(theme.radius, 20) * 2), h: I(4), fill: { color: accent }, line: { color: accent, width: 0 } })
        }
        ctx.slide.addShape("roundRect", { x: I(x + pad.x), y: I(BODY_TOP + pad.top), w: I(52), h: I(30), rectRadius: I(15), fill: { color: accent, transparency: theme.id === "candy" ? 0 : 84 }, line: { color: accent, transparency: 100, width: 0 } })
        text(ctx, String(i + 1).padStart(2, "0"), { x: x + pad.x, y: BODY_TOP + pad.top + 5, w: 52, h: 20 }, { role: "label", size: 10.5, bold: true, color: theme.id === "candy" ? "FFFFFF" : accent, align: "center", dense: false })
        text(ctx, card.title, { x: x + pad.x, y: BODY_TOP + pad.top + 70, w: cardW - pad.x * 2, h: 88 }, cardTitle)
        if (card.body) text(ctx, card.body, { x: x + pad.x, y: BODY_TOP + pad.top + 170, w: cardW - pad.x * 2, h: h - pad.top - 170 - 24 }, cardBody)
      })
      return
    }

    case "timeline": {
      heading(ctx, slide, slide.title)
      const count = slide.steps.length
      const gap = 24
      const stepW = (contentW - gap * (count - 1)) / count
      const lineY = 330
      ctx.slide.addShape("line", { x: I(PAD), y: I(lineY), w: I(contentW), h: 0, line: { color: theme.border, width: 1.5 } })
      const stepTitle = uniform(ctx, slide.steps.map((s) => s.title), { w: stepW - 8, h: 70 }, { role: "heading", size: PT(28), min: 11, color: theme.text })
      const stepBody = uniform(ctx, slide.steps.map((s) => s.body), { w: stepW - 12, h: BODY_BOTTOM - lineY - 100 }, { size: PT(20), min: 9 })
      slide.steps.forEach((step, i) => {
        const x = PAD + i * (stepW + gap)
        ctx.slide.addShape("ellipse", { x: I(x), y: I(lineY - 9), w: I(18), h: I(18), fill: { color: theme.accent }, line: { color: theme.bg, width: 3 } })
        text(ctx, step.label, { x, y: lineY - 52, w: stepW, h: 26 }, { role: "label", size: 11.5, bold: true, color: theme.accent, dense: false })
        text(ctx, step.title, { x, y: lineY + 34, w: stepW - 8, h: 70 }, stepTitle)
        if (step.body) text(ctx, step.body, { x, y: lineY + 112, w: stepW - 12, h: BODY_BOTTOM - lineY - 100 }, stepBody)
      })
      return
    }

    case "comparison": {
      heading(ctx, slide, slide.title)
      const fontSize = Math.max(10, Math.min(17, 17 - Math.max(0, slide.rows.length - 3) * 1.2) * densityScale(ctx))
      const cell = (value: string, options: Record<string, unknown> = {}) => ({
        text: value,
        options: { fontFace: theme.pptxBodyFont, fontSize, color: theme.text, valign: "middle", margin: [4, 8, 4, 8], ...options },
      })
      const rows = [
        [cell(""), cell(slide.columns[0].toLocaleUpperCase(), { bold: true, color: theme.muted, fontSize: fontSize - 2 }), cell(slide.columns[1].toLocaleUpperCase(), { bold: true, color: theme.accent, fontSize: fontSize - 2 })],
        ...slide.rows.map((row) => [cell(row.label, { bold: true, color: theme.muted }), cell(row.values[0]), cell(row.values[1], { bold: true })]),
      ]
      const tableH = Math.min(BODY_BOTTOM - BODY_TOP - (slide.verdict ? 70 : 0), 62 * rows.length)
      ctx.slide.addTable(rows, {
        x: I(PAD), y: I(BODY_TOP), w: I(contentW), colW: [I(contentW * 0.26), I(contentW * 0.37), I(contentW * 0.37)],
        rowH: I(tableH / rows.length),
        border: { type: "solid", color: theme.border, pt: 0.75 },
        fill: { color: theme.dark ? theme.surface : theme.bg, transparency: theme.surfaceStyle === "glass" ? 40 : 0 },
      })
      if (slide.verdict) {
        accentRule(ctx, PAD, BODY_TOP + tableH + 40, 28, 3)
        text(ctx, slide.verdict, { x: PAD + 42, y: BODY_TOP + tableH + 24, w: contentW - 42, h: 50 }, { size: PT(22), min: 10, bold: true, color: theme.text })
      }
      return
    }

    case "chart": {
      heading(ctx, slide, slide.title)
      let top = BODY_TOP
      if (slide.unit) {
        text(ctx, slide.unit, { x: PAD, y: top - 24, w: 600, h: 24 }, { size: 12.5, min: 9 })
        top += 6
      }
      const chartW = slide.takeaway ? contentW - 348 : contentW
      // 2.1 must not be labelled "2": keep one decimal whenever the data has one.
      const format = slide.data.some((d) => !Number.isInteger(d.value)) ? "#,##0.0" : "#,##0"
      ctx.slide.addChart("bar", [{
        name: slide.unit || slide.title,
        labels: slide.data.map((d) => d.label),
        values: slide.data.map((d) => d.value),
      }], {
        x: I(PAD), y: I(top), w: I(chartW), h: I(BODY_BOTTOM + 30 - top),
        barDir: "col",
        chartColors: [theme.series[0]],
        catAxisLabelColor: theme.muted,
        valAxisLabelColor: theme.muted,
        catAxisLabelFontFace: theme.pptxBodyFont,
        valAxisLabelFontFace: theme.pptxBodyFont,
        catAxisLabelFontSize: 11,
        valAxisLabelFontSize: 10,
        catAxisLineShow: false,
        valAxisLineShow: false,
        valGridLine: { color: theme.border, style: "solid", size: 0.5 },
        showValue: true,
        dataLabelFormatCode: format,
        valAxisLabelFormatCode: format,
        dataLabelColor: theme.text,
        dataLabelFontSize: 11,
        dataLabelPosition: "outEnd",
        barGapWidthPct: 60,
        showLegend: false,
      })
      if (slide.takeaway) {
        ctx.slide.addShape("rect", { x: I(PAD + chartW + 48), y: I(top + 8), w: I(3), h: I(150), fill: { color: theme.accent }, line: { color: theme.accent, width: 0 } })
        text(ctx, slide.takeaway, { x: PAD + chartW + 72, y: top, w: contentW - chartW - 72, h: BODY_BOTTOM - top }, { role: "heading", size: PT(25), min: 11, color: theme.text })
      }
      return
    }

    case "closing": {
      accentRule(ctx, CANVAS_W / 2 - 36, 190)
      text(ctx, slide.title, { x: 110, y: 222, w: CANVAS_W - 220, h: 220 }, { role: "heading", size: PT(upper ? 62 : 76) * headlineScale(slide), min: 20, align: "center", valign: "middle", upper, dense: false })
      if (slide.subtitle) text(ctx, slide.subtitle, { x: 190, y: 456, w: CANVAS_W - 380, h: 96 }, { size: PT(26), min: 11, align: "center" })
      if (slide.contact) {
        const w = Math.min(640, Math.max(220, slide.contact.length * 12 + 60))
        ctx.slide.addShape("roundRect", { x: I(CANVAS_W / 2 - w / 2), y: I(574), w: I(w), h: I(48), rectRadius: I(24), fill: { color: theme.bg, transparency: 100 }, line: { color: theme.border, width: 1 } })
        text(ctx, slide.contact, { x: CANVAS_W / 2 - w / 2 + 16, y: 586, w: w - 32, h: 26 }, { size: 15, min: 9, bold: true, color: theme.accent, align: "center", dense: false })
      }
      return
    }

    case "features": {
      heading(ctx, slide, slide.title)
      const count = slide.items.length
      const columns = count === 4 ? 2 : 3
      const rows = Math.ceil(count / columns)
      const gap = 22
      let top = BODY_TOP
      if (slide.intro) {
        text(ctx, slide.intro, { x: PAD, y: top - 18, w: 1000, h: 48 }, { size: PT(22), min: 10 })
        top += 40
      }
      const cardW = (contentW - gap * (columns - 1)) / columns
      const cardH = (BODY_BOTTOM + 10 - top - gap * (rows - 1)) / rows
      const compact = rows > 1
      const featurePad = inset(ctx, compact ? 24 : 32)
      const featureIcon = compact ? 54 : 70
      const featureTitle = uniform(ctx, slide.items.map((f) => f.title), { w: cardW - featurePad.x * 2, h: compact ? 34 : 44 }, { role: "heading", size: PT(compact ? 23 : 27), min: 10, color: theme.text })
      const featureBody = uniform(ctx, slide.items.map((f) => f.body), { w: cardW - featurePad.x * 2, h: Math.max(30, cardH - featurePad.top - featureIcon - 18 - (compact ? 40 : 52) - 16) }, { size: PT(compact ? 17 : 19), min: 8 })
      slide.items.forEach((item, i) => {
        const x = PAD + (i % columns) * (cardW + gap)
        const y = top + Math.floor(i / columns) * (cardH + gap)
        const pad = inset(ctx, compact ? 24 : 32)
        surface(ctx, { x, y, w: cardW, h: cardH })
        const accent = theme.id === "candy" ? theme.series[i % 3] : theme.accent
        const iconBox = compact ? 54 : 70
        const candy = theme.id === "candy"
        ctx.slide.addShape("roundRect", {
          x: I(x + pad.x), y: I(y + pad.top), w: I(iconBox), h: I(iconBox), rectRadius: I(Math.min(20, theme.radius || 8)),
          fill: { color: accent, transparency: candy ? 0 : 84 }, line: { color: candy ? theme.text : accent, transparency: candy ? 0 : 100, width: candy ? 1.75 : 0 },
        })
        const pad2 = iconBox * 0.24
        icon(ctx, item.icon, candy ? "FFFFFF" : accent, { x: x + pad.x + pad2, y: y + pad.top + pad2, w: iconBox - pad2 * 2, h: iconBox - pad2 * 2 })
        const textTop = y + pad.top + iconBox + 18
        text(ctx, item.title, { x: x + pad.x, y: textTop, w: cardW - pad.x * 2, h: compact ? 34 : 44 }, featureTitle)
        if (item.body) text(ctx, item.body, { x: x + pad.x, y: textTop + (compact ? 40 : 52), w: cardW - pad.x * 2, h: Math.max(30, y + cardH - textTop - (compact ? 40 : 52) - 16) }, featureBody)
      })
      return
    }

    case "process": {
      heading(ctx, slide, slide.title)
      const count = slide.steps.length
      const overlap = 22
      const stepW = (contentW + overlap * (count - 1)) / count
      const arrowH = 150
      const y = 280
      // A chevron's notch is half its height deep: the words start after it.
      const notch = arrowH / 2
      const textWOf = (i: number) => stepW - (i === 0 ? 30 : notch + 14) - notch - 6
      const processTitle = uniform(ctx, slide.steps.map((s) => s.title), { w: textWOf(1), h: arrowH - 70 }, { role: "heading", size: PT(count === 5 ? 21 : 25), min: 9, color: theme.onAccent })
      const processBody = uniform(ctx, slide.steps.map((s) => s.body), { w: stepW - 70, h: BODY_BOTTOM + 40 - (y + arrowH + 22) }, { size: PT(count === 5 ? 17 : 19), min: 8 })
      slide.steps.forEach((step, i) => {
        const x = PAD + i * (stepW - overlap)
        ctx.slide.addShape(i === 0 ? "homePlate" : "chevron", {
          x: I(x), y: I(y), w: I(stepW), h: I(arrowH),
          fill: { color: theme.accent, transparency: i % 2 ? 16 : 0 },
          line: { color: theme.accent, transparency: 100, width: 0 },
        })
        const textX = x + (i === 0 ? 30 : notch + 14)
        const textW = textWOf(i)
        text(ctx, String(i + 1).padStart(2, "0"), { x: textX, y: y + 26, w: textW, h: 20 }, { role: "label", size: 10.5, bold: true, color: theme.onAccent, dense: false })
        text(ctx, step.title, { x: textX, y: y + 52, w: textW, h: arrowH - 70 }, processTitle)
        if (step.body) text(ctx, step.body, { x: x + (i === 0 ? 16 : 40), y: y + arrowH + 22, w: stepW - 70, h: BODY_BOTTOM + 40 - (y + arrowH + 22) }, processBody)
      })
      return
    }

    case "gallery": {
      // Pictures first: everything written afterwards sits on top of them.
      const slots = gallerySlots(theme, slide.items.length, Boolean(slide.intro))
      slide.items.forEach((item, i) => photo(ctx, `${slide.id}#${i}`, slots[i], item.image?.credit))
      heading(ctx, slide, slide.title)
      if (slide.intro) text(ctx, slide.intro, { x: PAD, y: BODY_TOP - 18, w: 1000, h: 48 }, { size: PT(22), min: 10 })
      const caption = uniform(ctx, slide.items.map((item) => item.caption), { w: slots[0].box.w, h: 52 }, { role: "heading", size: PT(22), min: 9, color: theme.text })
      slide.items.forEach((item, i) => {
        const slot = slots[i]
        text(ctx, item.caption, { x: slot.box.x, y: slot.box.y + slot.box.h + 14, w: slot.box.w, h: 52 }, caption)
      })
      return
    }
  }
}

/* ------------------------------------------------------------------ build */

function composePptx(deck: Pick<Deck, "title" | "theme" | "slides">, assets: PptxAssets) {
  const theme = deckTheme(deck.theme)
  const pptx = new PptxGenJS()
  pptx.layout = "LAYOUT_WIDE"
  pptx.title = deck.title
  pptx.author = "Malik AI"
  pptx.company = "Malik AI"
  pptx.subject = deck.title
  const measure = assets.measure || estimateTextWidth

  deck.slides.forEach((slide, index) => {
    const page = pptx.addSlide()
    const art = assets.backdrops?.get(slide.id)
    // The background art is the slide background itself: it cannot be
    // dragged around by accident and every app draws it under the content.
    page.background = art ? { data: art.replace(/^data:/, ""), path: `art.${/^data:image\/png/.test(art) ? "png" : "jpeg"}` } : { color: theme.bg }
    const ctx: Ctx = { slide: page, theme, density: slideDensity(slide), index, total: deck.slides.length, assets, measure }
    drawSlide(ctx, slide)
    if (slide.layout !== "title" && slide.layout !== "closing" && slide.layout !== "hero") pageNumber(ctx)
    if (slide.notes) page.addNotes(slide.notes)
  })
  return pptx
}

function normaliseAssets(input?: Map<string, string> | PptxAssets): PptxAssets {
  if (!input) return {}
  if (input instanceof Map) return { images: input }
  return input
}

/**
 * Builds the file in Node. `assets` holds pictures the caller has already
 * fetched and rasterised (or a plain map of photo data URLs, the older form);
 * this module never touches the network and can run entirely offline.
 */
export async function buildPptx(deck: Pick<Deck, "title" | "theme" | "slides">, assets?: Map<string, string> | PptxAssets): Promise<Buffer> {
  const output = await composePptx(deck, normaliseAssets(assets)).write({ outputType: "nodebuffer" })
  return Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer)
}

/** Builds the file in the browser. */
export async function buildPptxBlob(deck: Pick<Deck, "title" | "theme" | "slides">, assets: PptxAssets): Promise<Blob> {
  return (await composePptx(deck, assets).write({ outputType: "blob" })) as Blob
}

/* ------------------------------------------------------------------ icons */

/**
 * An icon component as SVG text. Next.js does not allow react-dom/server in
 * a route, and an icon is only an <svg> with a few paths, so the element tree
 * is walked by hand: components are called, host elements are written out.
 * The SVG is rasterised before it reaches a slide (see PptxAssets.icon).
 */
type Node = { type: unknown; props: Record<string, unknown> } | string | number | boolean | null | undefined | Node[]

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function attributeName(name: string) {
  if (name === "className") return "class"
  if (name === "viewBox" || name.startsWith("aria-") || name.startsWith("data-")) return name
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

export function svgMarkup(node: Node): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (Array.isArray(node)) return node.map(svgMarkup).join("")
  if (typeof node === "string" || typeof node === "number") return escapeXml(String(node))
  const { type, props } = node
  if (typeof type === "string") {
    const attributes = Object.entries(props)
      .filter(([name, value]) => !["children", "ref", "key"].includes(name) && value !== null && value !== undefined && value !== false && ["string", "number"].includes(typeof value))
      .map(([name, value]) => ` ${attributeName(name)}="${escapeXml(String(value))}"`)
      .join("")
    return `<${type}${attributes}>${svgMarkup(props.children as Node)}</${type}>`
  }
  if (type && typeof type === "object" && typeof (type as { render?: unknown }).render === "function") {
    return svgMarkup((type as { render: (props: unknown, ref: null) => Node }).render(props, null))
  }
  if (typeof type === "function") return svgMarkup((type as (props: unknown) => Node)(props))
  return ""
}

/** A feature icon as standalone SVG markup, ready to be rasterised. */
export function iconSvg(name: DeckIconName, color: string, size = 96) {
  const Icon = DECK_ICONS[name] || DECK_ICONS.sparkles
  const svg = svgMarkup(createElement(Icon, { size, color: `#${color}`, strokeWidth: 1.8 }) as unknown as Node)
  return svg.includes("xmlns=") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
}

/** Every icon a deck needs, as [name, colour] pairs, so they can be rasterised up front. */
export function deckIcons(deck: Pick<Deck, "theme" | "slides">): Array<[DeckIconName, string]> {
  const theme = deckTheme(deck.theme)
  const seen = new Map<string, [DeckIconName, string]>()
  for (const slide of deck.slides) {
    if (slide.layout !== "features") continue
    slide.items.forEach((item, i) => {
      void i
      const color = theme.id === "candy" ? "FFFFFF" : theme.accent
      seen.set(`${item.icon}:${color}`, [item.icon, color])
    })
  }
  return [...seen.values()]
}

/** A filename that survives every operating system and every download bar. */
export function pptxFileName(title: string) {
  // NFC, not NFKD: decomposing turns "й" into "и" plus a combining mark, and
  // stripping the mark then quietly renames "Кофейня" to "Кофеиня".
  const base = String(title || "presentation")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
  return `${base || "presentation"}.pptx`
}
