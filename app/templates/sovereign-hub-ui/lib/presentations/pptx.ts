import PptxGenJSModule from "pptxgenjs"
import { deckTheme, type DeckTheme } from "@/lib/presentations/themes"
import type { Deck, Slide } from "@/lib/presentations/types"

/**
 * The deck as a real PowerPoint file.
 *
 * Every slide is built from native shapes, text boxes, a table and a chart —
 * not a screenshot pasted onto a slide — so the file opens in PowerPoint,
 * Keynote and Google Slides as something that can still be edited: the text
 * is text, the chart is a chart with its data inside it, and the speaker notes
 * are in the notes pane where a presenter expects them.
 *
 * The geometry mirrors the on-screen renderer (16:9, same margins, same type
 * hierarchy, same theme colours from lib/presentations/themes.ts), so what
 * was approved on screen is what gets presented.
 */

type PptxInstance = {
  layout: string
  title: string
  author: string
  company: string
  subject: string
  addSlide: () => PptxSlide
  write: (options: { outputType: "nodebuffer" }) => Promise<unknown>
}

type PptxSlide = {
  background: { color: string }
  addText: (text: unknown, options: Record<string, unknown>) => void
  addShape: (shape: string, options: Record<string, unknown>) => void
  addImage: (options: Record<string, unknown>) => void
  addTable: (rows: unknown[], options: Record<string, unknown>) => void
  addChart: (type: string, data: unknown[], options: Record<string, unknown>) => void
  addNotes: (notes: string) => void
}

const PptxGenJS = ((PptxGenJSModule as unknown as { default?: unknown }).default || PptxGenJSModule) as unknown as new () => PptxInstance

/* LAYOUT_WIDE is 13.333 × 7.5 inches. */
const SLIDE_W = 13.333
const SLIDE_H = 7.5
const M = 0.75
const CONTENT_W = SLIDE_W - M * 2
const HEAD_Y = 0.62
const HEAD_H = 1.25
const BODY_Y = 2.15
const BODY_H = SLIDE_H - BODY_Y - 0.75

type Ctx = { slide: PptxSlide; theme: DeckTheme; index: number; total: number }

function heading(ctx: Ctx, text: string, options: Record<string, unknown> = {}) {
  ctx.slide.addText(text, {
    x: M, y: HEAD_Y, w: CONTENT_W, h: HEAD_H,
    fontFace: ctx.theme.pptxHeadingFont, fontSize: 32, bold: true,
    color: ctx.theme.text, valign: "bottom", fit: "shrink", margin: 0,
    ...options,
  })
}

function body(ctx: Ctx, text: string, options: Record<string, unknown>) {
  ctx.slide.addText(text, {
    fontFace: ctx.theme.pptxBodyFont, fontSize: 16, color: ctx.theme.muted,
    valign: "top", fit: "shrink", margin: 0, lineSpacingMultiple: 1.15,
    ...options,
  })
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.slide.addShape("roundRect", {
    x, y, w, h,
    fill: { color: ctx.theme.surface },
    line: { color: ctx.theme.border, width: 0.75 },
    rectRadius: 0.12,
  })
}

function pageNumber(ctx: Ctx) {
  ctx.slide.addText(`${ctx.index + 1} / ${ctx.total}`, {
    x: SLIDE_W - M - 1.4, y: SLIDE_H - 0.55, w: 1.4, h: 0.3,
    fontFace: ctx.theme.pptxBodyFont, fontSize: 9, color: ctx.theme.muted, align: "right", margin: 0,
  })
}

function image(ctx: Ctx, data: string | undefined, x: number, y: number, w: number, h: number) {
  if (!data) {
    // No picture was generated: a quiet panel keeps the composition instead
    // of leaving a hole where the image was designed to be.
    panel(ctx, x, y, w, h)
    return
  }
  ctx.slide.addImage({ data, x, y, w, h, sizing: { type: "cover", w, h } })
}

/* ---------------------------------------------------------------- layouts */

