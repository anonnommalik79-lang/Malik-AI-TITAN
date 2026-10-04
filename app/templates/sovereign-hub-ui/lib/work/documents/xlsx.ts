import { buildZip, xmlEscape } from "./zip"

/**
 * XLSX writer: a real SpreadsheetML workbook, one sheet per table. Numbers
 * are stored as numbers (so formulas and sorting work), percentages as
 * percentages, the header row is bold and frozen, columns are sized to
 * their content. Inline strings — no shared-strings table to get wrong.
 */

export type Sheet = { name: string; header: string[]; rows: string[][] }

type Cell = { kind: "number"; value: number; percent?: boolean } | { kind: "text"; value: string }

/** «1 234,5» «1,234.5» «12%» «−7» → numbers; anything else stays text. */
export function parseCell(raw: string): Cell {
  const text = String(raw ?? "").replace(/[  ]/g, " ").trim()
  if (!text) return { kind: "text", value: "" }
  const minus = text.replace(/^[−–]/, "-")
  const percent = /%$/.test(minus)
  const body = minus.replace(/%$/, "").trim()
  let normalized: string | null = null
  if (/^-?\d+(?:\.\d+)?$/.test(body)) normalized = body
  else if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(body)) normalized = body.replace(/,/g, "")
  else if (/^-?\d{1,3}(?: \d{3})+(?:[.,]\d+)?$/.test(body)) normalized = body.replace(/ /g, "").replace(",", ".")
  else if (/^-?\d+,\d+$/.test(body)) normalized = body.replace(",", ".")
  // Leading zeros are codes (postcodes, IDs), not numbers.
  if (normalized === null || /^-?0\d/.test(normalized) || normalized.replace(/[-.]/g, "").length > 15) return { kind: "text", value: text }
  const value = Number(normalized)
  if (!Number.isFinite(value)) return { kind: "text", value: text }
  return percent ? { kind: "number", value: value / 100, percent: true } : { kind: "number", value }
}

function columnName(index: number) {
  let name = ""
  let n = index + 1
  while (n > 0) {
    const rest = (n - 1) % 26
    name = String.fromCharCode(65 + rest) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

export function sheetName(value: string, used: Set<string>) {
  const base = (String(value || "Лист").replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() || "Лист").slice(0, 28)
  let name = base
  for (let index = 2; used.has(name.toLowerCase()); index += 1) name = `${base.slice(0, 26)} ${index}`
  used.add(name.toLowerCase())
  return name
}

const MAX_ROWS = 50_000
const MAX_COLUMNS = 200

function sheetXml(sheet: Sheet) {
  const columns = Math.min(MAX_COLUMNS, Math.max(sheet.header.length, ...sheet.rows.map((row) => row.length), 1))
  const rows = [sheet.header, ...sheet.rows.slice(0, MAX_ROWS)]
  const widths = new Array(columns).fill(8)
  const xmlRows = rows.map((row, rowIndex) => {
    const cells: string[] = []
    for (let column = 0; column < columns; column += 1) {
      const raw = String(row[column] ?? "")
      const ref = `${columnName(column)}${rowIndex + 1}`
      widths[column] = Math.min(60, Math.max(widths[column], [...raw].length + 2))
      if (!raw) continue
      if (rowIndex === 0) { cells.push(`<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${xmlEscape(raw)}</t></is></c>`); continue }
      const cell = parseCell(raw)
      if (cell.kind === "number") cells.push(`<c r="${ref}"${cell.percent ? ' s="2"' : ""}><v>${cell.value}</v></c>`)
      else cells.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.value.slice(0, 32_000))}</t></is></c>`)
    }
    return `<row r="${rowIndex + 1}">${cells.join("")}</row>`
  }).join("")
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")
  const lastRef = `${columnName(columns - 1)}${rows.length}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${lastRef}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${xmlRows}</sheetData><autoFilter ref="A1:${lastRef}"/></worksheet>`
}

export function buildXlsx(sheets: Sheet[], options: { title?: string; createdAt?: Date } = {}): Uint8Array {
  if (!sheets.length) throw new Error("no sheets")
  const used = new Set<string>()
  const named = sheets.slice(0, 50).map((sheet) => ({ ...sheet, name: sheetName(sheet.name, used) }))
  const created = (options.createdAt || new Date()).toISOString().replace(/\.\d{3}Z$/, "Z")
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(options.title || named[0].name)}</dc:title><dc:creator>Malik AI</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>` },
    { name: "docProps/app.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Malik AI</Application></Properties>' },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${named.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>${named.map((sheet, index) => `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">'${xmlEscape(sheet.name.replace(/'/g, "''"))}'!$A$1:$${columnName(Math.max(sheet.header.length, ...sheet.rows.map((row) => row.length), 1) - 1)}$${Math.min(sheet.rows.length, MAX_ROWS) + 1}</definedName></definedNames>`).slice(0, 0).join("")}</workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFA6A6A6"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    ...named.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheetXml(sheet) })),
  ]
  return buildZip(files)
}

/** CSV with a BOM so Excel opens Cyrillic correctly. */
export function buildCsv(header: string[], rows: string[][]): string {
  const quote = (value: string) => (/[",\n\r;]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  // A cell starting with = + - @ would run as a formula in Excel.
  const safe = (value: string) => (/^[=+\-@\t\r]/.test(value) && !/^-?\d/.test(value) ? `'${value}` : value)
  return "﻿" + [header, ...rows].map((row) => row.map((cell) => quote(safe(String(cell ?? "")))).join(",")).join("\r\n") + "\r\n"
}
