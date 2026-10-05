// Real ChatExecution + MalikResponseStages in Chromium with the full app CSS
// cascade (layout.tsx sheets), phone and desktop. Fixture events only.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { createRequire } from "node:module"
import { reactQaBundle, reactQaRuntime } from "./qa-react-bundle.mjs"
const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const { modules, bundle } = reactQaBundle()
const entry = bundle("components/sovereign/ChatExecution.tsx")
const sheets = [...fs.readFileSync("app/layout.tsx", "utf8").matchAll(/import ["'](\.\/[^"']+\.css)["']/g)].map((match) => fs.readFileSync(path.join("app", match[1]), "utf8"))
for (const name of ["chat-live.css", "chat-execution.css", "live-activity.css", "response-stages.css"]) sheets.push(fs.readFileSync(path.join("components/sovereign", name), "utf8"))
const bootstrap = `${reactQaRuntime(modules)}
const ChatExecution=require(${JSON.stringify(entry)}).ChatExecution;
const root=require('react-dom/client').createRoot(document.getElementById('root'));
window.qaRender=(item)=>root.render(React.createElement('div',{className:'malik-message-card-assistant'},React.createElement(ChatExecution,{key:item.key||'turn',trace:item.trace,live:item.live,writing:!!item.answer,stages:item.stages!==false}),item.answer?React.createElement('p',{'data-qa-answer':true},item.answer):null));`
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${sheets.join("\n")}\nbody{background:#000}</style><div id="malik-root"><div class="malik-dashboard-shell"><div class="malik-chat-fullwidth" style="padding:16px"><div class="malik-message-row-assistant"><div style="width:100%" id="root"></div></div></div></div></div><script>${bootstrap}</script></html>`)
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const trace = (steps, state = "running", startedAt = Date.now()) => ({ version: 1, id: "m1", startedAt, state, steps: [{ id: "m1:request", title: "Отправка запроса", kind: "status", state: "completed", startedAt }, ...steps] })
const model = { id: "m1:model", title: "Подготовка ответа моделью", kind: "model", state: "running", startedAt: Date.now() }
let passed = 0
try {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
  try {
    for (const [width, reducedMotion] of [[320, "no-preference"], [390, "no-preference"], [768, "no-preference"], [1440, "no-preference"], [390, "reduce"]]) {
      const page = await browser.newPage({ viewport: { width, height: 760 }, reducedMotion }), errors = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      const stages = page.locator("[data-malik-response-stages]")
      const shot = async (name) => {
        if (!process.env.MALIK_QA_OUTPUT) return
        fs.mkdirSync(process.env.MALIK_QA_OUTPUT, { recursive: true })
        await page.screenshot({ path: path.join(process.env.MALIK_QA_OUTPUT, `stages-${width}-${reducedMotion}-${name}.png`), clip: { x: 0, y: 0, width, height: 260 } })
      }
      // History rows never show the line; a live turn does, under «Думаю…».
      await page.evaluate((t) => window.qaRender({ key: "history", trace: t, live: false, answer: "Старый ответ." }), trace([], "completed"))
      await page.waitForTimeout(60)
      assert.equal(await stages.count(), 0, "A reopened answer has no progress line")
      await page.evaluate((t) => window.qaRender({ key: "live", trace: t, live: true }), trace([]))
      await page.waitForTimeout(480)
      assert.equal(await stages.count(), 1)
      assert.equal(await page.locator(".malik-live-activity").count(), 1, "The existing thinking animation stays")
      const order = await page.evaluate(() => {
        const thinking = document.querySelector(".malik-live-activity").getBoundingClientRect()
        const line = document.querySelector("[data-malik-response-stages]").getBoundingClientRect()
        return { below: line.top >= thinking.bottom - 8, left: Math.abs(line.left - thinking.left) }
      })
      assert(order.below, "The progress line sits under «Думаю…»")
      assert(order.left <= 2, `aligned with the thinking label (${order.left}px)`)
      assert.match(await page.locator(".malik-stages__sr").innerText(), /Анализирую запрос/)
      const look = await stages.evaluate((el) => {
        const s = getComputedStyle(el), row = getComputedStyle(el.querySelector(".malik-stages__row"))
        return { bg: s.backgroundColor, border: s.borderTopWidth, shadow: s.boxShadow, display: row.display, list: getComputedStyle(el.querySelector(".malik-stages__list")).listStyleType, align: row.textAlign }
      })
      assert.equal(look.bg, "rgba(0, 0, 0, 0)", "No grey card behind the line")
      assert.equal(look.border, "0px")
      assert.equal(look.shadow, "none")
      assert.equal(look.display, "flex")
      assert.equal(look.list, "none")
      assert.equal(look.align, "left")
      await shot("1-analyze")
      // Server steps and the model call move it forward; it waits there.
      await page.evaluate((t) => window.qaRender({ key: "live", trace: t, live: true }), trace([model]))
      await page.waitForTimeout(900)
      assert.equal(await stages.getAttribute("data-stage"), "3")
      assert.match(await page.locator(".malik-stages__sr").innerText(), /Формирую ответ/)
      assert.equal(await page.locator(".malik-stages__row").count(), 3, "Compact: at most three rows")
      if (reducedMotion === "no-preference") {
        const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.target?.closest?.("[data-malik-response-stages]")).length)
        assert(moving >= 3, `halo, rail light, caret and text glow are animated (${moving})`)
      }
      await shot("2-forming")
      // First characters: «Готово», thinking label goes, the line folds away.
      await page.evaluate((t) => window.qaRender({ key: "live", trace: t, live: true, answer: "Квантовая физика — раздел физики…" }), trace([model]))
      await page.waitForTimeout(140)
      assert.equal(await page.locator(".malik-live-activity").count(), 0, "Writing replaces the waiting animation")
      assert.equal(await stages.getAttribute("data-malik-response-stages"), "done")
      assert.match(await page.locator(".malik-stages__sr").innerText(), /Готово/)
      assert(await page.locator("[data-qa-answer]").isVisible(), "Streaming is not held back")
      await shot("3-done")
      await page.waitForTimeout(1300)
      assert.equal(await stages.count(), 0, "The line is gone once the answer is written")
      assert(await page.locator("[data-qa-answer]").isVisible())
      await shot("4-answer")
      // A failed or stopped turn folds away without claiming «Готово».
      await page.evaluate((t) => window.qaRender({ key: "failed", trace: t, live: true }), trace([]))
      await page.waitForTimeout(500)
      await page.evaluate((t) => window.qaRender({ key: "failed", trace: t, live: true, answer: "Не удалось получить ответ." }), trace([], "failed"))
      await page.waitForTimeout(60)
      assert.notEqual(await stages.getAttribute("data-malik-response-stages").catch(() => "gone"), "done")
      await page.waitForTimeout(800)
      assert.equal(await stages.count(), 0)
      // An instant reply never flashes the line.
      await page.evaluate((t) => window.qaRender({ key: "instant", trace: t, live: true }), trace([]))
      await page.waitForTimeout(40)
      await page.evaluate((t) => window.qaRender({ key: "instant", trace: t, live: true, answer: "Привет!" }), trace([]))
      await page.waitForTimeout(60)
      assert.equal(await stages.count(), 0)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No horizontal overflow")
      assert.deepEqual(errors, [])
      await page.close(); passed++
      console.log(`PASS chromium ${width} ${reducedMotion}: under «Думаю…», flat, compact, moving, Готово → fold, failure, instant reply`)
    }
  } finally { await browser.close() }
} finally { await new Promise((resolve) => server.close(resolve)) }
console.log(`${passed}/${passed} response-stage browser scenarios passed (real component, full CSS cascade, fixture events)`)
