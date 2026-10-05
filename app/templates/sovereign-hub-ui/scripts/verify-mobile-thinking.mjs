// Real progress component + full CSS cascade; no server/API/provider calls.
// Requires Playwright or MALIK_QA_PLAYWRIGHT_PATH for a bundled runtime.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const require = createRequire(import.meta.url)
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
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
// Receipts now live behind the per-answer disclosure. Keep the full-cascade
// animation assertions on an explicitly open panel; also verify its closed state.
const render = (trace, extra = {}) => renderToString(React.createElement(ChatExecution, { trace, live: true, workMode: true, defaultOpen: true, ...extra }))
const closed = render(trace, { defaultOpen: false })
assert(closed.includes("Ход работы") && closed.includes('aria-expanded="false"'))
assert(!closed.includes('class="malik-receipt '), "Closed disclosure must not mount tool payloads")
const nativeMotion = ts.transpileModule(readFileSync(path.join(project, "lib/ui/thinking-text-motion.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const bootstrap = `(function(){const exports={};${nativeMotion};window.startThinkingTextMotion=exports.startThinkingTextMotion;})()`
// Mount the real component as well, so a passing animation-helper test cannot
// conceal a missing effect/ref in the React waiting label. No bundler dependency.
const productionModule = (pkg, file) => readFileSync(path.join(path.dirname(require.resolve(pkg)), "cjs", file), "utf8")
const clientModules = {
  react: productionModule("react", "react.production.js"),
  "react/jsx-runtime": productionModule("react", "react-jsx-runtime.production.js"),
  scheduler: productionModule("scheduler", "scheduler.production.js"),
  "react-dom": productionModule("react-dom", "react-dom.production.js"),
  "react-dom/client": productionModule("react-dom", "react-dom-client.production.js"),
  "@/lib/ui/thinking-text-motion": nativeMotion,
  activity: ts.transpileModule(readFileSync(path.join(project, "components/sovereign/MalikLiveActivity.tsx"), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
}
const clientBootstrap = `(function(){const process={env:{NODE_ENV:"production"}},sources=${JSON.stringify(clientModules)},cache={};
function require(id){if(id.endsWith(".css"))return {};if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};
if(!sources[id])throw Error("Missing QA module "+id);new Function("module","exports","require","process",sources[id])(module,module.exports,require,process);return module.exports;}
window.qaReact=require("react");window.qaActivity=require("activity").MalikLiveActivity;
window.qaActivityRoot=require("react-dom/client").createRoot(document.getElementById("qa-react-activity"));
window.qaActivityRoot.render(window.qaReact.createElement(window.qaActivity));})()`
async function motion(page, selector, pseudo) {
  return page.locator(selector).first().evaluate((el, pseudo) => {
    const s = getComputedStyle(el, pseudo)
    return { name: s.animationName, duration: parseFloat(s.animationDuration), loops: s.animationIterationCount,
      transform: s.transform, position: s.backgroundPosition, fill: s.webkitTextFillColor, opacity: s.opacity }
  }, pseudo)
}
for (const engine of (process.env.MALIK_QA_ENGINES || "chromium").split(",")) {
const browser = await engines[engine].launch({ headless: true,
  ...(engine === "chromium" && process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
try {
  for (const test of [320, 390, 430, 768, 1440].flatMap(width => [{ width }, { width, reduce: true }])) {
    const page = await browser.newPage({ viewport: { width: test.width, height: 844 }, reducedMotion: test.reduce ? "reduce" : "no-preference" })
    await page.setContent(`<style>${sheets.join("\n")}</style><div id="malik-root"><div class="malik-dashboard-shell"><div class="malik-chat-fullwidth"><div class="malik-message-row-assistant"><div class="malik-ai-avatar is-working"></div><div class="malik-message-card-assistant" id="receipt">${render(trace)}</div></div></div></div></div>`)
    await page.bringToFront()
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
        const cue = await motion(page, ".malik-live-activity")
        assert.equal(cue.name, "malik-activity-soft-pulse"); assert.equal(cue.duration, 2.4)
        await page.waitForTimeout(230)
        assert.notEqual((await motion(page, ".malik-live-activity")).opacity, cue.opacity, "Mobile cue must not depend only on gradient repaint")
        await page.evaluate(() => document.documentElement.classList.add("malik-low-motion-runtime"))
        assert.equal((await motion(page, label)).duration, 1)
        assert.equal((await motion(page, icon)).duration, 1.35)
        assert.equal((await motion(page, ".malik-live-activity")).duration, 2.4)
      }
    } else if (test.width <= 1180) {
      assert.equal(first.name, "malik-activity-soft-pulse"); assert.equal(first.duration, 2.4); assert.equal(first.loops, "infinite")
      assert.notEqual(first.fill, "rgba(0, 0, 0, 0)", "Reduced-motion status must remain readable")
      assert.equal((await motion(page, ".malik-ai-avatar.is-working")).name, "none")
      assert.equal((await motion(page, ".malik-ai-avatar.is-working")).transform, "none")
      assert.equal((await motion(page, ".malik-ai-avatar.is-working", "::after")).name, "none")
      assert.equal((await motion(page, icon)).name, "none", "Reduced motion must not restore spinning tools")
      await page.waitForTimeout(600)
      const next = await motion(page, label)
      assert.notEqual(next.opacity, first.opacity, "Reduced-motion request must have live brightness feedback")
      assert(Number(next.opacity) >= .72, "Status must never disappear or flash")
      await page.evaluate(() => document.documentElement.classList.add("malik-low-motion-runtime"))
      assert.equal((await motion(page, label)).duration, 2.4, "Low-FPS guard must not freeze request feedback")
    } else {
      assert(first.name === "none" || first.duration < .002)
      assert.notEqual(first.fill, "rgba(0, 0, 0, 0)", "Reduced-motion status must remain readable")
      assert((await motion(page, icon)).name === "none")
    }
    await page.addScriptTag({ content: bootstrap })
    await page.evaluate(() => { window.stopThinkingTextMotion = window.startThinkingTextMotion(document.querySelector(".malik-live-activity")) })
    if (test.width <= 1180) {
      const wave = () => page.locator(".malik-live-activity__letter").evaluateAll(letters => letters.map(letter => ({
        opacity: Number(getComputedStyle(letter).opacity), animations: letter.getAnimations().filter(a => a.id.startsWith("malik-thinking-letter-")).map(a => ({ state: a.playState, duration: a.effect.getTiming().duration })),
      })))
      assert.equal(await page.locator(".malik-live-activity").getAttribute("data-malik-thinking-motion"), "wave")
      assert.equal((await motion(page, ".malik-live-activity")).opacity, "1", "Must animate letters, not pulse the entire label")
      await page.waitForTimeout(120)
      const before = await wave()
      assert.equal(before.length, Array.from("Думаю…").length)
      assert(before.every(letter => letter.animations.length === 1 && letter.animations[0].state === "running"))
      assert(before.every(letter => letter.animations[0].duration === (test.reduce ? 2800 : 1600)))
      assert(Math.max(...before.map(l => l.opacity)) - Math.min(...before.map(l => l.opacity)) > .1, "A visible wave must travel inside the word")
      const pixels = await page.locator(label).screenshot({ animations: "allow" })
      await page.waitForTimeout(250)
      assert.notDeepEqual((await wave()).map(l => l.opacity), before.map(l => l.opacity), "Native wave must keep changing despite CSS motion guards")
      assert.notDeepEqual(await page.locator(label).screenshot({ animations: "allow" }), pixels, "Actual text pixels must change, not only CSS metadata")
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true })
        document.dispatchEvent(new Event("visibilitychange"))
      })
      assert((await wave()).every(l => l.animations[0].state === "paused"), "Hidden tabs must not animate")
      await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")) })
      assert((await wave()).every(l => l.animations[0].state === "running"))
    } else {
      assert.equal(await page.locator(".malik-live-activity").getAttribute("data-malik-thinking-motion"), null, "Desktop must keep its existing CSS shimmer")
    }
    await page.evaluate(() => window.stopThinkingTextMotion())
    assert.equal(await page.locator(".malik-live-activity__letter").evaluateAll(letters => letters.flatMap(l => l.getAnimations()).filter(a => a.id.startsWith("malik-thinking-letter-")).length), 0, "Cleanup must cancel every native letter animation")
    for (const [name, markup] of [["first text", render(trace, { writing: true })], ["completed", render(settleExecution(trace, "completed"))], ["cancelled", render(settleExecution(trace, "cancelled"))]]) {
      await page.locator("#receipt").evaluate((el, html) => { el.innerHTML = html }, markup)
      assert.equal(await page.locator(label).count(), 0, `${name}: thinking must disappear`)
    }
    await page.locator("#receipt").evaluate((el, html) => { el.innerHTML = html }, render(trace))
    assert(await page.locator(label).isVisible(), "New turn must restore thinking")
    await page.evaluate(() => { window.stopThinkingTextMotion = window.startThinkingTextMotion(document.querySelector(".malik-live-activity")) })
    assert.equal(await page.locator(".malik-live-activity").getAttribute("data-malik-thinking-motion"), test.width <= 1180 ? "wave" : null)
    await page.evaluate(() => window.stopThinkingTextMotion())
    console.log(`PASS ${engine} ${test.width}${test.reduce ? " reduced-motion" : ""}: real component, text-pixel motion, low-FPS guard, cleanup, new turn`)
    await page.close()
  }
  const mounted = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await mounted.setContent(`<style>${sheets.join("\n")}</style><div id="malik-root"><div class="malik-dashboard-shell"><div id="qa-react-activity"></div></div></div>`)
  await mounted.evaluate(() => document.documentElement.classList.add("malik-low-motion-runtime"))
  await mounted.addScriptTag({ content: clientBootstrap })
  await mounted.locator('[data-malik-thinking-motion="wave"]').waitFor()
  assert.equal(await mounted.locator(".malik-live-activity__label").textContent(), "Думаю…")
  const running = await mounted.locator(".malik-live-activity__letter").evaluateAll(letters => {
    window.qaOriginalAnimations = letters.flatMap(l => l.getAnimations()).filter(a => a.id.startsWith("malik-thinking-letter-"))
    return window.qaOriginalAnimations.length
  })
  assert.equal(running, 6, "Real React effect must start the wave")
  await mounted.evaluate(() => window.qaActivityRoot.render(window.qaReact.createElement(window.qaActivity, { label: "Читаю файл…" })))
  await mounted.waitForFunction(() => document.querySelector(".malik-live-activity__label")?.textContent === "Читаю файл…" && window.qaOriginalAnimations.every(a => a.playState === "idle"))
  await mounted.setViewportSize({ width: 1440, height: 844 })
  await mounted.waitForFunction(() => !document.querySelector("[data-malik-thinking-motion='wave']"))
  await mounted.setViewportSize({ width: 390, height: 844 })
  await mounted.locator('[data-malik-thinking-motion="wave"]').waitFor()
  await mounted.evaluate(() => {
    window.qaUnmountAnimations = Array.from(document.querySelectorAll(".malik-live-activity__letter")).flatMap(l => l.getAnimations()).filter(a => a.id.startsWith("malik-thinking-letter-"))
    window.qaActivityRoot.unmount()
  })
  assert(await mounted.evaluate(() => window.qaUnmountAnimations.length > 0 && window.qaUnmountAnimations.every(a => a.playState === "idle")), "React unmount must cancel animations")
  assert.equal(await mounted.locator(".malik-live-activity").count(), 0)
  await mounted.close()
  console.log(`PASS ${engine}: real React mount, label update, responsive switch and unmount cleanup`)
} finally { await browser.close() }
}
