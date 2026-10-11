// TITAN Stage B — live browser checks against a running Malik AI.
//
// A mocked answer is streamed into the real guest chat (the network call to
// /api/stream is stubbed in the page; no model, quota or provider is used).
// Everything else is real: the renderer, the 👍/👎 API, the Stop request and
// the security headers of the running server.
//
//   MALIK_QA_BASE_URL=http://localhost:3000 node scripts/verify-titan-stage-b-live.mjs [width] [screenshot-dir]
//
// Without MALIK_QA_BASE_URL or Playwright it skips (not part of the build).
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const base = process.env.MALIK_QA_BASE_URL
if (!base) { console.log("SKIP live Stage B checks: set MALIK_QA_BASE_URL to a running app"); process.exit(0) }
let engines
try { engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright") } catch { console.log("SKIP live Stage B checks: Playwright is not installed"); process.exit(0) }
const width = Number(process.argv[2] || 1280)
const out = process.argv[3] || ""

const body = "Подробный разбор с цифрами и примерами для этого раздела. ".repeat(14)
const answer = [
  "Короткий ответ: выбирайте вариант A.",
  "## Введение", body,
  "## Сравнение", "### Плюсы", "- быстрый запуск", "- низкая цена", "", "### Минусы", "- мало интеграций",
  "## Матрица решений",
  "| Критерий | Вес | Вариант A | Вариант B |\n|---|---|---|---|\n| Цена | 50% | 8 | 6 |\n| Качество | 30% | 6 | 9 |\n| Сервис | 20% | 7 | 7 |\n| Итого | | 9.9 | 6.9 |",
  "## Технические детали", body,
  "<details>\n<summary>Как считались оценки</summary>\n\nКаждый критерий оценён по шкале **0–10**.\n\n</details>",
  "## Частые вопросы",
  "**Можно ли сменить вариант позже?**\nДа, без потери данных.",
  "**Сколько занимает переход?**\nОколо недели.",
  "## Итог", body, "Готово: TITAN-макеты на месте.",
].join("\n\n")

const browser = await engines.chromium.launch()
const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: width < 800 ? 2 : 1 })
await ctx.addCookies([{ name: "malik-guest", value: "1", url: base }])
await ctx.addInitScript(({ answer }) => {
  const real = window.fetch.bind(window)
  const enc = new TextEncoder()
  const ev = (type, rest = {}) => enc.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...rest })}\n\n`)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url || String(input), location.href)
    const method = String(init.method || "GET").toUpperCase()
    if ((url.pathname === "/api/stream" || url.pathname === "/api/stream/background") && method === "POST") {
      const turnId = new Headers(init.headers || {}).get("x-malik-background-turn-id") || crypto.randomUUID()
      const slow = String(init.body || "").includes("медленный ответ")
      const signal = init.signal
      const stream = new ReadableStream({ async start(c) {
        c.enqueue(ev("progress", { phase: "thinking", text: "Думает…" })); await sleep(300)
        if (slow) {
          // Writes until the request is aborted, like a long model answer.
          for (let index = 0; index < 600 && !signal?.aborted; index++) { c.enqueue(ev("content", { content: `Слово ${index}. ` })); await sleep(50) }
          try { c.close() } catch {}
          return
        }
        for (const part of answer.match(/[\s\S]{1,90}/g)) { c.enqueue(ev("content", { content: part })); await sleep(8) }
        c.enqueue(ev("done", { provider: "mock", model: "mock", selectedModelId: "malik-max", sources: [], usedWeb: false })); c.close()
      } })
      return new Response(stream, { headers: { "content-type": "text/event-stream", "x-malik-background-turn-id": turnId } })
    }
    return real(input, init)
  }
}, { answer })

const page = await ctx.newPage()
const errors = []
page.on("pageerror", (error) => errors.push(error.message))
const requests = []
page.on("request", (request) => { if (/\/api\/(chat\/feedback|stream\/background\/)/.test(request.url())) requests.push(`${request.method()} ${new URL(request.url()).pathname}`) })
let failures = 0
const ok = (name, condition, extra = "") => { if (!condition) failures += 1; console.log(`${condition ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`) }
const hideDevOverlay = () => page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {})

const response = await page.goto(base + "/dashboard", { waitUntil: "load", timeout: 180000 })
const headers = response.headers()
ok("security headers are served", /frame-ancestors 'self'/.test(headers["content-security-policy"] || "") && headers["x-frame-options"] === "SAMEORIGIN" && headers["x-content-type-options"] === "nosniff", headers["content-security-policy"])
await hideDevOverlay()
const box = page.locator("textarea").first()
await box.waitFor({ timeout: 120000 }); await page.waitForTimeout(1200)
await box.fill("Сравни варианты A и B для бизнеса подробно")
await page.keyboard.press("Enter")
await page.waitForFunction(() => document.body.innerText.includes("Готово: TITAN-макеты на месте."), null, { timeout: 90000 })
await page.waitForTimeout(1500)
// A comparison is first shown as two answer cards (copies of the answer):
// every layout must work there too, and again after one is chosen.
const dual = await page.locator(".malik-dual-answer").count()
console.log(`(answer shown ${dual ? "as A/B cards" : "directly"})`)
const md = page.locator(".malik-md:visible").first()

async function checkContents(label) {
  const toc = page.locator('nav[aria-label="Содержание ответа"]:visible').first()
  ok(`${label}: a long answer shows its contents`, await toc.count() === 1 && (await toc.locator("a").count()) >= 5, String(await toc.locator("a").count()))
  const urlBefore = page.url()
  await page.evaluate(() => window.scrollTo(0, 0))
  await toc.locator("a", { hasText: "Частые вопросы" }).click(); await page.waitForTimeout(900)
  const headingTop = await page.locator("h2:visible, h3:visible", { hasText: "Частые вопросы" }).first().evaluate((el) => el.getBoundingClientRect().top)
  ok(`${label}: a contents link scrolls to its section without changing the URL`, headingTop > -5 && headingTop < 300 && page.url() === urlBefore, `top ${Math.round(headingTop)}`)
}
await checkContents(dual ? "A/B card" : "answer")

// FAQ accordion
const faq = page.locator("details.malik-md-details:visible", { hasText: "Можно ли сменить вариант позже?" }).first()
ok("FAQ questions start folded", await faq.evaluate((el) => !el.open))
await faq.locator("summary").click(); await page.waitForTimeout(200)
ok("clicking a question opens its answer", await faq.evaluate((el) => el.open) && await faq.getByText("Да, без потери данных.").isVisible())
const second = page.locator("details.malik-md-details:visible", { hasText: "Сколько занимает переход?" }).first()
await second.locator("summary").focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(200)
ok("the keyboard opens a question too", await second.evaluate((el) => el.open))

// <details>
const technical = page.locator("details.malik-md-details:visible", { hasText: "Как считались оценки" }).first()
ok("model <details> is folded and opens", await technical.evaluate((el) => !el.open) && await (async () => { await technical.locator("summary").click(); await page.waitForTimeout(150); return technical.evaluate((el) => el.open) })())
ok("no raw HTML tags are shown", !(await md.innerText()).includes("<details>") && !(await md.innerText()).includes("<summary>"))

// Pros / cons
const pros = page.locator(".malik-md-proscons:visible").first()
const columns = await pros.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)
ok("plus/minus lists stand side by side (stacked on a phone)", width < 600 ? columns === 1 : columns === 2, `${columns} columns`)

// Decision matrix
const matrix = page.locator("[data-malik-decision-matrix]:visible").first()
const totals = await matrix.locator("tfoot").innerText()
ok("the weighted total is computed by code", totals.includes("7,20") && totals.includes("7,10"), totals.replace(/\s+/g, " "))
ok("the wrong model total is flagged", (await matrix.innerText()).includes("посчитан неверно"))

// Strictly black and white
const colours = await page.evaluate(() => {
  const selectors = [".malik-md-toc", ".malik-md-details-summary", ".malik-md-proscons-side", ".malik-md-proscons-mark", ".malik-md-matrix-total td", "td.is-winner", ".malik-md-matrix-note"]
  const bad = []
  for (const selector of selectors) for (const el of document.querySelectorAll(selector)) {
    const style = getComputedStyle(el)
    for (const value of [style.color, style.backgroundColor, parseFloat(style.borderTopWidth) > 0 ? style.borderTopColor : ""]) {
      const rgb = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number)
      if (rgb && !(rgb[0] === rgb[1] && rgb[1] === rgb[2])) bad.push(`${selector}: ${value}`)
    }
  }
  return bad
})
ok("new layouts use only greys", colours.length === 0, colours.slice(0, 3).join("; "))
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
ok("no horizontal page overflow", overflow <= 0, String(overflow))
if (out) {
  await page.locator('nav[aria-label="Содержание ответа"]:visible').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/titan-b-${width}-contents.png` })
  await pros.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/titan-b-${width}-layouts.png` })
}
if (dual) {
  await page.locator(".malik-dual-card__choose").first().click(); await page.waitForTimeout(800)
  ok("choosing an A/B answer keeps the layouts", await page.locator(".malik-dual-answer").count() === 0 && await page.locator("[data-malik-decision-matrix]:visible").count() === 1)
  await checkContents("chosen answer")
}

// 👍 saved on the server and restored after a reload
const up = page.locator('button[title="Полезно"]').last()
await up.scrollIntoViewIfNeeded(); await up.click({ force: true }); await page.waitForTimeout(800)
ok("👍 is sent to the server", requests.includes("POST /api/chat/feedback"), requests.join(", "))
ok("👍 shows as chosen", await up.getAttribute("aria-pressed") === "true")
await page.reload({ waitUntil: "load" }); await hideDevOverlay()
// After a reload the chat opens from history, as a person would reopen it.
await page.waitForTimeout(1500)
if (!(await page.evaluate(() => document.body.innerText.includes("Готово: TITAN-макеты на месте.")))) {
  // (On a phone the history list sits in the closed side menu.)
  await page.evaluate(() => [...document.querySelectorAll(".malik-sidebar-chat-title")].find((item) => (item.getAttribute("title") || "").includes("Сравни варианты A"))?.click())
}
await page.waitForFunction(() => document.body.innerText.includes("Готово: TITAN-макеты на месте."), null, { timeout: 60000 })
await page.waitForTimeout(2500)
ok("👍 is still chosen after a reload", await page.locator('button[title="Полезно"]').last().getAttribute("aria-pressed") === "true")
const restored = page.locator('button[title="Полезно"]').last()
await restored.click({ force: true }); await page.waitForTimeout(500)
ok("clicking 👍 again clears it", await restored.getAttribute("aria-pressed") === "false")

// Stop reaches the server
const input = page.locator("textarea").first()
await input.fill("Напиши медленный ответ на тест остановки")
await page.keyboard.press("Enter")
await page.waitForFunction(() => document.body.innerText.includes("Слово 5."), null, { timeout: 60000 })
const stop = page.locator(".malik-runtime-stop:visible, [data-malik-stop]:visible").first()
await stop.click({ force: true }); await page.waitForTimeout(1200)
ok("Stop asks the server to stop the model", requests.some((line) => /^DELETE \/api\/stream\/background\/[0-9a-f-]{36}$/.test(line)), requests.filter((line) => line.startsWith("DELETE")).join(", "))
const textAfterStop = await page.evaluate(() => document.body.innerText.match(/Слово (\d+)\./g)?.length || 0)
await page.waitForTimeout(1200)
const textLater = await page.evaluate(() => document.body.innerText.match(/Слово (\d+)\./g)?.length || 0)
ok("nothing more is written after Stop", textLater === textAfterStop, `${textAfterStop} → ${textLater}`)

ok("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "))
await browser.close()
console.log(failures ? `\n${failures} FAILED at ${width}px` : `\nall live Stage B checks passed at ${width}px`)
process.exit(failures ? 1 : 0)
