// Real React download component -> actual export route; session boundary stubbed.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { createRequire } from "node:module"
import { workTestLoader } from "./work-test-loader.mjs"
import { reactQaBundle, reactQaRuntime } from "./qa-react-bundle.mjs"
const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const { modules, bundle } = reactQaBundle()
const entry = bundle("components/sovereign/WorkDownloadMenu.tsx")
const journal = bundle("components/sovereign/os/WorkJournal.tsx")
const css = fs.readFileSync("components/sovereign/work-download.css", "utf8") + fs.readFileSync("components/sovereign/os/work-journal.css", "utf8")
const markdown = "# Отчёт\n\nКириллица: Алматы.\n\n| Город | Число |\n|---|---|\n| Алматы | 12 |"
const bootstrap = `${reactQaRuntime(modules)}require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(require(${JSON.stringify(entry)}).WorkDownloadMenu,{markdown:${JSON.stringify(markdown)}}),React.createElement(require(${JSON.stringify(journal)}).WorkJournal,{events:[{id:'qa-tool-start',at:Date.now(),type:'tool.started',label:'Тестовый документ',tool:'document.write',attempt:1},{id:'qa-tool-done',at:Date.now(),type:'tool.completed',label:'Тестовый документ',tool:'document.write',durationMs:1200}]})));`
const load = workTestLoader({ "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => ({ authenticated: false, userId: "qa-browser-export", plan: "free" }) } })
const post = load("app/api/work/export/route.ts").POST
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/work/export") {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const response = await post(new Request("http://qa.invalid/api/work/export", { method: "POST", headers: { "content-type": "application/json" }, body: Buffer.concat(chunks) }))
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return
    }
    res.setHeader("content-type", "text/html; charset=utf-8"); res.end(`<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#000;color:#eee;font:16px Arial;margin:24px}main{max-width:800px;margin:auto}button,summary{color:inherit}${css}</style><main><p>QA: меню реального компонента; тестовый ответ</p><h1>Отчёт</h1><p>Кириллица: Алматы.</p><div id="root"></div></main><script>${bootstrap}</script></html>`)
  } catch (error) { res.writeHead(500); res.end(error.message) }
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
let passed = 0
try {
  for (const [width, height, reducedMotion] of [[1440, 900, "no-preference"], [390, 844, "no-preference"], [390, 844, "reduce"]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion, acceptDownloads: true }), errors = []
    page.on("pageerror", e => errors.push(e.message)); await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.locator(".malik-work-download summary").click()
    await page.locator(".malik-work-journal summary").click()
    assert.equal(await page.locator(".malik-work-journal li").count(), 2)
    assert.match(await page.locator("body").innerText(), /Отчёт[\s\S]*Кириллица: Алматы[\s\S]*Скачать[\s\S]*Журнал выполнения/)
    if (reducedMotion === "reduce") assert.equal(await page.locator(".malik-work-journal li").first().evaluate(el => getComputedStyle(el).animationName), "none")
    assert.equal(await page.locator("button").count(), 5)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.waitForFunction(() => [...document.querySelectorAll(".malik-work-journal li")].every(el => Number(getComputedStyle(el).opacity) >= .99))
    if (process.env.MALIK_QA_OUTPUT) { fs.mkdirSync(process.env.MALIK_QA_OUTPUT, { recursive: true }); await page.screenshot({ path: path.join(process.env.MALIK_QA_OUTPUT, `work-export-${width}-${reducedMotion}.png`) }) }
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "DOCX", exact: true }).click()
    const file = await download; assert.match(file.suggestedFilename(), /\.docx$/); assert.equal(await file.failure(), null)
    assert.deepEqual(errors, []); await page.close(); passed++; console.log(`PASS ${width}x${height} ${reducedMotion}: menu, no overflow, real DOCX download`)
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
console.log(`${passed}/${passed} browser scenarios passed (not a full dashboard or production test)`)
