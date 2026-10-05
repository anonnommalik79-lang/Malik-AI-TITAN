import { readFile } from "node:fs/promises"
import path from "node:path"
import fontkit from "@pdf-lib/fontkit"
import { PDFArray, PDFDocument, PDFName, PDFString, PageSizes, rgb, type PDFFont } from "pdf-lib"
import type { DocumentModel, Inline } from "./markdown"

const MARGIN = 56
const MAX_PAGES = 300
const FONT_FILES = ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf", "DejaVuSansMono.ttf"]
let fontBytes: Promise<Buffer[]> | undefined
type Run = Inline & { font: PDFFont; width: number }

/** Local fonts only. Export never downloads a link from the user's document. */
export async function buildPdf(model: DocumentModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const buffers = await (fontBytes ||= Promise.all(FONT_FILES.map((name) => readFile(path.join(process.cwd(), "assets", "fonts", name)))).catch((error) => { fontBytes = undefined; throw error }))
  // These files are already subsetted. A second subset loses composite italic glyphs.
  const fonts = await Promise.all(buffers.map((bytes) => pdf.embedFont(bytes, { subset: false })))
  const glyphs = fonts.map((font) => new Set(font.getCharacterSet()))
  const [width, height] = PageSizes.A4
  let page = pdf.addPage(PageSizes.A4)
  let y = height - MARGIN
  const nextPage = () => {
    if (pdf.getPageCount() >= MAX_PAGES) throw new Error("Документ превышает лимит 300 страниц.")
    page = pdf.addPage(PageSizes.A4)
    y = height - MARGIN
  }
  const ensure = (space: number) => { if (y - space < MARGIN) nextPage() }
  const fontIndex = (run: Inline) => run.code ? 3 : run.bold ? 1 : run.italic ? 2 : 0
  const clean = (text: string, index: number) => [...text].map((char) => glyphs[index].has(char.codePointAt(0)!) ? char : char === "\t" ? "    " : "?").join("")
  function wrap(inlines: Inline[], size: number, maxWidth: number): Run[][] {
    const lines: Run[][] = [[]]
    let used = 0
    for (const inline of inlines) {
      const index = fontIndex(inline)
      const font = fonts[index]
      for (const token of inline.text.split(/(\n|\s+)/)) {
        if (!token) continue
        if (token.includes("\n")) { lines.push([]); used = 0; continue }
        const text = clean(token, index)
        const tokenWidth = font.widthOfTextAtSize(text, size)
        if (used && used + tokenWidth > maxWidth) { lines.push([]); used = 0 }
        if (!used && /^\s+$/.test(text)) continue
        if (tokenWidth <= maxWidth) {
          lines[lines.length - 1].push({ ...inline, text, font, width: tokenWidth }); used += tokenWidth
        } else {
          // An unbroken URL/code identifier still wraps without clipping a page.
          for (const char of text) {
            const cw = font.widthOfTextAtSize(char, size)
            if (used && used + cw > maxWidth) { lines.push([]); used = 0 }
            lines[lines.length - 1].push({ ...inline, text: char, font, width: cw }); used += cw
          }
        }
      }
    }
    return lines
  }
  function paintLine(line: Run[], x: number, top: number, size: number) {
    for (const run of line) {
      page.drawText(run.text, { x, y: top - size, size, font: run.font, color: rgb(0, 0, 0) })
      if (run.link && /^(https?:|mailto:)/i.test(run.link)) {
        const annotation = pdf.context.register(pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [x, top - size - 2, x + run.width, top + 2], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(run.link) } }))
        let annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray)
        if (!annots) { annots = pdf.context.obj([]); page.node.set(PDFName.of("Annots"), annots) }
        annots.push(annotation)
      }
      x += run.width
    }
  }
  function paragraph(inlines: Inline[], size = 11, indent = 0, background = false) {
    const leading = size * 1.45
    for (const line of wrap(inlines, size, width - MARGIN * 2 - indent - (background ? 16 : 0))) {
      ensure(leading)
      if (background) page.drawRectangle({ x: MARGIN + indent, y: y - leading, width: width - MARGIN * 2 - indent, height: leading, color: rgb(.94, .94, .94) })
      paintLine(line, MARGIN + indent + (background ? 8 : 0), y - (background ? 2 : 0), size)
      y -= leading
    }
    y -= 8
  }
  for (const block of model.blocks) {
    if (block.type === "heading") {
      const size = [22, 18, 15, 13][Math.min(3, block.level - 1)]
      ensure(size * 1.45 + 35)
      y -= 8
      paragraph(block.inlines.map((run) => ({ ...run, bold: true })), size)
    } else if (block.type === "paragraph") paragraph(block.inlines)
    else if (block.type === "quote") paragraph(block.inlines.map((run) => ({ ...run, italic: true })), 11, 18)
    else if (block.type === "code") paragraph([{ text: block.text, code: true }], 9, 0, true)
    else if (block.type === "list") block.items.forEach((item, index) => paragraph([{ text: block.ordered ? `${block.start + index}. ` : "• " }, ...item.inlines], 11, Math.min(item.level, 8) * 14))
    else if (block.type === "rule") { ensure(18); page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: .5, color: rgb(.75, .75, .75) }); y -= 18 }
    else if (block.type === "table") {
      const columns = block.header.length
      if (columns > 10) {
        // Keep very wide data legible instead of shrinking 200 columns into A4.
        for (const row of block.rows) for (let index = 0; index < columns; index++) paragraph([...block.header[index].map((r) => ({ ...r, bold: true })), { text: ": " }, ...(row[index] || [])])
        continue
      }
      const cellWidth = (width - MARGIN * 2) / Math.max(1, columns)
      const size = 9
      const leading = 13
      const header = block.header.map((runs) => wrap(runs.map((run) => ({ ...run, bold: true })), size, cellWidth - 12))
      const headerHeight = Math.max(...header.map((lines) => lines.length), 1) * leading + 12
      if (headerHeight > height - 2 * MARGIN - 30) throw new Error("Заголовок таблицы слишком большой для PDF.")
      const drawRow = (cells: Run[][][], offset: number, length: number, isHeader: boolean) => {
        const rowHeight = length * leading + 12
        cells.forEach((lines, column) => {
          const x = MARGIN + column * cellWidth
          page.drawRectangle({ x, y: y - rowHeight, width: cellWidth, height: rowHeight, color: isHeader ? rgb(.92, .92, .92) : rgb(1, 1, 1), borderColor: rgb(.8, .8, .8), borderWidth: .5 })
          lines.slice(offset, offset + length).forEach((line, index) => paintLine(line, x + 6, y - 6 - index * leading, size))
        })
        y -= rowHeight
      }
      const drawHeader = () => drawRow(header, 0, Math.max(...header.map((lines) => lines.length), 1), true)
      ensure(headerHeight + 30); drawHeader()
      for (const row of block.rows) {
        const cells = block.header.map((_, index) => wrap(row[index] || [], size, cellWidth - 12))
        const count = Math.max(...cells.map((lines) => lines.length), 1)
        let offset = 0
        while (offset < count) {
          if (y - 25 < MARGIN) { nextPage(); drawHeader() }
          const available = Math.max(1, Math.floor((y - MARGIN - 12) / leading))
          const length = Math.min(available, count - offset)
          drawRow(cells, offset, length, false); offset += length
          if (offset < count) { nextPage(); drawHeader() }
        }
      }
      y -= 12
    }
  }
  const pages = pdf.getPages()
  pages.forEach((target, index) => target.drawText(`${index + 1} / ${pages.length}`, { x: width - MARGIN - 50, y: 28, size: 9, font: fonts[0], color: rgb(.4, .4, .4) }))
  pdf.setTitle(model.title)
  pdf.setAuthor("Malik AI")
  pdf.setLanguage("ru-RU")
  return pdf.save()
}
