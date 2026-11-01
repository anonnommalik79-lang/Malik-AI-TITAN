// Opens every dashboard section and every standalone page of a running local
// app as a guest, at 1440 and 375 px, and records what breaks: JavaScript
// errors, failed requests (5xx or network), blank screens and sideways scroll.
// Each section opens in a fresh page, so one overlay (voice mode) never blocks
// the next. Never reaches the public domain. Not part of the build.
//   MALIK_QA_BASE_URL   the running app (default http://localhost:3018)
//   MALIK_QA_PLAYWRIGHT_PATH   path to playwright or playwright-core
//   MALIK_QA_CHROMIUM_EXECUTABLE   a Chromium binary (optional)
//   MALIK_AUDIT_OUT   folder for sections.json and screenshots (default: audit-results)
//   MALIK_AUDIT_VIEWS_ONLY=1   dashboard sections only
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const BASE = (process.env.MALIK_QA_BASE_URL || "http://localhost:3018").replace(/\/$/, "")
const OUT = path.resolve(process.env.MALIK_AUDIT_OUT || "audit-results")
const SHOTS = path.join(OUT, "shots")
fs.mkdirSync(SHOTS, { recursive: true })

const SIDEBAR = ["Новый чат", "Голосовой режим", "Библиотека", "Проекты", "Задачи", "Бизнес под ключ", "Malik Work", "Malik Shorts", "Сайты", "Генерация видео", "Создать трек", "Презентации", "Генерация изображений"]
const PAGES = ["/taxi", "/translator", "/shorts", "/shorts/library", "/shorts/history", "/business", "/business/dashboard", "/media", "/status", "/capabilities", "/security", "/investors", "/contact", "/press-kit", "/benchmarks", "/research-lab", "/compute", "/demo", "/clone", "/auth"]

const browser = await playwright.chromium.launch({ headless: true, ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
const report = []
const fileName = (text) => text.replace(/[^\p{L}\p{N}]+/gu, "-")

async function session(width) {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 812 : 900 }, isMobile: width < 768, hasTouch: width < 768 })
  // A production build sends guests on to the public domain: the local app only.
  await context.route(/^https?:\/\/(?:[^/]+\.)?malikaiworld\.world\//, (route) => route.abort())
  await context.addCookies([{ name: "malik-guest", value: "1", url: BASE }])
  const page = await context.newPage()
  const log = { errors: [], console: [], failed: [] }
  page.on("pageerror", (error) => log.errors.push(String(error.message).slice(0, 300)))
  page.on("console", (message) => { if (message.type() === "error") log.console.push(message.text().slice(0, 300)) })
  // A request cut by leaving the page (ERR_ABORTED) is not a failure.
  page.on("requestfailed", (request) => {
    const url = request.url(), reason = request.failure()?.errorText || ""
    if (url.startsWith(BASE) && !/_next\/static|favicon/.test(url) && !/ERR_ABORTED/.test(reason)) log.failed.push(`${request.method()} ${url.replace(BASE, "")} ${reason}`)
  })
  page.on("response", (response) => {
    const url = response.url()
    if (url.startsWith(BASE) && response.status() >= 500) log.failed.push(`${response.request().method()} ${url.replace(BASE, "")} → ${response.status()}`)
  })
  return { context, page, log }
}

const visible = (page) => page.evaluate(() => {
  const main = document.querySelector("main") || document.body
  const text = (main.innerText || "").replace(/\s+/g, " ").trim()
  return { chars: text.length, sample: text.slice(0, 140), overflow: document.documentElement.scrollWidth - window.innerWidth }
})

function record(kind, name, width, log, state) {
  const item = { kind, name, width, errors: [...log.errors], console: [...new Set(log.console)].slice(0, 6), failed: [...new Set(log.failed)].slice(0, 8), ...state }
  report.push(item)
  const bad = item.errors.length || item.failed.length || item.chars < 20 || item.overflow > 1
  console.log(`${bad ? "ISSUE" : "ok   "} ${kind} ${name} @${width}  chars=${item.chars} overflow=${item.overflow}`
    + (item.chars < 260 && item.sample ? `  text="${item.sample.slice(0, 90)}"` : "")
    + (item.note ? `  note=${item.note.slice(0, 120)}` : "")
    + (item.errors.length ? `  errors=${item.errors.length}: ${item.errors[0]}` : "")
    + (item.failed.length ? `  failed: ${item.failed.slice(0, 3).join(" | ")}` : ""))
}

for (const width of [1440, 375]) {
  for (const label of ["home", ...SIDEBAR]) {
    const { context, page, log } = await session(width)
    try {
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 180_000 })
      await page.waitForSelector("textarea", { timeout: 120_000 }).catch(() => {})
      await page.waitForTimeout(2000)
      if (label !== "home") {
        log.errors.length = 0; log.console.length = 0; log.failed.length = 0
        if (width < 768) {
          const menu = page.locator('button[aria-label*="меню" i], button[aria-label*="menu" i]').first()
          if (await menu.count()) await menu.click({ timeout: 5000 }).catch(() => {})
          await page.waitForTimeout(600)
        }
        await page.locator("aside, nav, [role=dialog]").getByText(label, { exact: true }).first().click({ timeout: 8000 })
        await page.waitForTimeout(4000)
      }
      record("view", label, width, log, await visible(page))
      await page.screenshot({ path: path.join(SHOTS, `view-${width}-${fileName(label)}.png`) })
    } catch (error) {
      record("view", label, width, log, { chars: -1, overflow: 0, note: `could not open: ${String(error.message).split("\n")[0]}` })
    }
    await context.close()
  }
}

if (process.env.MALIK_AUDIT_VIEWS_ONLY !== "1") {
  for (const width of [1440, 375]) {
    for (const route of PAGES) {
      const { context, page, log } = await session(width)
      try {
        const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await page.waitForTimeout(3000)
        record("page", route, width, log, { ...(await visible(page)), status: response?.status(), url: page.url().replace(BASE, "") })
        await page.screenshot({ path: path.join(SHOTS, `page-${width}-${fileName(route)}.png`) })
      } catch (error) {
        record("page", route, width, log, { chars: -1, overflow: 0, note: String(error.message).split("\n")[0] })
      }
      await context.close()
    }
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, "sections.json"), JSON.stringify(report, null, 1))
const issues = report.filter((item) => item.errors.length || item.failed.length || item.chars < 20 || item.overflow > 1)
console.log(`\n${issues.length} with issues of ${report.length}`)
process.exit(issues.length ? 1 : 0)
