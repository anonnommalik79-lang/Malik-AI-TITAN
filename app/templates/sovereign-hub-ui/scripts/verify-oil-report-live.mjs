// Live: the oil report inside the real chat at phone and computer width.
// It must fit the screen, stay black and white, and every control must work:
// chart hover, legend toggles, well tabs, expand-all, copy and CSV download.
//
//   MALIK_QA_BASE_URL=http://localhost:3000 node scripts/verify-oil-report-live.mjs
//
// The /api/stream answer is the real server output for the pasted table
// (computed here by the same module), stubbed into the page; no model is used.
import { createRequire } from "node:module"
import { workTestLoader } from "./work-test-loader.mjs"

const require = createRequire(import.meta.url)
const base = process.env.MALIK_QA_BASE_URL
if (!base) { console.log("SKIP live oil report: set MALIK_QA_BASE_URL to a running app"); process.exit(0) }
let engines
try { engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright") } catch { console.log("SKIP live oil report: Playwright is not installed"); process.exit(0) }

const load = workTestLoader({ "./oil-report.css": {}, "./malik-tex.css": {} })
const { executePetroleumTable } = load("lib/work/petroleum/table-message.ts")
const GOLDEN = "Month,Oil_Rate_bbl_day,Water_Rate_bbl_day,Gas_Rate_scf_day\n2026-01,100,20,50000\n2026-02,95,25,48000\n2026-03,90,30,47000\n2026-04,85,35,46000\n2026-05,80,40,45000\n2026-06,75,45,44000\n2026-07,70,50,43000\n2026-08,65,55,42000"
let multi = "Проанализируй скважины месторождения\nwell_id,date,oil_bbl_day,water_bbl_day\n"
for (const [well, start, decline] of [["A-1", 120, 0.04], ["A-2", 90, 0.02], ["B-7", 150, 0.07]]) for (let month = 0; month < 14; month++) multi += `${well},${new Date(Date.UTC(2025, month, 1)).toISOString().slice(0, 10)},${(start * Math.exp(-decline * month)).toFixed(2)},${(20 + month * decline * 100).toFixed(1)}\n`
const answers = {
  golden: executePetroleumTable({ prompt: "Проанализируй синтетические данные скважины, цена 70 USD/bbl\n" + GOLDEN }).content,
  arabic: executePetroleumTable({ prompt: "حلل إنتاج النفط\n" + GOLDEN }).content,
  multi: executePetroleumTable({ prompt: multi }).content,
}

let failures = 0
const ok = (name, condition, extra = "") => { if (!condition) failures += 1; console.log(`${condition ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`) }

async function open(browser, width, answer) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: 2, acceptDownloads: true })
  await context.addCookies([{ name: "malik-guest", value: "1", url: base }])
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base })
  await context.addInitScript((content) => {
    const real = window.fetch.bind(window), encoder = new TextEncoder()
    const event = (type, rest = {}) => encoder.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...rest })}\n\n`)
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url || String(input), location.href)
      if ((url.pathname === "/api/stream" || url.pathname === "/api/stream/background") && String(init.method || "GET").toUpperCase() === "POST") {
        // The server ends fence headers with CR (transport guard); reproduce it.
        const body = content.replace(/```([a-z-]*)\n/g, "```$1\r")
        const stream = new ReadableStream({ start(controller) { controller.enqueue(event("content", { content: body })); controller.enqueue(event("done", { provider: "malik-petroleum-local", model: "malik-oil-analysis-1.0.0", selectedModelId: "malik-max", sources: [] })); controller.close() } })
        return new Response(stream, { headers: { "content-type": "text/event-stream", "x-malik-background-turn-id": crypto.randomUUID() } })
      }
      return real(input, init)
    }
  }, answer)
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(String(error)))
  await page.goto(base + "/dashboard", { waitUntil: "load", timeout: 180000 })
  const box = page.locator("textarea").first()
  await box.waitFor({ timeout: 120000 }); await page.waitForTimeout(1200)
  await box.fill("Проанализируй добычу нефти"); await page.keyboard.press("Enter")
  await page.waitForSelector(".malik-oil", { timeout: 60000 })
  await page.waitForTimeout(800)
  return { context, page, errors }
}

/** Every painted colour inside the report must be a grey (R = G = B). */
const monochrome = (page) => page.evaluate(() => {
  const bad = []
  const grey = (value) => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return true; const [r, g, b, a = "1"] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return Number(a) === 0 || Math.max(r, g, b) - Math.min(r, g, b) <= 2 }
  for (const element of document.querySelectorAll(".malik-oil, .malik-oil *")) {
    const style = getComputedStyle(element)
    const checks = [["color", style.color], ["background", style.backgroundColor]]
    if (parseFloat(style.borderTopWidth) > 0) checks.push(["border", style.borderTopColor])
    if (element instanceof SVGElement) checks.push(["stroke", style.stroke], ["fill", style.fill])
    for (const [kind, value] of checks) if (value && value !== "none" && !grey(value)) bad.push(`${element.tagName}.${element.getAttribute("class") || ""} ${kind} ${value}`)
  }
  return bad.slice(0, 5)
})

