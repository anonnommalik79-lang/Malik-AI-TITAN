// TITAN Stage C — live browser checks: quiz grading, code changes, project
// tree and heatmap in the real chat (the /api/stream call is stubbed in the
// page; no model or provider is used).
//
//   MALIK_QA_BASE_URL=http://localhost:3000 node scripts/verify-titan-stage-c-live.mjs [width] [screenshot-dir]
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const base = process.env.MALIK_QA_BASE_URL
if (!base) { console.log("SKIP live Stage C checks: set MALIK_QA_BASE_URL to a running app"); process.exit(0) }
let engines
try { engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright") } catch { console.log("SKIP live Stage C checks: Playwright is not installed"); process.exit(0) }
const width = Number(process.argv[2] || 1280)
const out = process.argv[3] || ""

const quiz = { version: 1, title: "Химия: проверка", questions: [
  { question: "Символ кислорода?", options: ["O", "K", "Ox"], answer: 0, explanation: "От лат. Oxygenium." },
  { question: "Формула воды?", options: ["CO2", "H2O"], answer: 1 },
] }
const answer = [
  "Ниже тест, изменения кода, структура проекта и нагрузка.",
  "```malik-quiz\n" + JSON.stringify(quiz) + "\n```",
  "### Было", "```python\ndef total(items):\n    s = 0\n    for i in items:\n        s += i\n    return s\n```",
  "### Стало", "```python\ndef total(items):\n    return sum(items)\n```",
  "```diff\n--- a/app.py\n+++ b/app.py\n@@ -1,2 +1,2 @@\n-DEBUG = True\n+DEBUG = False\n```",
  "```\nshop/\n├── api/\n│   ├── orders.py   # заказы\n│   └── users.py\n├── web/\n│   └── index.html\n└── README.md\n```",
  "### Тепловая карта загрузки",
  "| Час | Пн | Вт | Ср |\n|---|---|---|---|\n| 9:00 | 12 | 30 | 18 |\n| 13:00 | 44 | 61 | 52 |\n| 18:00 | 80 | 95 | 70 |",
  "Готово: этап C на месте.",
].join("\n\n")

const browser = await engines.chromium.launch()
const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: width < 800 ? 2 : 1 })
await ctx.addCookies([{ name: "malik-guest", value: "1", url: base }])
await ctx.addInitScript(({ answer }) => {
  const real = window.fetch.bind(window)
  const enc = new TextEncoder()
  const ev = (type, rest = {}) => enc.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...rest })}\n\n`)
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url || String(input), location.href)
    if ((url.pathname === "/api/stream" || url.pathname === "/api/stream/background") && String(init.method || "GET").toUpperCase() === "POST") {
      const turnId = new Headers(init.headers || {}).get("x-malik-background-turn-id") || crypto.randomUUID()
      const stream = new ReadableStream({ async start(c) {
        for (const part of answer.match(/[\s\S]{1,90}/g)) { c.enqueue(ev("content", { content: part })); await new Promise((r) => setTimeout(r, 6)) }
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
let failures = 0
const ok = (name, condition, extra = "") => { if (!condition) failures += 1; console.log(`${condition ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`) }
await page.goto(base + "/dashboard", { waitUntil: "load", timeout: 180000 })
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {})
const box = page.locator("textarea").first()
await box.waitFor({ timeout: 120000 }); await page.waitForTimeout(1200)
await box.fill("Сделай тест по химии и покажи, что изменилось в коде")
await page.keyboard.press("Enter")
await page.waitForFunction(() => document.body.innerText.includes("Готово: этап C на месте."), null, { timeout: 90000 })
await page.waitForTimeout(1500)
ok("an answer with a quiz stays one live answer (no A/B copies)", await page.locator(".malik-dual-answer").count() === 0)

// Quiz: choose, check, score, retry
const quizBlock = page.locator("[data-malik-quiz]:visible").first()
const check = quizBlock.getByRole("button", { name: /Проверить/ })
ok("«Проверить» waits for an answer", await check.isDisabled())
await quizBlock.getByText("K", { exact: true }).click()
await quizBlock.getByText("H2O", { exact: true }).click()
ok("choices are counted", (await quizBlock.locator("header").innerText()).includes("2 из 2 отвечено"))
await check.click(); await page.waitForTimeout(200)
const header = await quizBlock.locator("header").innerText()
ok("grading uses the quiz's own answers", header.includes("1 из 2 верно"), header.replace(/\s+/g, " "))
ok("a wrong choice shows the right answer and the explanation", (await quizBlock.innerText()).includes("Неверно. Правильный ответ: O. От лат. Oxygenium."))
ok("options are locked after checking", await quizBlock.locator('input[type="radio"]').first().isDisabled())
await quizBlock.getByRole("button", { name: /Пройти заново/ }).click(); await page.waitForTimeout(200)
ok("«Пройти заново» clears the answers", (await quizBlock.locator("header").innerText()).includes("0 из 2 отвечено") && await quizBlock.locator('input[type="radio"]:checked').count() === 0)
await quizBlock.locator('input[type="radio"]').first().focus(); await page.keyboard.press("Space")
ok("the keyboard can answer", (await quizBlock.locator("header").innerText()).includes("1 из 2 отвечено"))

// Code changes
const changes = page.locator("[data-malik-code-changes]:visible").first()
ok("«Было/Стало» code shows a computed change summary", (await changes.locator("summary").innerText()).includes("+1 −4"))
await changes.locator("summary").click(); await page.waitForTimeout(150)
ok("opening it lists the added and removed lines", await changes.locator(".is-add").count() === 1 && await changes.locator(".is-del").count() === 4)
const diffBlock = page.locator(".malik-md-pre.is-diff:visible").filter({ hasText: "DEBUG" }).first()
ok("a diff fence marks + and − lines", await diffBlock.locator(".is-add").count() === 1 && await diffBlock.locator(".is-del").count() === 1)

// Project tree
const tree = page.locator('[role="tree"]:visible').first()
ok("a drawn project tree becomes folders", await tree.count() === 1 && (await tree.innerText()).includes("orders.py"))
await tree.locator("summary", { hasText: "api/" }).click(); await page.waitForTimeout(150)
ok("a folder folds", !(await tree.getByText("orders.py").isVisible()))
const toggle = page.getByRole("button", { name: "Текстом" }).first()
await toggle.click(); await page.waitForTimeout(150)
ok("«Текстом» shows the original drawing", (await page.locator(".malik-md-pre:visible").filter({ hasText: "├── api/" }).count()) === 1)

// Heatmap
const heat = page.locator("[data-malik-heatmap]:visible").first()
const shades = await heat.locator("td.is-heat").evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).backgroundColor))
const greys = shades.every((value) => { const [r, g, b] = value.match(/\d+/g).map(Number); return r === g && g === b })
ok("heatmap cells are shaded in greys only", shades.length === 9 && greys, shades.slice(0, 3).join(" "))
const darkest = await heat.locator("td.is-heat", { hasText: /^12$/ }).evaluate((cell) => getComputedStyle(cell).backgroundColor)
const lightest = await heat.locator("td.is-heat", { hasText: /^95$/ }).evaluate((cell) => getComputedStyle(cell).backgroundColor)
ok("the smallest number is darkest, the largest lightest", darkest === "rgb(28, 28, 28)" && lightest === "rgb(224, 224, 224)", `${darkest} / ${lightest}`)

const colours = await page.evaluate(() => {
  const bad = []
  for (const el of document.querySelectorAll(".malik-answer-quiz, .malik-answer-quiz *, .malik-md-tree, .malik-md-tree *, .malik-md-heatmap-legend, .malik-md-pre.is-diff .is-add, .malik-md-pre.is-diff .is-del")) {
    const style = getComputedStyle(el)
    for (const value of [style.color, style.backgroundColor, parseFloat(style.borderTopWidth) > 0 ? style.borderTopColor : ""]) {
      const rgb = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number)
      if (rgb && !(rgb[0] === rgb[1] && rgb[1] === rgb[2])) bad.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute("class") || "").slice(0, 40)} in ${String(el.parentElement?.getAttribute("class") || "").slice(0, 40)}: ${value}`)
    }
  }
  return bad
})
ok("the new blocks are strictly black and white", colours.length === 0, colours.slice(0, 3).join("; "))
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
ok("no horizontal page overflow", overflow <= 0, String(overflow))
if (out) {
  await quizBlock.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/titan-c-${width}-quiz.png` })
  await heat.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/titan-c-${width}-heatmap.png` })
}
ok("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "))
await browser.close()
console.log(failures ? `\n${failures} FAILED at ${width}px` : `\nall live Stage C checks passed at ${width}px`)
process.exit(failures ? 1 : 0)
