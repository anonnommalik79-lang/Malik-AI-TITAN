import assert from "node:assert/strict"
import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const JSZip = require("jszip")
const { PDFDocument } = require("pdf-lib")
const url = process.env.MALIK_QA_BASE_URL || "http://127.0.0.1:3021"
assert.match(url, /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/u)
const out = process.env.MALIK_QA_OUTPUT || ".data/presentation-tests"
const engine = process.env.MALIK_QA_BROWSER || "chromium"
const desktop = process.env.MALIK_QA_VIEWPORT === "desktop"
const scope = desktop ? `${engine}-desktop` : engine
const mime = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const quota = { tier: "free", dailyCredits: 5, remaining: 4, maxSlides: 12, used: 1 }
const brief = "Сделай 3 слайда на казахском о пилоте городской доставки. Без обложки.\n\n| Қаңтар | 12,25 |\n| Ақпан | 16,75 |\n| Наурыз | 20,5 |"
const slides = [
  { id: "photo", layout: "image-text", title: "Қаладағы жеткізуге арналған пилот", body: "Бір ауданнан басталған жеткізу бағыты", imageSide: "right", imageQuery: "city logistics team", notes: "Пилоттың мақсаты — бір бағыттағы сұранысты өлшеу." },
  { id: "chart", layout: "chart", title: "Тапсырыстардың өсуі", unit: "мың тапсырыс", data: [{ label: "Қаңтар", value: 12.25 }, { label: "Ақпан", value: 16.75 }, { label: "Наурыз", value: 20.5 }], notes: "Деректерді тапсырыс беруші ұсынды." },
  { id: "table", layout: "comparison", title: "Екі бағыттың салыстыруы", columns: ["Қазіргі", "Ұсыныс"], rows: [{ label: "Қамту", values: ["Бір аудан", "Үш аудан"] }, { label: "Тексеру", values: ["Апта сайын", "Күн сайын"] }], notes: "Екі бағыт та пилот барысында тексеріледі." },
]
const outline = { title: "Қалалық жеткізу пилоты", theme: "ocean", items: slides.map(({ title, layout }) => ({ title, layout, point: title })) }

async function verifyPackage(bytes, page) {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir)
  const xml = Object.fromEntries(await Promise.all(names.filter((name) => /\.(?:xml|rels)$/u.test(name)).map(async (name) => [name, await zip.file(name).async("string")])))
  const broken = await page.evaluate((parts) => Object.entries(parts).flatMap(([name, content]) => {
    const parsed = new DOMParser().parseFromString(content, "application/xml")
    return parsed.querySelector("parsererror") ? [name] : []
  }), xml)
  assert.deepEqual(broken, [], "all OOXML parts parse")
  for (const [name, content] of Object.entries(xml)) {
    if (!name.endsWith(".rels")) continue
    const directory = name.replace(/_rels\/[^/]*\.rels$/u, "")
    for (const [relation] of content.matchAll(/<Relationship\b[^>]+>/gu)) {
      if (/TargetMode="External"/u.test(relation)) continue
      const target = relation.match(/\bTarget="([^"]+)"/u)?.[1]
      assert.ok(target, `target in ${name}`)
      const resolved = path.posix.normalize(target.startsWith("/") ? target.slice(1) : directory + target)
      assert.ok(zip.file(resolved), `relationship ${name} → ${resolved}`)
    }
  }
  assert.equal(names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).length, 3)
  assert.match(xml["ppt/presentation.xml"], /<p:sldSz cx="12192000" cy="6858000"/u)
  assert.match(xml["ppt/slides/slide1.xml"], /Қаладағы жеткізуге арналған пилот/u)
  assert.match(xml["ppt/slides/slide1.xml"], /<p:pic>/u, "the picture is inside the package")
  const chart = names.find((name) => /^ppt\/charts\/chart\d+\.xml$/u.test(name))
  assert.ok(chart)
  assert.match(xml[chart], /<c:v>12\.25<\/c:v>/u)
  assert.ok(names.some((name) => /^ppt\/embeddings\/.+\.xlsx$/u.test(name)), "editable chart workbook")
  assert.match(xml["ppt/slides/slide3.xml"], /<a:tbl>/u, "editable table")
  assert.match(xml["ppt/notesSlides/notesSlide2.xml"], /Деректерді тапсырыс беруші ұсынды/u)
}

