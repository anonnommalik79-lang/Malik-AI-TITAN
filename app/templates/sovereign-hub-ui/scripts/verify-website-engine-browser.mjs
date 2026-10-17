// Real React card -> HTTP -> production project handlers/queue -> compiler ->
// sandbox iframe -> interactions/navigation/export. Auth/storage/model/media
// transports are fixtures. This does NOT certify a live model or remote build.
import assert from "node:assert/strict"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { workTestLoader } from "./work-test-loader.mjs"
import { reactQaBundle, reactQaRuntime } from "./qa-react-bundle.mjs"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const values = new Map(); let revision = 0
const read = async key => structuredClone(values.get(key) || { value: null, etag: null })
const write = async (key, value, etag) => {
  if ((values.get(key)?.etag || null) !== etag) return { stored: false, conflict: true }
  values.set(key, { value: structuredClone(value), etag: String(++revision) }); return { stored: true, conflict: false }
}
const owner = { authenticated: true, userId: "browser-fixture", plan: "owner" }
let delayedModelJob = ""
const sources = theme => {
  const control = theme === "Automotive" ? '<label>Finish<select id="finish"><option value="0">Silver</option><option value="3000">Carbon</option></select></label><output id="price">100000 USD</output>' : theme === "Hotel" ? '<form id="booking"><label>Arrival<input required id="arrival" type="date"></label><button>Book demo</button><output id="confirmation"></output></form>' : '<button id="explore">Explore</button><output id="selection"></output>'
  const js = theme === "Automotive" ? 'document.querySelector("#finish").addEventListener("change",e=>document.querySelector("#price").textContent=(100000+Number(e.target.value))+" USD")' : theme === "Hotel" ? 'document.querySelector("#booking").addEventListener("submit",e=>{e.preventDefault();document.querySelector("#confirmation").textContent="Demo booking only — no reservation sent"})' : 'document.querySelector("#explore").onclick=()=>document.querySelector("#selection").textContent="Mission selected"'
  return [
    { path: "index.html", content: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${theme}</title><link rel="stylesheet" href="styles.css"></head><body><header><nav><a href="gallery.html">Gallery</a></nav></header><main><h1>${theme}</h1><p>Fixture content for end-to-end execution, not a claim of model design quality.</p>${control}${Array.from({ length: 8 }, (_, n) => `<section><h2>Chapter ${n + 1}</h2><p>Verified local interactive experience.</p></section>`).join("")}</main><script src="main.js"></script></body></html>` },
    { path: "styles.css", content: '*{box-sizing:border-box}html{color-scheme:dark}body{background:#08080a;color:#fafafa;margin:0;font:16px system-ui}header,main{padding:clamp(16px,4vw,60px);max-width:1200px;margin:auto}h1{font-size:clamp(36px,7vw,100px)}section{padding:2rem 0;border-bottom:1px solid #333}button,input,select{padding:12px;max-width:100%;font:inherit}a{color:inherit}label,output{display:block;padding:10px 0}@media(prefers-reduced-motion:reduce){*{animation:none!important}}' },
    { path: "main.js", content: js },
    { path: "gallery.html", content: `<!doctype html><html lang="en"><head><title>${theme} Gallery</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body><main><h1>${theme} Gallery</h1><a href="index.html">Home</a></main></body></html>` },
  ]
}
const load = workTestLoader({
  "@/lib/server/private-json-store": { privateJsonStoreConfigured: () => true, readPrivateJsonVersioned: read, writePrivateJsonConditional: write },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => owner },
  "@/lib/server/request-frequency": { takeRequestFrequency: () => true },
  "./model": { websiteModel: async (job, _system, prompt) => {
    if (job.originalPrompt.includes("PAUSE_TEST") && prompt.startsWith("Return JSON only:")) { delayedModelJob = job.id; await new Promise(resolve => setTimeout(resolve, 3500)) }
    const theme = /hypercar|авто/i.test(job.originalPrompt) ? "Automotive" : /hotel|отел/i.test(job.originalPrompt) ? "Hotel" : "Cosmic"
    const files = sources(theme)
    if (prompt.startsWith("Return JSON only:")) return JSON.stringify({ direction: theme.toLowerCase(), audience: "test audience", composition: "brief specific", typography: "editorial", palette: ["#08080a", "#fafafa"], spacing: "fluid", motion: "reduced motion", accessibility: ["keyboard"], performance: ["bounded"], stack: "static", sections: ["hero", "gallery"], interactions: ["navigation", "demo form"], files: files.map(file => ({ path: file.path, purpose: file.path })), mediaQueries: /фото.*видео/iu.test(job.originalPrompt) ? [{ slot: "hero-image", kind: "image", query: "cosmic nebula" }, { slot: "hero-video", kind: "video", query: "cosmic nebula" }] : [] })
    const file = files.find(file => prompt.startsWith(`Write ONE complete source file: ${file.path}.`))
    if (!file) throw new Error("Unexpected fixture model request")
    return JSON.stringify(file)
  } },
  "./media": { discoverAssets: async () => ({ assets: [], missing: [] }) },
  "./executor": { executeProject: async () => null },
})
const { websiteStore } = load("lib/website/engine/store.ts")
const { websiteChatTurn } = load("lib/website/engine/chat.ts")
const { websiteProjectsRequest } = load("lib/website/engine/http.ts")
const { withMediaPolicy } = load("lib/website/engine/resources.ts")
const code = load("app/api/work/code/route.ts")
const { modules, bundle } = reactQaBundle()
modules["next/dynamic"] = `exports.default=function(loader){var Component=require('react').lazy(function(){return loader().then(function(result){return {default:result.default||result}})});return function(props){var React=require('react');return React.createElement(React.Suspense,{fallback:React.createElement('p',null,'Loading source viewer…')},React.createElement(Component,props))}}`
const card = bundle("components/sovereign/work-code/WebsiteProjectCard.tsx")
const css = fs.readFileSync("components/sovereign/work-code/work-code-studio.css", "utf8")
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (url.pathname.startsWith("/work-preview/")) {
      const name = path.basename(url.pathname)
      res.setHeader("content-type", "application/javascript"); res.end(fs.readFileSync(path.join("public/work-preview", name))); return
    }
    if (url.pathname.startsWith("/api/")) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}) })
      const id = url.pathname.match(/^\/api\/website\/projects\/([^/]+)$/)?.[1]
      const response = url.pathname === "/api/work/code" ? await code.POST(request) : await websiteProjectsRequest(request, id)
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return
    }
    const id = url.searchParams.get("id")
    const boot = `${reactQaRuntime(modules)}require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(require(${JSON.stringify(card)}).WebsiteProjectCard,{id:${JSON.stringify(id)},active:true}));`.replace(/<\/script/giu, "<\\/script")
    res.setHeader("content-type", "text/html;charset=utf-8")
    res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:16px;background:#000;color:#fff;font:14px system-ui}.malik-md-codeblock{max-width:1100px;margin:auto;min-width:0;overflow:hidden}.malik-md-codebar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:12px;border:1px solid #333}.malik-md-p{overflow-wrap:anywhere}button,a{color:inherit}button,textarea,select{max-width:100%}ol{padding-inline-start:25px}</style></head><body><div id="root"></div><script>${boot}</script></body></html>`)
  } catch (error) { console.error(error.message); res.writeHead(500); res.end("QA fixture error") }
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
let browser
try {
  browser = await chromium.launch({ headless: true, ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
  const base = `http://127.0.0.1:${server.address().port}`
  for (const [width, theme, prompt] of [[1440, "Cosmic", "Создай космический сайт с 3D, фото и видео"], [390, "Automotive", "Build a hypercar website with configurator"], [768, "Hotel", "Build a hotel website with demo booking"]]) {
    const answer = await websiteChatTurn({ prompt, owner, modelId: "malik-max" })
    const id = JSON.parse(answer.match(/```malik-project\s+([\s\S]*?)```/)[1]).id
    assert.equal((await websiteStore.read(owner.userId, id)).state, "queued")
    const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true })
    const errors = []; page.on("pageerror", error => errors.push(error.message))
    await page.goto(`${base}/?id=${id}`)
    try { await page.locator(".wcs iframe").waitFor({ timeout: 45_000 }) }
    catch (error) {
      console.error("Browser fixture diagnostic:", JSON.stringify({ body: (await page.locator("body").innerText()).slice(0, 2200), errors, job: await websiteStore.read(owner.userId, id) }))
      throw error
    }
    let frame = page.frameLocator(".wcs iframe")
    await frame.getByRole("heading", { name: theme, exact: true }).waitFor()
    if (theme === "Cosmic") { await frame.getByRole("button", { name: "Explore", exact: true }).click(); await frame.getByText("Mission selected").waitFor() }
    if (theme === "Automotive") { await frame.getByLabel("Finish").selectOption("3000"); await frame.getByText("103000 USD").waitFor() }
    if (theme === "Hotel") { await frame.getByLabel("Arrival").fill("2026-11-10"); await frame.getByRole("button", { name: "Book demo" }).click(); await frame.getByText("Demo booking only — no reservation sent").waitFor() }
    await frame.getByRole("link", { name: "Gallery", exact: true }).click()
    frame = page.frameLocator(".wcs iframe")
    await frame.getByRole("heading", { name: `${theme} Gallery`, exact: true }).waitFor()
    await frame.getByRole("link", { name: "Home", exact: true }).click()
    await frame.getByRole("heading", { name: theme, exact: true }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    const save = page.waitForEvent("download")
    await page.getByRole("link", { name: "Скачать ZIP", exact: true }).click()
    const download = await save
    assert.match(download.suggestedFilename(), /\.zip$/)
    const stored = await websiteStore.read(owner.userId, id)
    assert.equal(stored.checks.build.status, "not_run")
    assert.equal(stored.state, "paused")
    assert.deepEqual(errors, [])
    if (process.env.MALIK_QA_OUTPUT) {
      fs.mkdirSync(process.env.MALIK_QA_OUTPUT, { recursive: true })
      await page.screenshot({ path: path.join(process.env.MALIK_QA_OUTPUT, `website-chat-${width}.png`), fullPage: true })
    }
    await page.reload(); await page.locator(".wcs iframe").waitFor(); await frame.getByRole("heading", { name: theme, exact: true }).waitFor()
    console.log(`PASS ${theme} ${width}px: real card/API/checkpoint/iframe/interaction/multi-page navigation/ZIP/reload; model/auth/storage fixtures, no sandbox build.`)
    await page.close()
  }
  for (const reduced of [false, true]) {
    const mediaPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? "reduce" : "no-preference" })
    const errors = []; mediaPage.on("pageerror", error => errors.push(error.message))
    // Real DOM/controller/IntersectionObserver/lifecycle, explicit media-method
    // fixture. This verifies policy, not MP4 decoding or visual model quality.
    await mediaPage.evaluate(() => {
      const playing = new WeakMap(); window.policyPlays = []; window.policyPauses = []
      Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get() { return !playing.get(this) } })
      HTMLMediaElement.prototype.play = function() { playing.set(this, true); window.policyPlays.push(this.id); return Promise.resolve() }
      HTMLMediaElement.prototype.pause = function() { playing.set(this, false); window.policyPauses.push(this.id) }
      const connection = new EventTarget(); connection.saveData = false
      Object.defineProperty(navigator, "connection", { configurable: true, value: connection })
    })
    const source = withMediaPolicy([{ path: "index.html", content: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><video id="hero" width="320" height="180" autoplay muted playsinline preload="metadata"></video><video id="detail" preload="metadata"></video><img alt="Original SVG" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E"><img alt="Original detail" src="data:image/svg+xml,%3Csvg/%3E"></body></html>' }])[0].content
    await mediaPage.setContent(source)
    await mediaPage.waitForFunction(() => window.__malikMediaPolicyV1 === true)
    assert.equal(await mediaPage.locator("#hero").getAttribute("preload"), "none")
    assert.equal(await mediaPage.locator("#detail").getAttribute("autoplay"), null)
    assert.equal(await mediaPage.locator("img").nth(1).getAttribute("loading"), "lazy")
    if (!reduced) {
      await mediaPage.waitForFunction(() => window.policyPlays.includes("hero"))
      await mediaPage.evaluate(() => { navigator.connection.saveData = true; navigator.connection.dispatchEvent(new Event("change")) })
      assert.equal(await mediaPage.evaluate(() => document.getElementById("hero").paused), true, "data-saving disables automatic playback")
      await mediaPage.evaluate(() => { navigator.connection.saveData = false; navigator.connection.dispatchEvent(new Event("change")) })
      assert.equal(await mediaPage.evaluate(() => document.getElementById("hero").paused), false)
    }
    else {
      await mediaPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert.deepEqual(await mediaPage.evaluate(() => window.policyPlays), [])
      await mediaPage.evaluate(() => { const video = document.getElementById("hero"); video.dispatchEvent(new PointerEvent("pointerdown")); video.play() })
      assert.equal(await mediaPage.evaluate(() => document.getElementById("hero").paused), false, "reduced motion still allows deliberate user playback")
    }
    await mediaPage.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")) })
    assert.equal(await mediaPage.evaluate(() => document.getElementById("hero").paused), true)
    await mediaPage.evaluate(() => { window.dispatchEvent(new Event("pagehide")); const video = document.createElement("video"); video.id = "later"; video.autoplay = true; video.preload = "auto"; document.body.append(video) })
    await mediaPage.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
    assert.equal(await mediaPage.locator("#later").getAttribute("preload"), "auto", "pagehide disconnects mutation processing")
    await mediaPage.evaluate(() => window.dispatchEvent(new Event("pageshow")))
    assert.equal(await mediaPage.locator("#later").getAttribute("preload"), "none", "back-forward restore reinstalls the policy")
    assert.deepEqual(errors, [])
    console.log(`PASS actual static media policy at 390px, reduced-motion=${reduced}: lazy/preload, data-saving, visibility pause, manual play, teardown and resume; media methods/connection preference are fixtures.`)
    await mediaPage.close()
  }
  const answer = await websiteChatTurn({ prompt: "Build a cosmic website PAUSE_TEST", owner, modelId: "malik-max" })
  const id = JSON.parse(answer.match(/```malik-project\s+([\s\S]*?)```/)[1]).id
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(`${base}/?id=${id}`)
  for (let n = 0; n < 60 && delayedModelJob !== id; n++) await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(delayedModelJob, id, "real stage request is waiting for the slow model fixture")
  assert.equal(await page.getByRole("button", { name: "Пауза", exact: true }).isEnabled(), true)
  await page.getByRole("button", { name: "Пауза", exact: true }).click()
  await page.getByText("Malik AI · Приостановлено", { exact: true }).waitFor()
  await page.getByRole("button", { name: "Отменить", exact: true }).click()
  await page.getByText("Malik AI · Отменено", { exact: true }).waitFor()
  assert.equal((await websiteStore.read(owner.userId, id)).state, "cancelled")
  console.log("PASS pause/cancel remain usable during a real in-flight stage; late model output cannot revive the cancelled job.")
  await page.close()
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
