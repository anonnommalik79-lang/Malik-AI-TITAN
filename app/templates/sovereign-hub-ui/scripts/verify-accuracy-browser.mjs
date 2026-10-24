// Actual React Markdown/TeX/table components in Chromium, desktop + mobile.
// Fixture content, not a live model, full dashboard or authenticated chat session.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { createRequire } from "node:module"
import { reactQaBundle, reactQaRuntime } from "./qa-react-bundle.mjs"
const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const { modules, bundle } = reactQaBundle()
modules["@/lib/business/project-zip"] = "module.exports={downloadProjectZip(){throw Error('Not exercised by formatting QA')}}"
// Interactive JSON visuals have a separate regression suite; not used here.
modules["./visual-engine/MalikVisualBlock"] = "module.exports={MalikVisualEngineBlock:()=>null,MalikVisualPending:()=>null}"
modules["./generative-ui/MalikGenerativeUi"] = "module.exports={MalikGenerativeUi:()=>null}"
const markdown = bundle("components/sovereign/MalikMarkdown.tsx")
const text = [
  "## Проверенные вычисления",
  "0.1 + 0.2 = 0.3. Числа рассчитаны из данных пользователя.",
  "Формула: \\[\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}\\].",
  "| Период | MAU | Конверсия | Платящие | ARPPU | MRR | Код | Формула |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  "| Месяц A | 10000 | 2% | 200 | 20 USD | 4000 USD | `a|b` | $|x|$ |",
  "| Месяц B | 20000 | 3% | 600 | 20 USD | 12000 USD | A\\|B | $x^2$ |",
  "",
  "$$\\sum_{i=1}^{12} (a_i+b_i+c_i+d_i+e_i+f_i+g_i+h_i+j_i+k_i) = 42$$",
  "",
  "```js\nconst value = '2+2=5'; // код остаётся без изменения\n```",
].join("\n\n").replace(/\n\n(?=\|)/g, "\n")
const boot = `${reactQaRuntime(modules)}require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(require(${JSON.stringify(markdown)}).MalikMarkdown,{text:${JSON.stringify(text)},allowImages:false,autoPreview:false,visualContext:{question:'Только текст и таблица, без диаграмм',streaming:false}}));`.replace(/<\/script/giu, "<\\/script")
const css = ["app/chat-black-surface-final.css", "components/sovereign/malik-tex.css", "components/sovereign/answer-blocks.css"].map(file => fs.readFileSync(file, "utf8")).join("\n")
const server = http.createServer((_, res) => {
  res.setHeader("content-type", "text/html;charset=utf-8")
  res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;color:#eee;font:16px Arial}main{width:calc(100% - 32px);max-width:900px;margin:16px auto;min-width:0}pre{max-width:100%;overflow:auto}code{font-family:monospace}${css}</style><div id="malik-root"><main><p>QA: реальный Markdown / LaTeX, тестовые данные</p><div id="root"></div></main></div><script>${boot}</script></html>`)
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
let passed = 0
try {
  for (const [width, height] of [[1440, 1000], [390, 844], [360, 800]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByRole("heading", { name: "Проверенные вычисления" }).waitFor({ timeout: 10000 }).catch(error => { throw new Error(`${error.message}; browser errors: ${errors.join("; ")}`) })
    const table = page.locator(".malik-md-table").first()
    assert.equal(await table.locator("th").count(), 8)
    assert.equal(await table.locator("tbody tr").count(), 2)
    assert.match(await table.innerText(), /a\|b/)
    assert.ok(await page.getByRole("math").count() >= 3)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    const viewport = page.locator(".malik-md-table-scroll").first()
    if (width < 500) {
      await page.waitForFunction(() => document.querySelector(".malik-md-table-controls"))
      const before = await viewport.evaluate(element => element.scrollLeft)
      await page.getByRole("button", { name: "Таблица: прокрутить вправо" }).first().click()
      await page.waitForFunction(() => document.querySelector(".malik-md-table-scroll").scrollLeft > 0)
      assert.ok(await viewport.evaluate(element => element.scrollLeft) > before)
    }
    assert.deepEqual(errors, [])
    if (process.env.MALIK_QA_OUTPUT) {
      fs.mkdirSync(process.env.MALIK_QA_OUTPUT, { recursive: true })
      await page.screenshot({ path: path.join(process.env.MALIK_QA_OUTPUT, `accuracy-format-${width}.png`), fullPage: true })
    }
    await page.close(); passed++; console.log(`PASS formatting at ${width}px: math, protected pipes, accessible table scroll, no page overflow`)
  }
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
console.log(`${passed}/3 Chromium component scenarios PASS; not real-device Safari/Android or live production QA.`)
