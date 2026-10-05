import { answerCardsToText } from "@/lib/ai/answer-cards"
import { parseCsv } from "@/lib/os/data/table"
import { buildDocx } from "./docx"
import { documentModel, blocksToText, tablesOf } from "./markdown"
import { buildPdf } from "./pdf"
import { buildCsv, buildXlsx } from "./xlsx"
import { buildZip, xmlEscape } from "./zip"
import { DOCUMENT_FORMATS, type DocumentFormat } from "./formats"

export function documentFilename(title: string, format: string) {
  const name = title.normalize("NFC").replace(/[<>:"/\\|?*\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100).replace(/[. ]+$/, "") || "Документ"
  return `${name}.${format}`
}
export function documentDisposition(filename: string) { return `attachment; filename="document.${filename.split(".").pop()}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}` }
export async function exportDocument(input: { format: DocumentFormat; title: string; markdown: string; csv?: string }): Promise<{ bytes: Uint8Array; mime: string; filename: string }> {
  if (!DOCUMENT_FORMATS.includes(input.format)) throw new Error("Этот формат не поддерживается.")
  const markdown = answerCardsToText(input.markdown)
  const model = documentModel(markdown, input.title)
  const parsedCsv = input.csv === undefined ? null : parseCsv(input.csv)
  const tables = parsedCsv?.length ? [{ title: input.title, header: parsedCsv[0], rows: parsedCsv.slice(1) }] : tablesOf(model.blocks)
  const encode = (text: string) => new TextEncoder().encode(text)
  let bytes: Uint8Array
  let mime: string
  switch (input.format) {
    case "docx": bytes = buildDocx(model); mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; break
    case "pdf": bytes = await buildPdf(model); mime = "application/pdf"; break
    case "xlsx":
      if (!tables.length) throw new Error("В документе нет таблиц")
      bytes = buildXlsx(tables.map((table) => ({ name: table.title, header: table.header, rows: table.rows })), { title: input.title }); mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; break
    case "csv":
      if (!tables.length) throw new Error("В документе нет таблиц")
      bytes = encode(buildCsv(tables[0].header, tables[0].rows)); mime = "text/csv; charset=utf-8"; break
    case "md": bytes = encode(markdown); mime = "text/markdown; charset=utf-8"; break
    case "txt": bytes = encode(blocksToText(model.blocks)); mime = "text/plain; charset=utf-8"; break
    case "json": bytes = encode(JSON.stringify(model, null, 2)); mime = "application/json; charset=utf-8"; break
    case "html":
      bytes = encode(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xmlEscape(input.title)}</title><style>body{max-width:900px;margin:48px auto;padding:24px;color:#111;background:white;font:16px/1.6 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><body><h1>${xmlEscape(input.title)}</h1><pre>${xmlEscape(blocksToText(model.blocks))}</pre></body></html>`); mime = "text/html; charset=utf-8"; break
    case "zip": {
      const formats = DOCUMENT_FORMATS.filter((format) => format !== "zip" && (tables.length || !["xlsx", "csv"].includes(format)))
      const files = []
      // Serial rendering bounds memory when a long document includes a PDF.
      for (const format of formats) { const file = await exportDocument({ ...input, format }); files.push({ name: file.filename, data: file.bytes }) }
      bytes = buildZip(files); mime = "application/zip"; break
    }
  }
  return { bytes, mime, filename: documentFilename(input.title, input.format) }
}