function drawSlide(ctx: Ctx, slide: Slide, imageData: string | undefined) {
  const { theme } = ctx

  switch (slide.layout) {
    case "title": {
      const hasImage = Boolean(imageData)
      const textW = hasImage ? 6.2 : CONTENT_W
      if (hasImage) image(ctx, imageData, SLIDE_W - 6.2, 0, 6.2, SLIDE_H)
      if (slide.kicker) {
        ctx.slide.addText(slide.kicker.toUpperCase(), {
          x: M, y: 2.0, w: textW - 0.4, h: 0.4, fontFace: theme.pptxBodyFont, fontSize: 13, bold: true,
          color: theme.accent, charSpacing: 3, margin: 0,
        })
      }
      ctx.slide.addText(slide.title, {
        x: M, y: 2.45, w: textW - 0.4, h: 2.4, fontFace: theme.pptxHeadingFont, fontSize: hasImage ? 44 : 54, bold: true,
        color: theme.text, valign: "top", fit: "shrink", margin: 0, lineSpacingMultiple: 0.95,
      })
      if (slide.subtitle) body(ctx, slide.subtitle, { x: M, y: 5.0, w: textW - 0.6, h: 1.3, fontSize: 19 })
      return
    }

    case "section": {
      if (slide.number) {
        ctx.slide.addText(slide.number, {
          x: M, y: 1.6, w: 4, h: 1.6, fontFace: theme.pptxHeadingFont, fontSize: 96, bold: true, color: theme.accent, margin: 0,
        })
      }
      ctx.slide.addText(slide.title, {
        x: M, y: 3.3, w: CONTENT_W, h: 1.6, fontFace: theme.pptxHeadingFont, fontSize: 46, bold: true,
        color: theme.text, valign: "top", fit: "shrink", margin: 0,
      })
      if (slide.subtitle) body(ctx, slide.subtitle, { x: M, y: 5.0, w: CONTENT_W * 0.75, h: 1.2, fontSize: 19 })
      return
    }

    case "bullets": {
      heading(ctx, slide.title)
      let y = BODY_Y
      if (slide.intro) {
        body(ctx, slide.intro, { x: M, y, w: CONTENT_W, h: 0.6, fontSize: 17 })
        y += 0.75
      }
      const rowH = Math.min(1.2, (SLIDE_H - 0.8 - y) / slide.points.length)
      slide.points.forEach((point, i) => {
        const top = y + i * rowH
        ctx.slide.addShape("line", { x: M, y: top, w: CONTENT_W, h: 0, line: { color: theme.border, width: 0.75 } })
        ctx.slide.addText(String(i + 1).padStart(2, "0"), {
          x: M, y: top + 0.14, w: 0.7, h: 0.4, fontFace: theme.pptxBodyFont, fontSize: 13, bold: true, color: theme.accent, margin: 0,
        })
        ctx.slide.addText(point.title, {
          x: M + 0.8, y: top + 0.1, w: 4.4, h: rowH - 0.2, fontFace: theme.pptxHeadingFont, fontSize: 19, bold: true,
          color: theme.text, valign: "top", fit: "shrink", margin: 0,
        })
        if (point.body) body(ctx, point.body, { x: M + 5.4, y: top + 0.12, w: CONTENT_W - 5.4, h: rowH - 0.22, fontSize: 15 })
      })
      return
    }

    case "two-column": {
      heading(ctx, slide.title)
      const gap = 0.35
      const colW = (CONTENT_W - gap) / 2
      ;[slide.left, slide.right].forEach((column, i) => {
        const x = M + i * (colW + gap)
        panel(ctx, x, BODY_Y, colW, BODY_H)
        ctx.slide.addText(column.heading, {
          x: x + 0.35, y: BODY_Y + 0.3, w: colW - 0.7, h: 0.5, fontFace: theme.pptxHeadingFont, fontSize: 20, bold: true,
          color: i === 0 ? theme.muted : theme.accent, margin: 0,
        })
        ctx.slide.addText(column.points.map((point) => ({ text: point, options: { bullet: { indent: 16 }, breakLine: true } })), {
          x: x + 0.35, y: BODY_Y + 0.95, w: colW - 0.7, h: BODY_H - 1.25, fontFace: theme.pptxBodyFont, fontSize: 16,
          color: theme.text, valign: "top", fit: "shrink", margin: 0, paraSpaceAfter: 8, lineSpacingMultiple: 1.1,
        })
      })
      return
    }

    case "stat": {
      heading(ctx, slide.title)
      const count = slide.stats.length
      const gap = 0.35
      const cellW = (CONTENT_W - gap * (count - 1)) / count
      // One size for the whole row, set by the longest value, so "≈3 200"
      // never wraps onto two lines and the numbers still line up.
      const longest = Math.max(...slide.stats.map((stat) => stat.value.length))
      const valueSize = Math.min(count === 1 ? 110 : 76, Math.floor((cellW * 72) / (Math.max(longest, 2) * 0.68)))
      slide.stats.forEach((stat, i) => {
        const x = M + i * (cellW + gap)
        ctx.slide.addShape("line", { x, y: BODY_Y + 0.2, w: cellW, h: 0, line: { color: theme.accent, width: 2 } })
        ctx.slide.addText(stat.value.replace(/ /g, "\u00a0"), {
          x, y: BODY_Y + 0.45, w: cellW, h: 1.8, fontFace: theme.pptxHeadingFont, fontSize: valueSize, bold: true,
          color: theme.accent, valign: "top", fit: "shrink", margin: 0,
        })
        body(ctx, stat.label, { x, y: BODY_Y + 2.35, w: cellW, h: 1.1, fontSize: 17, color: theme.text })
      })
      if (slide.context) body(ctx, slide.context, { x: M, y: SLIDE_H - 1.35, w: CONTENT_W, h: 0.6, fontSize: 13 })
      return
    }

    case "quote": {
      ctx.slide.addText("“", {
        x: M, y: 0.7, w: 2, h: 1.8, fontFace: theme.pptxHeadingFont, fontSize: 150, bold: true, color: theme.accent, margin: 0,
      })
      ctx.slide.addText(slide.quote, {
        x: M + 0.2, y: 2.1, w: CONTENT_W - 0.4, h: 3.1, fontFace: theme.pptxHeadingFont, fontSize: 32,
        color: theme.text, valign: "top", fit: "shrink", margin: 0, lineSpacingMultiple: 1.1,
      })
      if (slide.author) {
        ctx.slide.addText([
          { text: slide.author, options: { bold: true, color: theme.text, breakLine: Boolean(slide.role) } },
          ...(slide.role ? [{ text: slide.role, options: { color: theme.muted } }] : []),
        ], { x: M + 0.2, y: 5.5, w: CONTENT_W - 0.4, h: 1, fontFace: theme.pptxBodyFont, fontSize: 16, margin: 0 })
      }
      return
    }

    case "image-text": {
      const imgW = 5.6
      const onLeft = slide.imageSide === "left"
      const textX = onLeft ? imgW + 0.6 : M
      const textW = SLIDE_W - imgW - 0.6 - M
      image(ctx, imageData, onLeft ? 0 : SLIDE_W - imgW, 0, imgW, SLIDE_H)
      ctx.slide.addText(slide.title, {
        x: textX, y: 1.2, w: textW, h: 1.6, fontFace: theme.pptxHeadingFont, fontSize: 32, bold: true,
        color: theme.text, valign: "bottom", fit: "shrink", margin: 0,
      })
      let y = 3.05
      if (slide.body) {
        body(ctx, slide.body, { x: textX, y, w: textW, h: 1.5, fontSize: 16 })
        y += 1.6
      }
      if (slide.points.length) {
        ctx.slide.addText(slide.points.map((point) => ({ text: point, options: { bullet: { indent: 16 }, breakLine: true } })), {
          x: textX, y, w: textW, h: SLIDE_H - y - 0.7, fontFace: theme.pptxBodyFont, fontSize: 15,
          color: theme.text, valign: "top", fit: "shrink", margin: 0, paraSpaceAfter: 6,
        })
      }
      return
    }

    case "cards": {
      heading(ctx, slide.title)
      const count = slide.cards.length
      const gap = 0.3
      const cardW = (CONTENT_W - gap * (count - 1)) / count
      slide.cards.forEach((card, i) => {
        const x = M + i * (cardW + gap)
        panel(ctx, x, BODY_Y, cardW, BODY_H)
        ctx.slide.addText(String(i + 1).padStart(2, "0"), {
          x: x + 0.3, y: BODY_Y + 0.3, w: 1, h: 0.4, fontFace: theme.pptxBodyFont, fontSize: 13, bold: true, color: theme.accent, margin: 0,
        })
        ctx.slide.addText(card.title, {
          x: x + 0.3, y: BODY_Y + 0.9, w: cardW - 0.6, h: 1.1, fontFace: theme.pptxHeadingFont, fontSize: 19, bold: true,
          color: theme.text, valign: "top", fit: "shrink", margin: 0,
        })
        if (card.body) body(ctx, card.body, { x: x + 0.3, y: BODY_Y + 1.75, w: cardW - 0.6, h: BODY_H - 2.05, fontSize: 14 })
      })
      return
    }

    case "timeline": {
      heading(ctx, slide.title)
      const count = slide.steps.length
      const stepW = CONTENT_W / count
      const lineY = BODY_Y + 0.55
      ctx.slide.addShape("line", { x: M, y: lineY, w: CONTENT_W, h: 0, line: { color: theme.border, width: 1.5 } })
      slide.steps.forEach((step, i) => {
        const x = M + i * stepW
        ctx.slide.addShape("ellipse", { x: x, y: lineY - 0.11, w: 0.22, h: 0.22, fill: { color: theme.accent }, line: { color: theme.accent, width: 0 } })
        ctx.slide.addText(step.label, {
          x, y: BODY_Y - 0.05, w: stepW - 0.25, h: 0.4, fontFace: theme.pptxBodyFont, fontSize: 12, bold: true, color: theme.accent, margin: 0,
        })
        ctx.slide.addText(step.title, {
          x, y: lineY + 0.4, w: stepW - 0.3, h: 0.95, fontFace: theme.pptxHeadingFont, fontSize: 17, bold: true,
          color: theme.text, valign: "top", fit: "shrink", margin: 0,
        })
        if (step.body) body(ctx, step.body, { x, y: lineY + 1.15, w: stepW - 0.3, h: 2.2, fontSize: 13 })
      })
      return
    }

    case "comparison": {
      heading(ctx, slide.title)
      const cell = (text: string, options: Record<string, unknown> = {}) => ({
        text,
        options: { fontFace: theme.pptxBodyFont, fontSize: 14, color: theme.text, valign: "middle", margin: 0.08, ...options },
      })
      const rows = [
        [cell(""), cell(slide.columns[0], { bold: true, color: theme.muted }), cell(slide.columns[1], { bold: true, color: theme.accent })],
        ...slide.rows.map((row) => [cell(row.label, { bold: true, color: theme.muted }), cell(row.values[0]), cell(row.values[1])]),
      ]
      const tableH = Math.min(BODY_H - (slide.verdict ? 0.8 : 0), 0.62 * rows.length)
      ctx.slide.addTable(rows, {
        x: M, y: BODY_Y, w: CONTENT_W, colW: [CONTENT_W * 0.28, CONTENT_W * 0.36, CONTENT_W * 0.36],
        rowH: tableH / rows.length,
        border: { type: "solid", color: theme.border, pt: 0.75 },
        fill: { color: theme.bg },
      })
      if (slide.verdict) {
        body(ctx, slide.verdict, { x: M, y: BODY_Y + tableH + 0.25, w: CONTENT_W, h: 0.6, fontSize: 16, color: theme.text, bold: true })
      }
      return
    }

    case "chart": {
      heading(ctx, slide.title)
      const chartW = slide.takeaway ? CONTENT_W * 0.66 : CONTENT_W
      // 2.1 must not be labelled "2": keep one decimal whenever the data has one.
      const format = slide.data.some((d) => !Number.isInteger(d.value)) ? "#,##0.0" : "#,##0"
      ctx.slide.addChart("bar", [{
        name: slide.unit || slide.title,
        labels: slide.data.map((d) => d.label),
        values: slide.data.map((d) => d.value),
      }], {
        x: M, y: BODY_Y, w: chartW, h: BODY_H,
        barDir: "col",
        chartColors: [theme.series[0]],
        catAxisLabelColor: theme.muted,
        valAxisLabelColor: theme.muted,
        catAxisLabelFontFace: theme.pptxBodyFont,
        valAxisLabelFontFace: theme.pptxBodyFont,
        catAxisLabelFontSize: 12,
        valAxisLabelFontSize: 11,
        catAxisLineShow: false,
        valAxisLineShow: false,
        valGridLine: { color: theme.border, style: "solid", size: 0.5 },
        showValue: true,
        dataLabelFormatCode: format,
        valAxisLabelFormatCode: format,
        dataLabelColor: theme.text,
        dataLabelFontSize: 12,
        dataLabelPosition: "outEnd",
        barGapWidthPct: 60,
        showLegend: false,
      })
      if (slide.takeaway) {
        ctx.slide.addShape("line", { x: M + chartW + 0.4, y: BODY_Y + 0.2, w: 0, h: 1.6, line: { color: theme.accent, width: 2 } })
        body(ctx, slide.takeaway, { x: M + chartW + 0.6, y: BODY_Y + 0.15, w: CONTENT_W - chartW - 0.6, h: BODY_H - 0.3, fontSize: 18, color: theme.text })
      }
      return
    }

    case "closing": {
      ctx.slide.addText(slide.title, {
        x: M, y: 2.0, w: CONTENT_W, h: 2.3, fontFace: theme.pptxHeadingFont, fontSize: 50, bold: true,
        color: theme.text, align: "center", valign: "middle", fit: "shrink", margin: 0,
      })
      if (slide.subtitle) body(ctx, slide.subtitle, { x: M + 1.5, y: 4.4, w: CONTENT_W - 3, h: 1.1, fontSize: 19, align: "center" })
      if (slide.contact) {
        ctx.slide.addText(slide.contact, {
          x: M, y: 5.7, w: CONTENT_W, h: 0.5, fontFace: theme.pptxBodyFont, fontSize: 16, bold: true,
          color: theme.accent, align: "center", margin: 0,
        })
      }
      return
    }
  }
}

/**
 * Builds the file. `images` maps a slide id to a data URL; the caller is
 * responsible for fetching pictures, so this module never touches the network
 * and can be exercised entirely offline.
 */
export async function buildPptx(deck: Pick<Deck, "title" | "theme" | "slides">, images: Map<string, string> = new Map()): Promise<Buffer> {
  const theme = deckTheme(deck.theme)
  const pptx = new PptxGenJS()
  pptx.layout = "LAYOUT_WIDE"
  pptx.title = deck.title
  pptx.author = "Malik AI"
  pptx.company = "Sovereign Hub"
  pptx.subject = deck.title

  deck.slides.forEach((slide, index) => {
    const pageSlide = pptx.addSlide()
    pageSlide.background = { color: theme.bg }
    const ctx: Ctx = { slide: pageSlide, theme, index, total: deck.slides.length }
    drawSlide(ctx, slide, images.get(slide.id))
    if (slide.layout !== "title" && slide.layout !== "closing") pageNumber(ctx)
    if (slide.notes) pageSlide.addNotes(slide.notes)
  })

  const output = await pptx.write({ outputType: "nodebuffer" })
  return Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer)
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
