import { inflateRawSync } from "node:zlib"

/**
 * Reads the first worksheet of an .xlsx file into rows of strings.
 *
 * An .xlsx is a zip of XML files; this reads the zip's central directory,
 * inflates the three parts it needs (workbook, shared strings, first sheet)
 * and walks the cells. No dependency, no macros, no formulas evaluated —
 * the cached values Excel stored are what is read.
 */

const MAX_ENTRY_BYTES = 40 * 1024 * 1024

type Entry = { name: string; method: number; compressedSize: number; size: number; offset: number }

function entries(buffer: Buffer): Map<string, Entry> {
  // End of central directory: signature 0x06054b50, within the last 64 KB.
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error("XLSX_NOT_A_ZIP")
  const count = buffer.readUInt16LE(end + 10)
  let pointer = buffer.readUInt32LE(end + 16)
  const found = new Map<string, Entry>()
  for (let index = 0; index < count && pointer + 46 <= buffer.length; index += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) break
    const method = buffer.readUInt16LE(pointer + 10)
    const compressedSize = buffer.readUInt32LE(pointer + 20)
    const size = buffer.readUInt32LE(pointer + 24)
    const nameLength = buffer.readUInt16LE(pointer + 28)
    const extraLength = buffer.readUInt16LE(pointer + 30)
    const commentLength = buffer.readUInt16LE(pointer + 32)
    const offset = buffer.readUInt32LE(pointer + 42)
    const name = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString("utf8")
    found.set(name, { name, method, compressedSize, size, offset })
    pointer += 46 + nameLength + extraLength + commentLength
  }
  return found
}

function read(buffer: Buffer, entry: Entry | undefined): string {
  if (!entry) return ""
  if (entry.size > MAX_ENTRY_BYTES) throw new Error("XLSX_TOO_LARGE")
  const local = entry.offset
  if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error("XLSX_BROKEN")
  const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
  const data = buffer.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return data.toString("utf8")
  if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }).toString("utf8")
  throw new Error("XLSX_UNSUPPORTED_COMPRESSION")
}

function decode(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
}

function textOf(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decode(match[1])).join("")
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/)?.[0] || "A"
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

function firstSheetPath(files: Map<string, Entry>, buffer: Buffer) {
  const workbook = read(buffer, files.get("xl/workbook.xml"))
  const relationships = read(buffer, files.get("xl/_rels/workbook.xml.rels"))
  const id = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1]
  if (id) {
    const target = relationships.match(new RegExp(`<Relationship\\b[^>]*Id="${id}"[^>]*Target="([^"]+)"`))?.[1]
      || relationships.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${id}"`))?.[1]
    if (target) return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`
  }
  return "xl/worksheets/sheet1.xml"
}

export function readXlsx(buffer: Buffer, limits: { rows: number; columns: number } = { rows: 50_000, columns: 60 }): string[][] {
  const files = entries(buffer)
  const shared = [...read(buffer, files.get("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textOf(match[1]))
  const sheet = read(buffer, files.get(firstSheetPath(files, buffer)))
  if (!sheet) throw new Error("XLSX_NO_SHEET")
  const rows: string[][] = []
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= limits.rows) break
    const row: string[] = []
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1]
      const body = cell[2] || ""
      const reference = attributes.match(/\br="([A-Z]+\d+)"/)?.[1]
      const column = reference ? columnIndex(reference) : row.length
      if (column >= limits.columns) continue
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] || "n"
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let value = ""
      if (type === "s") value = shared[Number(raw)] ?? ""
      else if (type === "inlineStr") value = textOf(body)
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE"
      else value = raw !== undefined ? decode(raw) : ""
      while (row.length < column) row.push("")
      row[column] = value
    }
    rows.push(row)
  }
  return rows
}