const browser = await engines.chromium.launch()
try {
  for (const width of [390, 1280]) {
    const label = `${width}px`
    const { context, page, errors } = await open(browser, width, answers.golden)
    const layout = await page.evaluate(() => {
      const report = document.querySelector(".malik-oil").getBoundingClientRect()
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: report.right, width: innerWidth, badge: document.querySelector("[data-oil-badge]")?.getAttribute("data-oil-badge"), ticks: Math.min(...[...document.querySelectorAll(".malik-oil-chart__tick")].map((node) => parseFloat(getComputedStyle(node).fontSize))) }
    })
    ok(`${label}: the report renders with a passed cross-check`, layout.badge === "passed")
    ok(`${label}: no sideways scroll, the report fits the screen`, layout.overflow <= 0 && layout.right <= layout.width + 0.5, JSON.stringify(layout))
    ok(`${label}: chart labels stay readable (≥ 11px)`, layout.ticks >= 11, String(layout.ticks))
    const text = await page.locator(".malik-oil").first().innerText()
    ok(`${label}: engine numbers are shown (−35,00 %, 45,83 %, 646,15, 120 bbl/day)`, ["35,00", "45,83", "646,15", "120 bbl/day", "60", "сен 2026"].every((value) => text.includes(value)))
    ok(`${label}: black and white only`, (await monochrome(page)).length === 0, JSON.stringify(await monochrome(page)))

    const chart = page.locator(".malik-oil-chart").first()
    await chart.scrollIntoViewIfNeeded()
    const overlay = chart.locator("rect[fill='transparent']")
    const box = await overlay.boundingBox()
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2)
    if (width < 800) await overlay.tap({ position: { x: box.width - 4, y: box.height / 2 } }).catch(() => {})
    await page.waitForTimeout(200)
    const tip = await chart.locator(".malik-oil-chart__tip").innerText().catch(() => "")
    ok(`${label}: hovering/touching the chart shows the period's values`, /авг 2026/.test(tip) && /65/.test(tip) && /55/.test(tip), tip.replace(/\n/g, " | "))

    const paths = async () => chart.locator("svg.malik-oil-chart__svg path").count()
    const before = await paths()
    const water = chart.locator(".malik-oil-chart__key", { hasText: "Вода" })
    await water.click()
    ok(`${label}: the legend hides a series`, (await water.getAttribute("aria-pressed")) === "false" && (await paths()) === before - 1)
    await water.click()
    ok(`${label}: and shows it again`, (await paths()) === before)

    const expand = page.locator(".malik-oil__expand button")
    await expand.click(); await page.waitForTimeout(200)
    const openCount = await page.evaluate(() => [...document.querySelectorAll(".malik-oil details.malik-oil__more")].map((item) => item.open))
    ok(`${label}: «Развернуть все разделы» opens every section`, openCount.length >= 12 && openCount.every(Boolean), `${openCount.length}`)
    ok(`${label}: the economics section uses the stated price`, (await page.locator("[data-oil-section='economics']").innerText()).includes("2450 USD"))

    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.locator(".malik-oil__button", { hasText: "Скачать CSV" }).click()])
    const path = await download.path()
    const csv = path ? (await import("node:fs")).readFileSync(path, "utf8") : ""
    ok(`${label}: «Скачать CSV» downloads the full-precision table`, /^malik-oil-oa-[0-9a-f]{16}-W1\.csv$/.test(download.suggestedFilename()) && csv.includes("45.83333333333333") && csv.includes("Aug 2026"), download.suggestedFilename())
    await page.locator(".malik-oil__button", { hasText: "Копировать таблицу" }).click()
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "")
    ok(`${label}: «Копировать таблицу» copies the table`, clip.includes("авг 2026\t65\t55\t120\t45,83"), clip.split("\n")[1] || clip.slice(0, 80))
    ok(`${label}: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 300))
    await context.close()
  }

  for (const width of [390, 1280]) {
    const { context, page, errors } = await open(browser, width, answers.multi)
    const tabs = page.locator(".malik-oil__tab")
    ok(`${width}px: one tab for the field and each well`, (await tabs.count()) === 4)
    const before = await page.locator(".malik-oil__conclusion").innerText()
    await tabs.filter({ hasText: "B-7" }).click(); await page.waitForTimeout(200)
    const after = await page.locator(".malik-oil__conclusion").innerText()
    ok(`${width}px: choosing a well shows that well's analysis`, (await tabs.filter({ hasText: "B-7" }).getAttribute("aria-selected")) === "true" && after !== before && after.includes("150"))
    ok(`${width}px: multi-well report fits and stays black and white`, (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0 && (await monochrome(page)).length === 0)
    ok(`${width}px: no page errors (wells)`, errors.length === 0, errors.join(" | ").slice(0, 300))
    await context.close()
  }

  const { context, page } = await open(browser, 390, answers.arabic)
  const arabic = await page.evaluate(() => { const report = document.querySelector(".malik-oil"); return { dir: report.getAttribute("dir"), lang: report.getAttribute("lang"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, chartDir: report.querySelector(".malik-oil-chart__frame")?.getAttribute("dir") } })
  ok("390px Arabic: right-to-left text, left-to-right charts, fits the screen", arabic.dir === "rtl" && arabic.lang === "ar" && arabic.chartDir === "ltr" && arabic.overflow <= 0, JSON.stringify(arabic))
  await context.close()
} finally { await browser.close() }
console.log(failures ? `\n${failures} FAILED` : "\nall live oil report checks passed")
process.exit(failures ? 1 : 0)
