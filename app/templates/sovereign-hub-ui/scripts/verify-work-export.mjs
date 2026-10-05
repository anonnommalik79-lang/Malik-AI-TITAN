import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { workTestLoader } from "./work-test-loader.mjs"
let owner = { authenticated: true, userId: "export-owner-a", plan: "free" }
const load = workTestLoader({ "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => owner } })
for (const key of ["MEDIA_STORAGE_BUCKET", "R2_BUCKET", "CLOUDFLARE_R2_BUCKET", "S3_BUCKET", "STORAGE_BUCKET", "PRIVATE_JSON_BUCKET"]) delete process.env[key]
const { exportDocument, documentFilename, documentDisposition } = load("lib/work/documents/export.ts")
const post = load("app/api/work/export/route.ts").POST
const store = load("lib/os/store.ts")
store.configureOsBackend(store.memoryBackend())
const get = load("app/api/os/artifacts/[id]/export/route.ts").GET
const markdown = "# Проверка экспорта\n\nКириллица: Алматы, Астана. **Жирный** и *курсив*, `код`. [Ссылка](https://example.com).\n\n- Первый\n  - Вложенный\n\n| Город | Число |\n|---|---|\n| Алматы | 12 |\n| Астана | 34 |\n\n```js\nconst text = 'Кириллица';\n```\n\n> Цитата\n\nФормула $E = mc^2$."
let count = 0
async function check(name, fn) { await fn(); count++; console.log(`ok ${name}`) }
const outputs = new Map()
await check("all nine document formats generate actual bytes", async () => {
  for (const format of ["docx", "pdf", "xlsx", "csv", "md", "txt", "html", "json", "zip"]) {
    const output = await exportDocument({ format, title: "Отчёт об экспорте", markdown })
    assert.ok(output.bytes.length > 20, format); outputs.set(format, output)
    assert.ok(output.filename.endsWith(`.${format}`))
  }
})
await check("PDF loads; links and page geometry exist", async () => {
  const { createRequire } = await import("node:module")
  const req = createRequire(path.join(process.env.MALIK_QA_DEPS || process.cwd(), "fixture.cjs"))
  const { PDFDocument, PDFName } = req("pdf-lib")
  const pdf = await PDFDocument.load(outputs.get("pdf").bytes)
  assert.equal(pdf.getPageCount(), 1)
  assert.ok(pdf.getPage(0).getWidth() > 590 && pdf.getPage(0).getWidth() < 600)
  assert.ok(pdf.getPage(0).node.get(PDFName.of("Annots")))
})
await check("missing tables give the required error", async () => {
  for (const format of ["xlsx", "csv"]) await assert.rejects(exportDocument({ format, title: "Без таблицы", markdown: "Простой ответ" }), /В документе нет таблиц/)
})
await check("HTML is inert and all supplied text is escaped", async () => {
  const output = await exportDocument({ format: "html", title: "<script>alert(1)</script>", markdown: "<img src=x onerror=alert(1)>" })
  const html = new TextDecoder().decode(output.bytes)
  assert.doesNotMatch(html, /<script|<img/)
  assert.match(html, /&lt;script&gt;/)
})
await check("NFC and RFC 5987 filename with Cyrillic", () => {
  const file = documentFilename("и\u0306 файл/\r\n", "pdf")
  assert.equal(file, "й файл.pdf")
  assert.match(documentDisposition(file), /filename\*=UTF-8''%D0%B9/)
  assert.doesNotMatch(documentDisposition(file), /\r|\n/)
})
const request = (body) => new Request("https://test.invalid/api/work/export", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })
await check("chat export permits guests without trusting userId in body", async () => {
  owner = { authenticated: false, userId: "guest-export-test", plan: "free" }
  assert.equal((await post(request({ format: "docx", title: "Ответ", markdown }))).status, 200)
  assert.equal((await post(request({ format: "md", title: "Ответ", markdown, userId: "admin" }))).status, 400)
})
await check("400KB body is enforced on actual bytes", async () => {
  assert.equal((await post(request({ format: "md", title: "Тест", markdown: "я".repeat(210000) }))).status, 413)
})
await check("guest rate limit is enforced", async () => {
  owner = { ...owner, userId: "guest-export-rate" }
  for (let index = 0; index < 6; index++) assert.equal((await post(request({ format: "md", title: "Тест", markdown: "Тест" }))).status, 200)
  assert.equal((await post(request({ format: "md", title: "Тест", markdown: "Тест" }))).status, 429)
})
owner = { authenticated: true, userId: "export-owner-a", plan: "free" }
const artifact = await store.putArtifact(owner.userId, { projectId: "test-project", kind: "document", title: "Документ", content: markdown, sourceTool: "document.write", metadata: {}, links: [] })
const artifactGet = (format) => get(new Request(`https://test.invalid/api/os/artifacts/${artifact.id}/export?format=${format}`), { params: Promise.resolve({ id: artifact.id }) })
await check("artifact owner receives DOCX, PDF and XLSX", async () => {
  for (const format of ["docx", "pdf", "xlsx"]) assert.equal((await artifactGet(format)).status, 200)
})
await check("another account and guest both receive 404", async () => {
  owner = { ...owner, userId: "export-owner-b" }; assert.equal((await artifactGet("pdf")).status, 404)
  owner = { ...owner, authenticated: false, userId: "export-owner-a" }; assert.equal((await artifactGet("pdf")).status, 404)
})
owner = { authenticated: true, userId: "export-kinds-owner", plan: "free" }
await check("code ZIP, website HTML and dataset CSV use actual stored results", async () => {
  for (const [kind, content, format] of [["code", JSON.stringify({ files: [{ path: "src/index.ts", content: "export const answer = 42" }] }), "zip"], ["website", "<!doctype html><h1>Алматы</h1>", "html"], ["dataset", "Город,Число\nАлматы,12", "csv"]]) {
    const item = await store.putArtifact(owner.userId, { projectId: "test-project", kind, title: "Результат", content, sourceTool: "document.write", metadata: {}, links: [] })
    const response = await get(new Request(`https://test.invalid/api/os/artifacts/${item.id}/export?format=${format}`), { params: Promise.resolve({ id: item.id }) })
    assert.equal(response.status, 200)
    const bytes = new Uint8Array(await response.arrayBuffer()); assert.ok(bytes.length > 15)
    if (format === "zip") assert.equal(bytes[0], 80)
    if (format === "html") assert.match(new TextDecoder().decode(bytes), /Алматы/)
  }
})
await check("ZIP rejects path traversal in stored model output", async () => {
  const item = await store.putArtifact(owner.userId, { projectId: "test-project", kind: "code", title: "Проверка", content: JSON.stringify({ files: [{ path: "../escape.txt", content: "unsafe" }] }), sourceTool: "code.project", metadata: {}, links: [] })
  assert.equal((await get(new Request(`https://test.invalid/api/os/artifacts/${item.id}/export?format=zip`), { params: Promise.resolve({ id: item.id }) })).status, 422)
})
await check("presentation route returns real PPTX without fetching supplied image URLs", async () => {
  const content = JSON.stringify({ title: "План", theme: "obsidian", slides: [{ id: "slide-title", layout: "title", title: "План Алматы", subtitle: "Проверка", imageUrl: "https://untrusted.invalid/image.png" }, { id: "slide-body", layout: "bullets", title: "Действия", bullets: ["Запуск", "Проверка"] }] })
  const item = await store.putArtifact(owner.userId, { projectId: "test-project", kind: "presentation", title: "План", content, sourceTool: "presentation.generate", metadata: {}, links: [] })
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw Error("Export must never fetch a client image URL") }
  try {
    const response = await get(new Request(`https://test.invalid/api/os/artifacts/${item.id}/export?format=pptx`), { params: Promise.resolve({ id: item.id }) })
    assert.equal(response.status, 200)
    assert.match(decodeURIComponent(response.headers.get("content-disposition")), /без изображений/)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const { createRequire } = await import("node:module")
    const req = createRequire(path.join(process.env.MALIK_QA_DEPS || process.cwd(), "fixture.cjs"))
    const zip = await req("jszip").loadAsync(bytes)
    const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    assert.equal(slides.length, 2)
    const text = (await Promise.all(slides.map(name => zip.file(name).async("string")))).join("\n")
    assert.match(text, /План Алматы/); assert.match(text, /без изображений/)
    outputs.set("pptx", { bytes })
  } finally { globalThis.fetch = originalFetch }
})
await check("unsupported glyphs do not crash PDF", async () => {
  assert.ok((await exportDocument({ format: "pdf", title: "Шрифт", markdown: "Кириллица 中文 🚀" })).bytes.length > 100)
})
await check("wrapped long table continues across pages", async () => {
  const table = "| Заголовок | Значение |\n|---|---|\n" + Array.from({ length: 120 }, (_, i) => `| Строка ${i} | ${"длинное значение ".repeat(8)} |`).join("\n")
  const output = await exportDocument({ format: "pdf", title: "Таблица", markdown: table })
  outputs.set("table-pdf", output)
  assert.ok(output.bytes.length > outputs.get("pdf").bytes.length)
})
if (process.env.MALIK_QA_OUTPUT) {
  fs.mkdirSync(process.env.MALIK_QA_OUTPUT, { recursive: true })
  for (const [format, output] of outputs) fs.writeFileSync(path.join(process.env.MALIK_QA_OUTPUT, format === "table-pdf" ? "table.pdf" : `export.${format}`), output.bytes)
}
console.log(`${count}/${count} passed (actual exports/routes/store; auth stubbed)`)
