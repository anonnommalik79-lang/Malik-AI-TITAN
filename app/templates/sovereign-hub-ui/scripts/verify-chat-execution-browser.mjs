// Interactive real component + actual execution reporter. No live provider,
// full dashboard, account database or production testing is claimed here.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { createRequire } from "node:module"
import { createExecutionReporter, normalizeExecutionTrace } from "../lib/ai/chat-execution.ts"
import { reactQaBundle, reactQaRuntime } from "./qa-react-bundle.mjs"
const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const { modules, bundle } = reactQaBundle()
const entry = bundle("components/sovereign/ChatExecution.tsx")
// The full shell CSS is covered by verify-mobile-thinking.mjs. This separate
// component document has no real sidebar/composer/scroll-container geometry.
const sheets = []
for (const name of ["chat-live.css", "chat-execution.css", "live-activity.css"]) sheets.push(fs.readFileSync(path.join("components/sovereign", name), "utf8"))
let now = Date.now() - 3000
const reporter = createExecutionReporter(() => {}, "qa-model", () => now)
const status = reporter.start("Обработка запроса", "status")
const snapshots = { status: reporter.snapshot() }
now += 200
reporter.finish(status)
const search = reporter.start("Поиск материалов", "search", "web.search", { query: "QA Алматы", api_key: "qa-secret" })
now += 700
reporter.finish(search, { sources: [{ url: "https://example.com/qa", title: "Контрольный источник QA" }] })
const model = reporter.start("Подготовка ответа моделью", "model", "qa-model")
snapshots.search = reporter.snapshot()
now += 1200
reporter.finish(model, { characters: 42, reasoning: "privateThought" })
snapshots.completed = reporter.settle("completed")
const failure = createExecutionReporter(() => {}, undefined, () => now++)
const plugin = failure.start("Подключённый сервис", "plugin", "qa.plugin")
failure.finish(plugin, undefined, "failed", "Сервис не подключён")
snapshots.failed = failure.settle("failed")
for (const state of ["cancelled", "interrupted"]) {
  const stopped = createExecutionReporter(() => {}, undefined, () => now++)
  stopped.start("Незавершённое действие", "file", "file.read")
  snapshots[state] = stopped.settle(state)
}
const saved = normalizeExecutionTrace(JSON.parse(JSON.stringify(snapshots.completed)), true)
assert.deepEqual(saved, snapshots.completed)
// Ensure the integration is per assistant answer and cannot borrow a newer
// version's execution receipts. Type-checking covers the real message props.
const chat = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
assert.match(chat, /!isUser \? <ChatExecution/)
assert.match(chat, /trace=\{olderVersion \? undefined : message\.execution\}/)
assert(chat.indexOf("<ChatExecution") < chat.indexOf("<SuperflowBlock messageId="))
const bootstrap = `${reactQaRuntime(modules)}
const ChatExecution=require(${JSON.stringify(entry)}).ChatExecution;
const root=require('react-dom/client').createRoot(document.getElementById('root'));
window.qaRender=(items)=>root.render(React.createElement(React.Fragment,null,...items.map((item,i)=>React.createElement('article',{key:item.id||i,'data-qa-turn':i},React.createElement('p',{className:'qa-query'},item.query||'Проверь информацию по запросу'),React.createElement(ChatExecution,{key:item.version||'current',trace:item.trace,live:item.live,writing:!!item.answer,workMode:true,legacyThought:item.legacyThought}),item.answer?React.createElement('p',{'data-qa-answer':true},item.answer):null))));
const restored=localStorage.getItem('qa-execution');window.qaRender([{trace:restored?JSON.parse(restored):${JSON.stringify(snapshots.status)},live:!restored,answer:restored?'Готовый тестовый ответ.':'',id:'one'}]);`
const css = `body{background:#000;color:#eee;font:15px/1.7 Arial,sans-serif;margin:0}.qa-document{max-width:820px;margin:auto;padding:16px;box-sizing:border-box}.qa-banner{color:#888;font-size:12px;border-bottom:1px solid #222}.qa-query{text-align:right;border-bottom:1px solid #222;padding:12px 0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}article{min-width:0}`
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${sheets.join("\n")}\n${css}</style><div id="malik-root"><div class="malik-dashboard-shell"><div class="qa-document" role="main"><p class="qa-banner">QA компонента · тестовые события, не production</p><div id="root"></div></div></div></div><script>${bootstrap}</script></html>`)
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
let passed = 0
try {
  for (const engine of (process.env.MALIK_QA_BROWSERS || "chromium").split(",")) {
    const executablePath = engine === "chromium" ? process.env.MALIK_QA_CHROMIUM_EXECUTABLE : engine === "webkit" ? process.env.MALIK_QA_WEBKIT_EXECUTABLE : undefined
    const browser = await playwright[engine].launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
    try {
      for (const [width, reducedMotion] of [[320, "no-preference"], [390, "no-preference"], [430, "no-preference"], [768, "no-preference"], [1440, "no-preference"], [390, "reduce"]]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion, acceptDownloads: true }), errors = []
        page.on("pageerror", error => errors.push(error.message))
        await page.goto(`http://127.0.0.1:${server.address().port}`)
        await page.bringToFront()
        const toggle = page.getByRole("button", { name: /Ход работы/ })
        const render = async items => { await page.evaluate(items => window.qaRender(items), items); await page.waitForTimeout(70) }
        await toggle.waitFor()
        assert.equal(await toggle.getAttribute("aria-expanded"), "false", "Must be visible even before any tool results")
        assert.equal(await page.locator(".malik-receipt").count(), 0)
        await toggle.click()
        assert.equal(await page.locator(".malik-receipt").count(), 1)
        assert(await page.getByText("Обработка запроса", { exact: true }).isVisible())
        await render([{ id: "one", trace: snapshots.search, live: true }])
        assert.equal(await toggle.getAttribute("aria-expanded"), "true", "Stream updates must preserve the disclosure state")
        assert.equal(await page.locator(".malik-receipt").count(), 3)
        assert(await page.locator(".malik-receipt__payload").first().isVisible(), "One click opens actual details")
        assert(!(await page.locator("body").innerText()).includes("qa-secret"))
        assert.equal(await page.locator(".malik-execution__source-chips a").getAttribute("href"), "https://example.com/qa")
        await page.getByRole("button", { name: /Поиск материалов/ }).click()
        assert.equal(await page.locator(".malik-receipt").nth(1).locator(".malik-receipt__body").count(), 0, "Individual details remain collapsible")
        await toggle.click()
        await render([{ id: "one", trace: snapshots.search, live: true, answer: "Появляется текст ответа…" }])
        assert.match(await toggle.innerText(), /Пишу ответ/)
        assert(await page.locator("[data-qa-answer]").isVisible(), "The answer must not wait for opening the panel")
        assert.equal(await page.locator(".malik-live-activity").count(), 0, "Writing replaces the waiting animation")
        await render([{ id: "one", trace: snapshots.completed, answer: "Готовый тестовый ответ." }])
        assert.match(await toggle.innerText(), /Готово/)
        assert.equal(await toggle.getAttribute("aria-expanded"), "false")
        await toggle.focus(); await page.keyboard.press("Enter")
        assert.equal(await toggle.getAttribute("aria-expanded"), "true", "Keyboard users can open the panel")
        assert(await page.locator("[data-qa-answer]").isVisible())
        assert(!/(qa-secret|privateThought)/.test(await page.locator("body").innerText()))
        await page.getByRole("button", { name: "Раскрыть детали", exact: true }).click()
        assert.equal(await page.locator(".malik-receipt__body").count(), 2)
        assert.equal(await page.locator(".malik-execution__summary").evaluate(el => el.getBoundingClientRect().height >= 44), true)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No horizontal page overflow")
        if (reducedMotion === "reduce") assert.equal(await page.locator(".malik-execution__panel").evaluate(el => getComputedStyle(el).animationName), "none")
        if (process.env.MALIK_QA_OUTPUT) {
          fs.mkdirSync(process.env.MALIK_QA_OUTPUT, { recursive: true })
          await page.evaluate(() => window.scrollTo(0, 0))
          await page.screenshot({ path: path.join(process.env.MALIK_QA_OUTPUT, `chat-execution-${engine}-${width}-${reducedMotion}.png`), fullPage: true })
        }
        await page.locator(".malik-execution__export summary").click()
        const pendingDownload = page.waitForEvent("download")
        await page.getByRole("button", { name: "JSON", exact: true }).click()
        const download = await pendingDownload
        assert.match(download.suggestedFilename(), /\.json$/)
        assert.equal(await download.failure(), null)
        const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"))
        assert.deepEqual(exported, JSON.parse(JSON.stringify(snapshots.completed)))
        await page.evaluate(trace => localStorage.setItem("qa-execution", JSON.stringify(trace)), saved)
        await page.reload()
        await toggle.waitFor()
        assert.equal(await toggle.getAttribute("aria-expanded"), "false")
        await toggle.click()
        assert.equal(await page.locator(".malik-receipt").count(), 3, "Saved receipts survive fixture history reload")
        for (const [state, label] of [["failed", "Ошибка"], ["cancelled", "Остановлено"], ["interrupted", "Прервано"]]) {
          await render([{ id: state, trace: snapshots[state], answer: "Сообщение о результате запроса." }])
          assert.match(await toggle.innerText(), new RegExp(label))
          await toggle.click()
          assert.match(await page.locator(".malik-execution__overview").innerText(), state === "failed" ? /Действий с ошибкой: 1/ : /завершение не подтверждено/)
          assert.equal(await page.locator(".malik-execution__work-summary").getByText("0 завершено", { exact: true }).count(), 1)
        }
        await render([{ id: "missing-live", live: true }])
        await toggle.click()
        assert.match(await page.locator(".malik-execution__empty").innerText(), /Ожидаю событий выполнения/)
        await render([{ id: "legacy", legacyThought: { ms: 500, steps: ["Читаю файл…", "Готово"] }, answer: "Старый ответ." }])
        await toggle.click()
        assert.match(await page.locator(".malik-execution__legacy").innerText(), /Подробные квитанции.*отсутствуют/)
        assert.equal(await page.locator(".malik-receipt").count(), 0)
        await render([{ id: "one", trace: saved, answer: "Первый ответ." }, { id: "two", answer: "Второй ответ без журнала." }])
        const panels = page.getByRole("button", { name: /Ход работы/ })
        assert.equal(await panels.count(), 2)
        await panels.nth(1).click()
        assert.equal(await panels.nth(0).getAttribute("aria-expanded"), "false")
        assert.match(await page.locator(".malik-execution__empty").innerText(), /этапы не были сохранены/)
        assert.equal(await page.locator(".malik-receipt").count(), 0, "Another answer must not inherit the first answer's receipts")
        assert.equal(new Set(await panels.evaluateAll(items => items.map(item => item.getAttribute("aria-controls")))).size, 2)
        assert.deepEqual(errors, [])
        await page.close(); passed++
        console.log(`PASS ${engine} ${width} ${reducedMotion}: live/status, disclosure, immediate answer, receipts, keyboard, errors, cancellation, isolation, download and history fixture`)
      }
    } finally { await browser.close() }
  }
} finally { await new Promise(resolve => server.close(resolve)) }
console.log(`${passed}/${passed} browser scenarios passed (real component; fixture events, not production QA)`)
