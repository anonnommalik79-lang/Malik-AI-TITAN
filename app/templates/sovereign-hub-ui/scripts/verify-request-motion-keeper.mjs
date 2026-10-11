// The request spinners keep turning on every phone.
//
// Regression (owner's screen recording): on a computer the spinner beside
// «Ход работы» and the ring around the Malik mark turn while a request runs;
// on the owner's phone they stood still. Phones that save battery or have
// «Remove animations» on report prefers-reduced-motion, and every CSS layer
// then freezes the indicators. lib/ui/request-motion-keeper.ts turns them
// with the Web Animations API whenever no animation is running on them.
//
// Real ChatExecution markup, the full stylesheet cascade from app/layout.tsx,
// the real keeper module; phone and computer, reduced motion, the low-FPS
// guard and a hostile `animation: none` everywhere. Requires Playwright.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
let engines
try { engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright") }
catch { console.log("SKIP request motion keeper: Playwright is not installed"); process.exit(0) }
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
const layout = readFileSync(path.join(project, "app/layout.tsx"), "utf8")
assert.match(layout, /<RequestMotionKeeper \/>/, "the keeper is mounted on every page")

// The keeper itself, as the browser runs it (exports become globals).
const keeper = ts.transpileModule(readFileSync(path.join(project, "lib/ui/request-motion-keeper.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText
const run = (code) => `(() => { const exports = {}; ${keeper}\n${code} })()`

const trace = { version: 1, id: "qa", startedAt: Date.now(), state: "running", steps: [] }
const execution = renderToString(React.createElement(ChatExecution, { trace, live: true }))
assert(execution.includes("is-spinning"), "a running request shows the spinner beside «Ход работы»")
const page = `<div id="malik-root"><div class="malik-dashboard-shell"><div class="malik-chat-fullwidth">
  <div class="malik-message-row malik-message-row-assistant"><div id="avatar" class="malik-ai-avatar is-working" style="width:36px;height:36px"></div>
    <div class="malik-message-card-assistant">${execution}</div></div></div></div></div>`

// A freeze stronger than every rule in the app (as an unknown phone browser
// or a future stylesheet might add): ids beat the request-motion overrides.
const HOSTILE = "<style>#malik-root#malik-root *, #malik-root#malik-root *::before, #malik-root#malik-root *::after, #malik-root #avatar.malik-ai-avatar.is-working.is-working.is-working::after { animation: none !important }</style>"
const turn = (tab, selector, pseudo) => tab.locator(selector).first().evaluate((el, pseudo) => getComputedStyle(el, pseudo).transform, pseudo)
const owned = (tab) => tab.evaluate(() => document.getAnimations().filter((animation) => animation.id === "malik-request-keeper" && animation.playState === "running").length)

const scenarios = [
  { name: "phone, reduced motion", width: 390, reduce: true },
  { name: "phone, reduced motion + low-FPS guard", width: 390, reduce: true, lowFps: true },
  { name: "phone, every animation frozen by CSS", width: 390, reduce: false, hostile: true },
  { name: "tablet, reduced motion", width: 768, reduce: true },
  { name: "computer, reduced motion", width: 1440, reduce: true },
]

const browser = await engines.chromium.launch({ headless: true })
let checks = 0
try {
  for (const scenario of scenarios) {
    const tab = await browser.newPage({ viewport: { width: scenario.width, height: 844 }, reducedMotion: scenario.reduce ? "reduce" : "no-preference" })
    await tab.setContent(`<style>${sheets.join("\n")}</style>${scenario.hostile ? HOSTILE : ""}${page}`)
    if (scenario.lowFps) await tab.evaluate(() => document.documentElement.classList.add("malik-low-motion-runtime"))
    await tab.addScriptTag({ content: run("window.__stopKeeper = exports.startRequestMotionKeeper(document);") })
    await tab.waitForTimeout(400)
    for (const [label, selector, pseudo] of [["spinner beside «Ход работы»", ".malik-execution__summary .is-spinning", undefined], ["ring around the Malik mark", "#avatar", "::after"]]) {
      const first = await turn(tab, selector, pseudo)
      await tab.waitForTimeout(230)
      const later = await turn(tab, selector, pseudo)
      assert.notEqual(later, first, `${scenario.name}: the ${label} must turn (${first} → ${later})`)
      checks += 1
    }
    assert.ok(await owned(tab) >= 2, `${scenario.name}: the keeper turned the frozen indicators`)
    // When the request ends the ring goes, and so does the keeper's animation.
    await tab.evaluate(() => document.getElementById("avatar").classList.remove("is-working"))
    await tab.waitForTimeout(400)
    const ring = await tab.evaluate(() => document.getAnimations().filter((animation) => animation.id === "malik-request-keeper" && animation.effect?.pseudoElement === "::after").length)
    assert.equal(ring, 0, `${scenario.name}: a finished request leaves no animation behind`)
    await tab.evaluate(() => window.__stopKeeper())
    assert.equal(await owned(tab), 0, `${scenario.name}: stopping the keeper cancels what it started`)
    checks += 2
    await tab.close()
    console.log(`PASS ${scenario.name}`)
  }

  // Where CSS already turns them (a computer, no reduced motion) nothing is added.
  const tab = await browser.newPage({ viewport: { width: 1440, height: 844 }, reducedMotion: "no-preference" })
  await tab.setContent(`<style>${sheets.join("\n")}</style>${page}`)
  await tab.addScriptTag({ content: run("exports.startRequestMotionKeeper(document);") })
  await tab.waitForTimeout(400)
  assert.equal(await owned(tab), 0, "running CSS spinners are left alone")
  await tab.close()
  // No request on screen: the keeper starts nothing.
  const idle = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
  await idle.setContent(`<style>${sheets.join("\n")}</style><div id="malik-root"><div class="malik-dashboard-shell"><p>Привет</p></div></div>`)
  await idle.addScriptTag({ content: run("exports.startRequestMotionKeeper(document);") })
  await idle.waitForTimeout(400)
  assert.equal(await owned(idle), 0, "without a request nothing turns")
  await idle.close()
  checks += 2
  console.log("PASS a computer with working CSS and an idle page are left alone")
} finally { await browser.close() }
console.log(`\n${checks} request motion keeper checks passed`)