const browser = await playwright[engine].launch({ headless: true, ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE && engine === "chromium" ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
await mkdir(out, { recursive: true })
let page
try {
  const device = desktop ? "Desktop 1440" : engine === "webkit" ? "iPhone 14" : "Pixel 7"
  const display = desktop ? { viewport: { width: 1440, height: 1000 } } : playwright.devices[device]
  const context = await browser.newContext({ ...display, acceptDownloads: true, reducedMotion: "reduce" })
  page = await context.newPage()
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  let outlineCalls = 0
  const batchCalls = []
  await page.route("**/api/presentations", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, authenticated: true, quota } })
    const body = route.request().postDataJSON()
    assert.equal(body.topic, brief)
    assert.equal(body.language, "kk")
    if (body.action === "outline") {
      assert.equal(body.count, 3)
      outlineCalls++
      return route.fulfill({ json: { ok: true, outline, quota } })
    }
    assert.equal(body.action, "slides")
    batchCalls.push([body.startIndex, body.count])
    const result = slides.slice(body.startIndex, body.startIndex + body.count).map((slide, index) => ({ index: body.startIndex + index, slide }))
    return route.fulfill({ json: { ok: true, slides: result, missing: [], quota } })
  })
  await page.route("**/api/presentations/photos", async (route) => {
    const slots = route.request().postDataJSON().items
    return route.fulfill({ json: { ok: true, photos: Object.fromEntries(slots.map(({ key }) => [key, { url: "/presentations/showcase/strategy.webp", credit: "Start Bootstrap" }])) } })
  })
  await page.goto(`${url}/visual-test/presentations?view=blank`, { waitUntil: "domcontentloaded", timeout: 180_000 })
  await page.getByLabel("Тема презентации").fill(brief)
  await page.getByRole("button", { name: /^Создать(?: презентацию)? ·/u }).click()
  await page.getByRole("button", { name: "Создать презентацию", exact: true }).waitFor()
  await page.waitForFunction(() => localStorage.getItem("malik.presentations.v1:visual-test:draft"))
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "Продолжить черновик" }).click()
  await page.getByRole("button", { name: "Создать презентацию", exact: true }).click()
  const prepare = page.getByRole("button", { name: "Подготовить PPTX" })
  await prepare.waitFor({ timeout: 60_000 })
  await prepare.click({ timeout: 60_000 })
  const link = page.getByRole("link", { name: "Скачать PPTX" })
  await link.waitFor({ timeout: 90_000 })
  assert.equal(outlineCalls, 1)
  assert.deepEqual(batchCalls, [[0, 3]])
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "the page fits its viewport")
  await page.screenshot({ path: path.join(out, `${scope}-studio.png`), animations: "disabled" })
  await page.getByRole("button", { name: "Слайд 2", exact: true }).click()
  const labels = page.locator(".ps-main-slide .deck-bar-value")
  await labels.first().waitFor()
  assert.match((await labels.allTextContents())[0], /^12[.,]25$/u, "the preview preserves chart precision")
  await page.screenshot({ path: path.join(out, `${scope}-chart.png`), animations: "disabled" })
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()])
  assert.equal(download.suggestedFilename(), "Қалалық-жеткізу-пилоты.pptx")
  const target = path.join(out, `${scope}${desktop ? "" : "-mobile"}.pptx`)
  await download.saveAs(target)
  const bytes = await readFile(target)
  await verifyPackage(bytes, page)
  const [second] = await Promise.all([page.waitForEvent("download"), link.click()])
  assert.equal(await second.failure(), null, "the prepared link is reusable")
  console.log(`PASS ${device}: from a Kazakh brief to a downloaded ${bytes.length}-byte editable PowerPoint`)

  if (engine === "chromium" && !desktop) {
    await page.getByRole("button", { name: "Подготовить PDF" }).click()
    await page.getByRole("button", { name: "Печать / PDF" }).waitFor()
    const pdf = await page.pdf({ path: path.join(out, "chromium-print.pdf"), preferCSSPageSize: true, printBackground: true })
    const pages = (await PDFDocument.load(pdf)).getPages()
    assert.equal(pages.length, slides.length, "one printable page per slide")
    assert.ok(pages.every((page) => Math.abs(page.getWidth() / page.getHeight() - 16 / 9) < 0.01))
    console.log("PASS print PDF: 3 pages, 16:9")
  }

  await page.evaluate(() => {
    HTMLCanvasElement.prototype.getContext = () => null
  })
  await page.getByLabel("Название презентации").fill("Экспорт после сбоя")
  let fallback = 0
  await page.route("**/api/presentations/export", route => {
    fallback++
    return route.fulfill({ status: 200, contentType: mime, body: fallback === 1 ? bytes.subarray(0, 40) : bytes })
  })
  await prepare.click()
  await page.getByRole("alert").filter({ hasText: /получен не полностью/u }).waitFor()
  assert.equal(await link.count(), 0)
  await prepare.click()
  const [recovered] = await Promise.all([page.waitForEvent("download"), link.click()])
  assert.equal(recovered.suggestedFilename(), "Экспорт-после-сбоя.pptx")
  assert.equal(fallback, 2)
  assert.deepEqual(errors, [])
  console.log(`PASS ${device}: an incomplete response does not download, then the server fallback can be retried`)
} catch (error) {
  if (page) await page.screenshot({ path: path.join(out, `${scope}-failure.png`) }).catch(() => undefined)
  throw error
} finally {
  await browser.close()
}
