import { inflateRawSync } from "node:zlib"
import { crc32 } from "./zip"
import type { ExecutionContract } from "@/lib/ai/execution-contract"

/** Bounded independent ZIP reader: verify bytes, not the writer's success flag. */
export function nativePackage(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes), files = new Map<string, string>()
  let end = -1, total = 0
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break }
  if (end < 0 || buffer.length > 24 * 1024 * 1024) throw new Error("INVALID_NATIVE_PACKAGE")
  const count = buffer.readUInt16LE(end + 10)
  if (!count || count > 2000) throw new Error("INVALID_NATIVE_PACKAGE")
  let p = buffer.readUInt32LE(end + 16)
  for (let i = 0; i < count; i++) {
    if (p + 46 > buffer.length || buffer.readUInt32LE(p) !== 0x02014b50) throw new Error("INVALID_NATIVE_DIRECTORY")
    const size = buffer.readUInt32LE(p + 24), packed = buffer.readUInt32LE(p + 20), offset = buffer.readUInt32LE(p + 42), method = buffer.readUInt16LE(p + 10)
    const nameLength = buffer.readUInt16LE(p + 28), extra = buffer.readUInt16LE(p + 30), comment = buffer.readUInt16LE(p + 32)
    const name = buffer.subarray(p + 46, p + 46 + nameLength).toString("utf8")
    total += size
    if (total > 64 * 1024 * 1024 || size > 12 * 1024 * 1024 || files.has(name) || /(?:^|\/)\.\.(?:\/|$)|^\/|\\/u.test(name)) throw new Error("UNSAFE_NATIVE_PACKAGE")
    if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error("INVALID_NATIVE_ENTRY")
    if(buffer.subarray(offset+30,offset+30+buffer.readUInt16LE(offset+26)).toString("utf8")!==name)throw new Error("NATIVE_ENTRY_NAME_MISMATCH")
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28)
    if (start + packed > buffer.length) throw new Error("INVALID_NATIVE_ENTRY")
    const source = buffer.subarray(start, start + packed)
    const data = method === 0 ? source : method === 8 ? inflateRawSync(source, { maxOutputLength: 12 * 1024 * 1024 }) : null
    if (!data || data.length !== size || crc32(data) !== buffer.readUInt32LE(p + 16)) throw new Error("NATIVE_CRC_MISMATCH")
    files.set(name, /\.(?:xml|rels)$/iu.test(name) ? data.toString("utf8") : "")
    p += 46 + nameLength + extra + comment
  }
  return files
}

export function verifyNativeArtifact(bytes: Uint8Array, format: string, contract: ExecutionContract) {
  const check = { bytes: bytes.length, packageVerified: false, formulas: 0, charts: 0, sheets: 0, slides: 0, images: 0 }
  if (["xlsx", "pptx", "docx", "zip"].includes(format)) {
    const files = nativePackage(bytes)
    if (format !== "zip" && !files.has("[Content_Types].xml")) throw new Error("NATIVE_CONTENT_TYPES_MISSING")
    const parts = [...files.keys()]
    if (format === "xlsx") {
      if (!files.has("xl/workbook.xml")) throw new Error("XLSX_WORKBOOK_MISSING")
      const sheets = parts.filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).map(p => files.get(p)!)
      check.sheets = sheets.length
      check.formulas = sheets.reduce((n, xml) => n + (xml.match(/<f[ >]/g)?.length || 0), 0)
      check.charts = parts.filter(p => /^xl\/charts\/chart\d+\.xml$/.test(p)).length
      if (!check.sheets || contract.constraints.formulas && !check.formulas || contract.constraints.charts && !check.charts) throw new Error("XLSX_REQUIRED_FEATURE_MISSING")
      const months = contract.constraints.months
      if (months && !sheets.some(xml => (xml.match(/<row\s/g)?.length || 0) >= months + 1 || [...xml.matchAll(/<row\s[^>]*>[\s\S]*?<\/row>/g)].some(row => (row[0].match(/<c\s/g)?.length || 0) >= months + 1))) throw new Error("XLSX_FORECAST_HORIZON_MISSING")
    }
    if (format === "pptx") {
      if (!files.has("ppt/presentation.xml")) throw new Error("PPTX_PRESENTATION_MISSING")
      check.slides = parts.filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).length
      check.charts = parts.filter(p => /^ppt\/charts\/chart\d+\.xml$/.test(p)).length
      check.images = parts.filter(p => /^ppt\/media\//.test(p) && !/\.svg$/iu.test(p)).length
      if (!check.slides || contract.constraints.slideCount && check.slides !== contract.constraints.slideCount || contract.constraints.charts && !check.charts) throw new Error("PPTX_REQUIRED_FEATURE_MISSING")
    }
    if (format === "docx" && !files.get("word/document.xml")?.includes("w:body")) throw new Error("DOCX_BODY_MISSING")
    check.packageVerified = true
  } else if (format === "pdf" && !Buffer.from(bytes.subarray(0, 8)).toString("latin1").startsWith("%PDF-")) throw new Error("PDF_SIGNATURE_MISSING")
  if (!bytes.length) throw new Error("EMPTY_DELIVERABLE")
  return check
}
