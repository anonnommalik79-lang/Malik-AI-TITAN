// A phone must move like the computer while a request runs.
//
// Regression: on phones the spinner beside «Ход работы» (and other request
// loaders) stood still while the same screen on a computer was turning. Three
// performance passes freeze motion below 1180px or after slow frames, and
// they also caught the request indicators.
//
// Renders the real ChatExecution with the full stylesheet cascade from
// app/layout.tsx and compares computed animations and real motion at phone and
// desktop widths, with and without the low-FPS guard and reduced motion.
// Requires Playwright (or MALIK_QA_PLAYWRIGHT_PATH). No server, no providers.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
let engines
try { engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright") }
catch { console.log("SKIP request motion parity: Playwright is not installed"); process.exit(0) }
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

const sheets = [...readFileSync(path.join(project, "app/layout.tsx"), "utf8").matchAll(/import ["'](\.\/[^"']+\.css)["']/g)]
  .map((match) => readFileSync(path.join(project, "app", match[1]), "utf8"))
for (const name of ["chat-live.css", "chat-execution.css", "live-activity.css", "response-stages.css", "digital-browser.css"]) {
  sheets.push(readFileSync(path.join(project, "components/sovereign", name), "utf8"))
}
assert(sheets.some((sheet) => sheet.includes("REQUEST MOTION")), "request-motion-final.css must be imported by app/layout.tsx")

const startedAt = Date.now()
const trace = { version: 1, id: "qa", startedAt, state: "running", steps: [] }
const execution = renderToString(React.createElement(ChatExecution, { trace, live: true }))
assert(execution.includes("Ход работы") && execution.includes("is-spinning"), "a running request shows the spinner beside «Ход работы»")

const page = `<div id="malik-root"><div class="malik-dashboard-shell"><div class="malik-chat-fullwidth">
  <div class="malik-message-row malik-message-row-assistant"><div class="malik-ai-avatar is-working" style="width:36px;height:36px"></div>
    <div class="malik-message-card-assistant">${execution}
      <svg id="loader" class="animate-spin" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" stroke="white" fill="none"/></svg>
      <div class="malik-md malik-streaming"><p class="malik-md-p">Пишу ответ</p></div>
    </div></div></div></div></div>`

const indicators = {
  "spinner beside «Ход работы»": [".malik-execution__summary .is-spinning", undefined],
  "loader inside an answer": ["#loader", undefined],
  "ring around the Malik mark": [".malik-ai-avatar.is-working", "::after"],
  "streaming dot": [".malik-md.malik-streaming > :last-child", "::after"],
}

async function motion(tab, selector, pseudo) {
  return tab.locator(selector).first().evaluate((el, pseudo) => {
    const style = getComputedStyle(el, pseudo)
    return { name: style.animationName, duration: parseFloat(style.animationDuration), loops: style.animationIterationCount, transform: style.transform, opacity: style.opacity }
  }, pseudo)
}

const browser = await engines.chromium.launch({ headless: true })
try {
  for (const reduce of [false, true]) {
    const results = {}
    for (const width of [390, 768, 1440]) {
      for (const lowFps of [false, true]) {
        const tab = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: reduce ? "reduce" : "no-preference" })
        await tab.setContent(`<style>${sheets.join("\n")}</style>${page}`)
        if (lowFps) await tab.evaluate(() => document.documentElement.classList.add("malik-low-motion-runtime"))
        const key = `${width}${lowFps ? " low-FPS" : ""}`
        results[key] = {}
        for (const [label, [selector, pseudo]] of Object.entries(indicators)) {
          const first = await motion(tab, selector, pseudo)
          results[key][label] = first
          if (!reduce) {
            assert.notEqual(first.name, "none", `${label} must animate at ${key}`)
            assert.ok(first.duration >= 0.5, `${label} must keep its real speed at ${key} (got ${first.duration}s)`)
            assert.equal(first.loops, "infinite", `${label} must keep turning at ${key}`)
            await tab.waitForTimeout(170)
            const later = await motion(tab, selector, pseudo)
            assert.ok(later.transform !== first.transform || later.opacity !== first.opacity, `${label} must visibly move at ${key}`)
          }
        }
        await tab.close()
      }
    }
    if (!reduce) {
      // Every phone/tablet state matches the computer, spinner for spinner.
      for (const [key, measured] of Object.entries(results)) {
        for (const label of Object.keys(indicators)) {
          assert.equal(measured[label].duration, results["1440"][label].duration, `${label}: ${key} must match the computer`)
        }
      }
      console.log("PASS no-preference: phone, tablet and low-FPS guard move exactly like the computer")
    } else {
      // Reduced motion: the phone does what the computer does - spinners rest.
      for (const key of ["390", "768", "390 low-FPS"]) {
        const spin = results[key]["spinner beside «Ход работы»"]
        const desktop = results["1440"]["spinner beside «Ход работы»"]
        assert.ok((spin.name === "none" || spin.duration < 0.01) === (desktop.name === "none" || desktop.duration < 0.01), `reduced motion: ${key} must match the computer`)
      }
      console.log("PASS reduced motion: phone follows the same rule as the computer")
    }
  }
} finally { await browser.close() }
