// Malik Work · document writers: markdown model, DOCX, XLSX, CSV, ZIP.
// node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/verify-work-documents.mjs
import assert from "node:assert/strict"
import { inflateRawSync } from "node:zlib"
import { documentModel, parseInline, tablesOf, texToText, blocksToText } from "../lib/work/documents/markdown.ts"
import { buildDocx } from "../lib/work/documents/docx.ts"
import { buildCsv, buildXlsx, parseCell } from "../lib/work/documents/xlsx.ts"
import { buildZip, crc32 } from "../lib/work/documents/zip.ts"

let passed = 0
const results = []
async function test(name, fn) {
  try { await fn(); passed += 1; results.push(`  ok  ${name}`) } catch (error) { results.push(`  FAIL ${name}\n       ${error.message}`) }
}

/** Reads a ZIP the way any unzip tool does: central directory → entries, checking CRCs. */
function readZip(bytes) {
  const buffer = Buffer.from(bytes)
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.ok(end >= 0, "no end of central directory")
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const files = {}
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50)
    const method = buffer.readUInt16LE(offset + 10)
    const crc = buffer.readUInt32LE(offset + 16)
    const size = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const local = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8")
    const localName = buffer.readUInt16LE(local + 26)
    const localExtra = buffer.readUInt16LE(local + 28)
    const raw = buffer.subarray(local + 30 + localName + localExtra, local + 30 + localName + localExtra + size)
    const data = method === 8 ? inflateRawSync(raw) : raw
    assert.equal(crc32(new Uint8Array(data)), crc, `crc of ${name}`)
    files[name] = data.toString("utf8")
    offset += 46 + nameLength
  }
  return files
}

const MARKDOWN = [
  "# Отчёт о рынке кофе",
  "Вступление с **жирным**, *курсивом*, `кодом` и [ссылкой](https://example.com/a?b=1&c=2).",
  "## Цифры",
  "| Город | Кофеен | Рост |",
  "|---|---:|---:|",
  "| Алматы | 1 250 | 12% |",
  "| Астана | 830 | 9,5% |",
  "",
  "- первый пункт",
  "  - вложенный",
  "- второй пункт",
  "",
  "1. шаг один",
  "2. шаг два",
  "",
  "> Цитата эксперта",
  "",
  "```js",
  "const a = 1 < 2 && 3 > 2",
  "```",
  "",
  "Формула: $E = mc^2$, а также $\\frac{a}{b} \\cdot \\pi \\le \\sqrt{x}$.",
].join("\n")

console.log("document engine")
await test("markdown → blocks: headings, table, nested list, numbered list, quote, code", () => {
  const model = documentModel(MARKDOWN)
  assert.equal(model.title, "Отчёт о рынке кофе")
  assert.deepEqual(model.blocks.map((block) => block.type), ["heading", "paragraph", "heading", "table", "list", "list", "quote", "code", "paragraph"])
  const list = model.blocks[4]
  assert.deepEqual(list.items.map((item) => item.level), [0, 1, 0])
  assert.equal(model.blocks[5].ordered, true)
  assert.deepEqual(tablesOf(model.blocks)[0].rows, [["Алматы", "1 250", "12%"], ["Астана", "830", "9,5%"]])
})
await test("inline styles and links", () => {
  const runs = parseInline("a **b** *c* `d` [e](https://x.y) https://z.w/q.")
  assert.deepEqual(runs.filter((run) => run.bold).map((run) => run.text), ["b"])
  assert.deepEqual(runs.filter((run) => run.link).map((run) => run.link), ["https://x.y", "https://z.w/q"])
})
await test("LaTeX becomes readable text", () => {
  assert.equal(texToText("E = mc^2"), "E = mc²")
  assert.equal(texToText("\\frac{a}{b} \\cdot \\pi \\le \\sqrt{x}"), "a/b · π ≤ √x")
  assert.match(blocksToText(documentModel(MARKDOWN).blocks), /E = mc²/)
})
await test("DOCX is a valid Word package with real styles, lists, table and hyperlink", () => {
  const files = readZip(buildDocx(documentModel(MARKDOWN), { createdAt: new Date("2026-10-04T00:00:00Z") }))
  for (const name of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/_rels/document.xml.rels", "docProps/core.xml"]) assert.ok(files[name], name)
  const document = files["word/document.xml"]
  assert.match(document, /<w:pStyle w:val="Title"\/>/)
  assert.match(document, /<w:pStyle w:val="Heading2"\/>/)
  assert.match(document, /<w:tbl>/)
  assert.match(document, /<w:tblHeader\/>/)
  assert.match(document, /<w:numId w:val="2"\/>/)
  assert.match(document, /<w:hyperlink r:id="rIdLink1"/)
  assert.match(document, /1 &lt; 2 &amp;&amp; 3 &gt; 2/)
  assert.match(files["word/_rels/document.xml.rels"], /Target="https:\/\/example.com\/a\?b=1&amp;c=2" TargetMode="External"/)
  assert.match(files["docProps/core.xml"], /<dc:title>Отчёт о рынке кофе<\/dc:title>/)
})
await test("XLSX stores numbers as numbers and percentages as percentages", () => {
  assert.deepEqual(parseCell("1 250"), { kind: "number", value: 1250 })
  assert.deepEqual(parseCell("9,5%"), { kind: "number", value: 0.095, percent: true })
  assert.deepEqual(parseCell("1,234.5"), { kind: "number", value: 1234.5 })
  assert.equal(parseCell("007").kind, "text")
  const table = tablesOf(documentModel(MARKDOWN).blocks)[0]
  const files = readZip(buildXlsx([{ name: table.title, header: table.header, rows: table.rows }], { title: "Отчёт" }))
  const sheet = files["xl/worksheets/sheet1.xml"]
  assert.match(sheet, /<c r="B2"><v>1250<\/v><\/c>/)
  assert.match(sheet, /<c r="C3" s="2"><v>0.095<\/v><\/c>/)
  assert.match(sheet, /state="frozen"/)
  assert.match(files["xl/workbook.xml"], /<sheet name="Цифры"/)
})
await test("CSV opens in Excel and cannot run formulas", () => {
  const csv = buildCsv(["a", "b"], [["=HYPERLINK(1)", "x,y"], ["-5", "ok"]])
  assert.ok(csv.startsWith("﻿"))
  assert.match(csv, /'=HYPERLINK\(1\)/)
  assert.match(csv, /"x,y"/)
  assert.match(csv, /\r\n-5,ok/)
})
await test("ZIP: compressed, CRC-checked, no path traversal, no duplicates", () => {
  const files = readZip(buildZip([{ name: "../../etc/passwd", data: "x" }, { name: "a.txt", data: "привет ".repeat(200) }, { name: "a.txt", data: "dup" }]))
  assert.deepEqual(Object.keys(files).sort(), ["a.txt", "etc/passwd"])
  assert.equal(files["a.txt"], "привет ".repeat(200))
})

console.log(results.join("\n"))
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
