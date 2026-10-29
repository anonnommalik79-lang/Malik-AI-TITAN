// The three acceptance games in a real browser (Chromium with WebGL through
// Playwright): each page is built by the studio pipeline, served locally,
// started with its Play button and controlled with the keyboard and mouse.
// Not part of the Render build — it needs a browser and the three.js CDN.
//   MALIK_QA_PLAYWRIGHT_PATH   path to playwright or playwright-core
//   MALIK_QA_CHROMIUM_EXECUTABLE   a Chromium binary (optional)
import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { createRequire } from "node:module"
import { workTestLoader } from "./work-test-loader.mjs"
import { BATTLE_ROYALE, PLATFORMER_2D, PROMPT_A, PROMPT_B, PROMPT_C, RUNNER_3D } from "./game-acceptance-fixtures.mjs"

const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const load = workTestLoader()
const { buildGame } = load("lib/games/studio.ts")
const { smokeRunGame } = load("lib/games/smoke.ts")
const { LOGIC_START, LOGIC_END } = load("lib/games/author.ts")
const shots = process.env.MALIK_QA_SHOTS || ""

async function page(prompt, fixture) {
  let calls = 0
  const result = await buildGame({ prompt, model: async () => (++calls === 1 ? "{}" : `${LOGIC_START}\n${fixture}\n${LOGIC_END}`), smoke: (plan, logic) => smokeRunGame(plan, logic, { budgetMs: 6000 }), polishUntil: Date.now() - 1 })
  assert.equal(result.ok, true, JSON.stringify(result.qa))
  return result.html
}

const pages = { "/a.html": await page(PROMPT_A, BATTLE_ROYALE), "/b.html": await page(PROMPT_B, RUNNER_3D), "/c.html": await page(PROMPT_C, PLATFORMER_2D) }
const server = http.createServer((req, res) => {
  if (req.url === "/favicon.ico") { res.writeHead(204); res.end(); return }
  const html = pages[req.url]; res.writeHead(html ? 200 : 404, { "content-type": "text/html; charset=utf-8" }); res.end(html || "")
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await playwright.chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"], ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
let failures = 0
async function check(name, run) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const tab = await context.newPage()
  const errors = []
  tab.on("pageerror", (error) => errors.push(String(error)))
  tab.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  try {
    await run(tab)
    assert.deepEqual(errors, [], "no JavaScript errors in the page")
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures++
    console.log(`  FAIL ${name}\n       ${String(error && error.message || error).split("\n").slice(0, 6).join("\n       ")}`)
  } finally {
    if (shots) await tab.screenshot({ path: path.join(shots, `${name.slice(0, 1).toLowerCase()}.png`) }).catch(() => {})
    await context.close()
  }
}
const play = async (tab) => {
  await tab.click("button[data-act=play]")
  await tab.waitForTimeout(1500)
}
const qa = (tab) => tab.evaluate(() => window.MalikGame.qa())

await check("A — 3D battle royale renders, moves, shoots and runs its bots", async (tab) => {
  await tab.goto(`${base}/a.html`, { waitUntil: "load" })
  await tab.waitForFunction(() => window.THREE && window.MalikGame && window.MalikGame.qa, null, { timeout: 30000 })
  await play(tab)
  const first = await qa(tab)
  assert.equal(first.state, "playing")
  assert.ok(first.drawCalls > 20 && first.triangles > 5000, `rendered ${first.drawCalls} draw calls, ${first.triangles} triangles`)
  assert.ok(first.bots >= 12 && first.meshes > 100, `${first.bots} bots, ${first.meshes} meshes`)
  await tab.mouse.move(640, 360)
  await tab.keyboard.down("KeyW"); await tab.waitForTimeout(900); await tab.keyboard.up("KeyW")
  await tab.mouse.down(); await tab.waitForTimeout(900); await tab.mouse.up()
  const second = await qa(tab)
  const moved = Math.hypot(second.player.x - first.player.x, second.player.z - first.player.z)
  assert.ok(moved > 2, `the hero walked ${moved.toFixed(1)} m`)
  assert.ok(second.shots > first.shots, `fired ${second.shots - first.shots} shots`)
  assert.ok(second.frames > first.frames + 5, `the loop keeps running (${second.frames - first.frames} frames on software WebGL)`)
  const hud = await tab.evaluate(() => ({ health: !document.getElementById("hud-health").hidden, ammo: document.getElementById("hud-ammo").textContent, alive: document.getElementById("hud-alive").textContent, map: !document.getElementById("hud-map").hidden }))
  assert.ok(hud.health && /\d+ \/ \d+/.test(hud.ammo) && /\d/.test(hud.alive) && hud.map, JSON.stringify(hud))
})

await check("B — 3D endless runner renders, switches lanes and scores", async (tab) => {
  await tab.goto(`${base}/b.html`, { waitUntil: "load" })
  await tab.waitForFunction(() => window.THREE && window.MalikGame && window.MalikGame.qa, null, { timeout: 30000 })
  await play(tab)
  const lane = () => tab.evaluate(() => window.MalikGame.core.api.scene.children.find((o) => o.userData && o.userData.limbs).position.x)
  const first = await qa(tab)
  assert.ok(first.drawCalls > 10, `rendered ${first.drawCalls} draw calls`)
  await tab.keyboard.press("ArrowLeft"); await tab.waitForTimeout(400)
  const left = await lane()
  assert.ok(left < -2, `lane x after ← is ${left.toFixed(2)}`)
  await tab.keyboard.press("ArrowRight"); await tab.waitForTimeout(200); await tab.keyboard.press("ArrowRight"); await tab.waitForTimeout(600)
  const right = await lane()
  assert.ok(right > 2, `lane x after → → is ${right.toFixed(2)}`)
  const later = await qa(tab)
  assert.ok(later.score > 0 || later.state === "over", `score ${later.score}, state ${later.state}`)
})

await check("C — 2D platformer draws, runs and jumps", async (tab) => {
  await tab.goto(`${base}/c.html`, { waitUntil: "load" })
  await play(tab)
  const pixels = () => tab.evaluate(() => { const c = document.getElementById("game"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let h = 0, distinct = new Set(); for (let i = 0; i < d.length; i += 97) { h = (h * 31 + d[i]) | 0; distinct.add(d[i] >> 4) } return { h, distinct: distinct.size } })
  const before = await pixels()
  assert.ok(before.distinct > 4, "the canvas is drawn, not blank")
  await tab.keyboard.down("ArrowRight"); await tab.keyboard.press("ArrowUp"); await tab.waitForTimeout(1200); await tab.keyboard.up("ArrowRight")
  const after = await pixels()
  assert.notEqual(after.h, before.h, "the picture changes as the hero runs")
})

await browser.close()
server.close()
console.log(failures ? `\n${failures} browser check(s) failed` : "\nall browser game checks passed")
process.exit(failures ? 1 : 0)
