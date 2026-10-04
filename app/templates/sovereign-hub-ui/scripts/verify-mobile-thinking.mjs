// Real progress component + full CSS cascade; no server/API/provider calls.
// Requires Playwright or MALIK_QA_PLAYWRIGHT_PATH for a bundled runtime.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const require = createRequire(import.meta.url)
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { chromium } = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const ts = require("typescript")
const Module = require("node:module")
const resolve = Module._resolveFilename
Module._resolveFilename = function (id, ...args) { return resolve.call(this, id.startsWith("@/") ? path.join(project, id.slice(2)) : id, ...args) }
const transpile = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename)
require.extensions[".tsx"] = transpile
require.extensions[".ts"] = transpile
require.extensions[".css"] = () => {}
const React = require("react")
const { renderToString } = require("react-dom/server")
const { ChatExecution } = require(path.join(project, "components/sovereign/ChatExecution.tsx"))
const { settleExecution } = require(path.join(project, "lib/ai/chat-execution.ts"))
const sheets = [...readFileSync(path.join(project, "app/layout.tsx"), "utf8").matchAll(/import ["'](\.\/[^"']+\.css)["']/g)]
  .map(match => readFileSync(path.join(project, "app", match[1]), "utf8"))
for (const name of ["chat-live.css", "chat-execution.css", "live-activity.css"]) sheets.push(readFileSync(path.join(project, "components/sovereign", name), "utf8"))
const startedAt = Date.now()
const trace = { version: 1, id: "qa", startedAt, state: "running", steps: [
  { id: "qa:search", title: "Поиск материалов", kind: "search", state: "completed", startedAt, endedAt: startedAt,
    output: JSON.stringify({ sources: [{ url: "https://example.com/qa", title: "Контрольный источник" }] }) },
  { id: "qa:file", title: "Анализ загруженных материалов", kind: "file", state: "running", startedAt, input: "Контрольный файл" },
] }
const render = (trace, extra = {}) => renderToString(React.createElement(ChatExecution, { trace, live: true, workMode: true, ...extra }))
const browser = await chromium.launch({ headless: true })
async function motion(page, selector, pseudo) {
  return page.locator(selector).first().evaluate((el, pseudo) => {
    const s = getComputedStyle(el, pseudo)
    return { name: s.animationName, duration: parseFloat(s.animationDuration), loops: s.animationIterationCount,
      transform: s.transform, position: s.backgroundPosition, fill: s.webkitTextFillColor }
  }, pseudo)
}
try {
  for (const test of [{ width: 320 }, { width: 390 }, { width: 430 }, { width: 768 }, { width: 1440 }, { width: 390, reduce: true }]) {
    const page = await browser.newPage({ viewport: { width: test.width, height: 844 }, reducedMotion: test.reduce ? "reduce" : "no-preference" })
    await page.setContent(`<style>${sheets.join("\n")}</style><div id="malik-root"><div class="malik-dashboard-shell"><div class="malik-chat-fullwidth"><div class="malik-message-row-assistant"><div class="malik-ai-avatar is-working"></div><div class="malik-message-card-assistant" id="receipt">${render(trace)}</div></div></div></div></div>`)
    const label = ".malik-live-activity__label"
    const icon = ".malik-receipt.is-running .malik-receipt__heading > svg:first-child"
    const first = await motion(page, label)
    assert(await page.locator(label).isVisible())
    if (!test.reduce) {
      assert.equal(first.name, "malik-activity-shimmer"); assert.equal(first.duration, 1); assert.equal(first.loops, "infinite")
      assert.equal((await motion(page, ".malik-ai-avatar.is-working")).duration, 1.6)
      assert.equal((await motion(page, ".malik-ai-avatar.is-working", "::after")).duration, .9)
      const tool = await motion(page, icon)
      assert.equal(tool.duration, 1.35); assert.equal(tool.loops, "infinite")
      await page.waitForTimeout(230)
      assert.notEqual((await motion(page, label)).position, first.position)
      assert.notEqual((await motion(page, icon)).transform, tool.transform)
      assert.equal((await motion(page, ".malik-receipt.is-running .is-spinning")).duration, .95)
      assert.equal((await motion(page, ".malik-execution__source-chips svg")).duration, 2.4)
      if (test.width <= 1180) {
        await page.evaluate(() => document.documentElement.classList.add("malik-low-motion-runtime"))
        assert.equal((await motion(page, label)).duration, 1)
        assert.equal((await motion(page, icon)).duration, 1.35)
      }
    } else {
      assert(first.name === "none" || first.duration < .002)
      assert.notEqual(first.fill, "rgba(0, 0, 0, 0)", "Reduced-motion status must remain readable")
      assert((await motion(page, icon)).name === "none")
    }
    for (const [name, markup] of [["first text", render(trace, { writing: true })], ["completed", render(settleExecution(trace, "completed"))], ["cancelled", render(settleExecution(trace, "cancelled"))]]) {
      await page.locator("#receipt").evaluate((el, html) => { el.innerHTML = html }, markup)
      assert.equal(await page.locator(label).count(), 0, `${name}: thinking must disappear`)
    }
    await page.locator("#receipt").evaluate((el, html) => { el.innerHTML = html }, render(trace))
    assert(await page.locator(label).isVisible(), "New turn must restore thinking")
    console.log(`PASS ${test.width}${test.reduce ? " reduced-motion" : ""}: real component, CSS cascade, actual motion, lifecycle visibility`)
    await page.close()
  }
} finally { await browser.close() }
