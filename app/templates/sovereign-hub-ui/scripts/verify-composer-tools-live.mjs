// MALIK COMPOSER TOOLS — live browser checks against a running Malik AI.
//
// Uses the real guest home and chat. Only the network edges are stubbed in
// the page: the plugin status, the media library, the URL import and the
// chat stream, so no model, quota or provider is used.
//
//   MALIK_QA_BASE_URL=http://localhost:3000 node scripts/verify-composer-tools-live.mjs [width] [screenshot-dir]
//
// Without MALIK_QA_BASE_URL or Playwright it skips (it is not part of the build).
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const base = process.env.MALIK_QA_BASE_URL
if (!base) { console.log("SKIP live composer tool checks: set MALIK_QA_BASE_URL to a running app"); process.exit(0) }
let engines
try { engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright") } catch { console.log("SKIP live composer tool checks: Playwright is not installed"); process.exit(0) }
const width = Number(process.argv[2] || 1280)
const out = process.argv[3] || ""
const phone = width < 640
const shot = async (page, name) => { if (out) { fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, `${name}-${width}.png`) }) } }

const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
// Library images live on the storage's public https host, as in production.
const MEDIA = "https://media.malik-qa.test"
const tiles = { a1: ["#3b3b8f", "Город"], a2: ["#7a3b2e", "Пустыня"], a3: ["#2e6b4a", "Лес"] }
const tileSvg = ([fill, label]) => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${fill}"/><text x="150" y="160" font-size="34" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`
const library = [
  { id: "a1", src: `${MEDIA}/a1.svg`, prompt: "Ночной город в неоне", provider: "Malik Image", createdAt: "2026-10-01T10:00:00Z" },
  { id: "a2", src: `${MEDIA}/a2.svg`, prompt: "Пустыня на закате", provider: "Malik Image", createdAt: "2026-10-03T10:00:00Z" },
  { id: "a3", src: `${MEDIA}/a3.svg`, prompt: "Утренний туман в лесу", provider: "Malik Image", createdAt: "2026-10-05T10:00:00Z" },
]

const browser = await engines.chromium.launch()
const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 })
await ctx.addCookies([{ name: "malik-guest", value: "1", url: base }])
await ctx.route(`${MEDIA}/**`, (route) => route.fulfill({ contentType: "image/svg+xml", body: tileSvg(tiles[new URL(route.request().url()).pathname.slice(1, 3)] || ["#333", "?"]) }))
await ctx.addInitScript(({ library, PIXEL }) => {
  const real = window.fetch.bind(window)
  const enc = new TextEncoder()
  const ev = (type, rest = {}) => enc.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...rest })}\n\n`)
  const json = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } })
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url || String(input), location.href)
    const method = String(init.method || "GET").toUpperCase()
    if (url.pathname === "/api/plugins/status") {
      return json({ ok: true, plugins: [{ id: "github", state: "connected", accountName: "malik-dev" }, { id: "gmail", state: sessionStorage.getItem("qa.gmail") || "available" }] })
    }
    if (url.pathname === "/api/media/library") return json({ ok: true, configured: true, items: library, total: library.length, nextOffset: null })
    if (url.pathname === "/api/attachments/import-url" && method === "POST") return json({ ok: true, file: { base64: PIXEL, mime: "image/png", name: "library.png", size: 68 } })
    if ((url.pathname === "/api/stream" || url.pathname === "/api/stream/background") && method === "POST") {
      window.__lastStreamBody = String(init.body || "")
      const turnId = new Headers(init.headers || {}).get("x-malik-background-turn-id") || "6f1f8a8e-3c2b-4b7a-9f0e-0a1b2c3d4e5f"
      const stream = new ReadableStream({ start(c) {
        c.enqueue(ev("content", { content: "Ваши репозитории: malik-dev/titan." }))
        c.enqueue(ev("done", { provider: "mock", model: "mock", selectedModelId: "malik-max", sources: [], usedWeb: false })); c.close()
      } })
      return new Response(stream, { headers: { "content-type": "text/event-stream", "x-malik-background-turn-id": turnId } })
    }
    return real(input, init)
  }
}, { library, PIXEL })

// The Next.js dev badge sits where the phone composer's «+» is; it is not part of the app.
await ctx.addInitScript(() => {
  const hide = () => { const style = document.createElement("style"); style.textContent = "nextjs-portal{display:none!important}"; document.documentElement.append(style) }
  if (document.documentElement) hide(); else document.addEventListener("DOMContentLoaded", hide)
})
const page = await ctx.newPage()
const errors = []
page.on("pageerror", (error) => errors.push(error.message))
let failures = 0
const ok = (name, cond, extra = "") => { if (!cond) failures += 1; console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`) }

// GitHub/Gmail "connect" goes to the provider; here it comes straight back as connected.
await page.route("**/api/plugins/connect**", (route) => route.fulfill({ status: 302, headers: { location: `${base}/dashboard?plugin=gmail&plugin_status=connected` } }))

await page.goto(base + "/dashboard", { waitUntil: "load", timeout: 180000 })
const field = page.locator(".thome-composer textarea:visible").first()
await field.waitFor({ timeout: 120000 })
await page.waitForTimeout(1200)
const plus = page.locator(".thome-plus-button:visible").first()
const menu = page.locator("#malik-composer-tools")
const openMenu = async () => { await plus.click(); await menu.waitFor({ state: "visible", timeout: 5000 }); await page.waitForTimeout(250) }

// ---- the menu ---------------------------------------------------------
await field.fill("черновик вопроса")
await openMenu()
const groups = await menu.locator(".mct-group__label").allInnerTexts()
ok("menu has four groups", groups.map((text) => text.toLowerCase()).join("|") === "добавить|создать|режим ответа|подключения", groups.join("|"))
ok("menu has nine rows", (await menu.locator(".mct-item").count()) === 9)
await page.waitForFunction(() => document.querySelector('[data-tool="github"] .mct-badge')?.textContent === "Подключено", null, { timeout: 5000 }).catch(() => {})
ok("GitHub shows its live status and account", (await menu.locator('[data-tool="github"]').innerText()).includes("Подключено") && (await menu.locator('[data-tool="github"]').innerText()).includes("malik-dev"), (await menu.locator('[data-tool="github"]').innerText()).replace(/\n/g, " "))
ok("Gmail offers to connect", (await menu.locator('[data-tool="gmail"] .mct-badge').innerText()) === "Подключить")
ok("the menu fits the screen", await menu.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1 }))
if (phone) ok("on a phone the menu is a bottom sheet", await menu.evaluate((el) => el.classList.contains("is-sheet") && Math.abs(el.getBoundingClientRect().bottom - innerHeight) < 2))
const statusColour = await menu.locator('[data-tool="github"] .mct-badge').evaluate((el) => getComputedStyle(el).color)
ok("connected status is black and white", statusColour === "rgb(244, 244, 245)", statusColour)
await shot(page, "menu")

if (!phone) {
  ok("first row has keyboard focus", await page.evaluate(() => document.activeElement?.getAttribute("data-tool")) === "upload")
  await page.keyboard.press("ArrowDown")
  ok("ArrowDown moves to the next row", await page.evaluate(() => document.activeElement?.getAttribute("data-tool")) === "folder")
  await page.keyboard.press("End")
  ok("End jumps to the last row", await page.evaluate(() => document.activeElement?.getAttribute("data-tool")) === "gmail")
  await page.keyboard.press("g")
  ok("typing a letter jumps to a row", await page.evaluate(() => document.activeElement?.getAttribute("data-tool")) === "github")
  // A Russian layout: the key event carries the Cyrillic letter (after the type-ahead pause).
  await page.waitForTimeout(800)
  await page.evaluate(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "п", bubbles: true })))
  ok("a Cyrillic letter works too", await page.evaluate(() => document.activeElement?.getAttribute("data-tool")) === "folder")
  await page.keyboard.press("Escape")
  ok("Esc closes the menu and returns focus to +", !(await menu.isVisible()) && await page.evaluate(() => document.activeElement?.classList.contains("thome-plus-button")))
  await openMenu()
}

// ---- web search in place ----------------------------------------------
// On a phone the home has no chip row; the menu row itself shows the state.
const webChip = page.locator(".thome-chip:visible", { hasText: "Веб-поиск" })
const webState = async () => {
  if (await webChip.count()) return (await webChip.first().getAttribute("aria-pressed")) === "true"
  await openMenu()
  const on = (await menu.locator('[data-tool="web"]').getAttribute("aria-checked")) === "true"
  await page.keyboard.press("Escape"); if (await menu.isVisible()) await page.mouse.click(5, 5)
  await page.waitForTimeout(200)
  return on
}
const webWasOn = (await menu.locator('[data-tool="web"]').getAttribute("aria-checked")) === "true"
if (await webChip.count()) ok("the menu row mirrors the web search switch", String((await webChip.first().getAttribute("aria-pressed")) === "true") === String(webWasOn))
await menu.locator('[data-tool="web"]').click()
await page.waitForTimeout(300)
ok("choosing web search keeps the draft", (await field.inputValue()) === "черновик вопроса")
ok("no separate research screen opened", await page.locator('[aria-label="Поиск в сети"][role="dialog"]').count() === 0)
ok("web search switches in place", (await webState()) === !webWasOn)
await openMenu()
await menu.locator('[data-tool="web"]').click()
await page.waitForTimeout(200)
ok("choosing it again switches it back", (await webState()) === webWasOn)

// ---- GitHub: connected, so it becomes the chip ------------------------
await field.fill("")
await openMenu()
await menu.locator('[data-tool="github"]').click()
const chip = page.locator('[data-composer-connector="github"]:visible')
await chip.waitFor({ timeout: 5000 }).catch(() => {})
ok("GitHub becomes a chip in the composer", await chip.count() === 1)
ok("the field asks a GitHub question", ((await field.getAttribute("placeholder")) || "").includes("репозитори"), await field.getAttribute("placeholder"))
ok("starting questions are offered while the field is empty", (await chip.locator(".mct-suggestion").count()) === 3)
await shot(page, "github-chip")
await chip.locator(".mct-suggestion").first().click()
ok("a starting question fills the field", (await field.inputValue()) === "Мои последние репозитории")
await field.fill("")
await field.press("Backspace")
ok("Backspace in an empty field removes the chip", await page.locator('[data-composer-connector="github"]:visible').count() === 0)
await openMenu()
await menu.locator('[data-tool="github"]').click()
await page.locator('[data-composer-connector="github"]:visible').waitFor({ timeout: 5000 })
await field.fill("мои репозитории")
await field.press("Enter")
await page.waitForFunction(() => Boolean(window.__lastStreamBody), null, { timeout: 60000 }).catch(() => {})
const body = await page.evaluate(() => window.__lastStreamBody || "")
let sentQuestion = ""
try { sentQuestion = JSON.parse(body).originalQuestion || "" } catch {}
ok("the message goes to the GitHub plugin", sentQuestion === "/plugin github мои репозитории", sentQuestion || body.slice(0, 120))
await page.waitForFunction(() => document.body.innerText.includes("malik-dev/titan"), null, { timeout: 60000 }).catch(() => {})
const sent = page.locator('[data-malik-message="user"]').last()
const sentText = await sent.innerText().catch(() => "")
ok("the sent message shows «GitHub», not the command", (await sent.locator(".mct-sent-chip").count()) === 1 && !sentText.includes("/plugin") && sentText.includes("мои репозитории"), sentText.replace(/\n/g, " "))
if (!phone) ok("the chat list title reads «GitHub: …», not the command", await page.evaluate(() => { const text = document.querySelector("aside, nav")?.innerText || document.body.innerText; return text.includes("GitHub: мои") && !text.includes("/plugin github") }))
await shot(page, "sent-github")

// ---- chat composer: the same menu --------------------------------------
const chatPlus = page.locator('button[aria-controls="malik-composer-tools"]:visible').first()
await chatPlus.click()
await menu.waitFor({ state: "visible", timeout: 5000 })
ok("the chat composer opens the same menu", (await menu.locator(".mct-item").count()) === 9)
await menu.locator('[data-tool="deep"]').click()
await page.waitForTimeout(300)
const chatField = page.locator(".malik-composer-textarea:visible").first()
ok("deep research switches on in the chat composer", ((await chatField.getAttribute("placeholder")) || "").includes("исследовать"), await chatField.getAttribute("placeholder"))
ok("the research control shows it", phone
  ? await page.locator('[data-composer-research="deep"]:visible').count() === 1
  : await page.locator('.malik-v7-controls__research[aria-checked="true"]:visible').count() === 1 && await page.locator('[data-composer-research]:visible').count() === 0)
await shot(page, "chat-deep")

// ---- Gmail: not connected → OAuth → back with the chip on --------------
await chatPlus.click()
await menu.waitFor({ state: "visible", timeout: 5000 })
await page.evaluate(() => sessionStorage.setItem("qa.gmail", "connected"))
await Promise.all([page.waitForURL(/plugin_status=connected/u, { timeout: 30000 }), menu.locator('[data-tool="gmail"]').click()])
await page.waitForLoadState("load")
await page.locator('[data-composer-connector="gmail"]:visible').waitFor({ timeout: 60000 }).catch(() => {})
ok("after connecting, Gmail is switched on by itself", await page.locator('[data-composer-connector="gmail"]:visible').count() === 1)
ok("and says so in words", (await page.locator("[data-composer-notice]:visible").first().innerText().catch(() => "")).includes("Gmail подключён"))
await page.locator('[data-composer-connector="gmail"]:visible .mct-chip__close').click()
await page.waitForTimeout(300)

// ---- drawing pad -------------------------------------------------------
const field2 = page.locator("textarea:visible").first()
const plus2 = page.locator('button[aria-controls="malik-composer-tools"]:visible').first()
await plus2.click(); await menu.waitFor({ state: "visible" })
await menu.locator('[data-tool="draw"]').click()
const pad = page.locator(".mdp")
await pad.waitFor({ timeout: 5000 })
const attachButton = pad.getByRole("button", { name: "Прикрепить" })
ok("an empty sheet cannot be attached", await attachButton.isDisabled())
const swatches = await pad.locator(".mdp-swatch").evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
ok("the inks are shades of grey", swatches.length === 6 && swatches.every((value) => { const [r, g, b] = value.match(/\d+/g).map(Number); return r === g && g === b || Math.max(r, g, b) - Math.min(r, g, b) <= 12 }), swatches.join(" "))
const canvas = pad.locator(".mdp-paper canvas").last()
const r = await canvas.boundingBox()
const draw = async (points) => {
  await page.mouse.move(r.x + r.width * points[0][0], r.y + r.height * points[0][1])
  await page.mouse.down()
  for (const [x, y] of points.slice(1)) await page.mouse.move(r.x + r.width * x, r.y + r.height * y, { steps: 6 })
  await page.mouse.up()
}
await pad.locator('.mdp-swatch[aria-label="Графит"]').click()
await draw([[0.2, 0.3], [0.4, 0.5], [0.6, 0.35], [0.8, 0.6]])
await pad.getByRole("radio", { name: /Маркер/ }).click()
await pad.locator('.mdp-swatch[aria-label="Серебристый"]').click()
await draw([[0.15, 0.7], [0.85, 0.7]])
ok("after drawing, attach is enabled", !(await attachButton.isDisabled()))
const inked = await pad.locator(".mdp-paper canvas").nth(1).evaluate((el) => { const d = el.getContext("2d").getImageData(0, 0, el.width, el.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++; return n })
ok("strokes are on the canvas", inked > 200, String(inked))
await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z")
await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z")
await page.waitForTimeout(150)
ok("Ctrl+Z twice undoes both strokes", await attachButton.isDisabled())
await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+z" : "Control+Shift+z")
await page.waitForTimeout(150)
ok("Ctrl+Shift+Z redoes", !(await attachButton.isDisabled()))
await pad.getByRole("radio", { name: "Сетка" }).click()
await shot(page, "drawing")
await page.keyboard.press("Escape")
ok("Esc with an unsaved drawing asks first", (await pad.locator(".mdp-confirm").innerText().catch(() => "")).includes("не прикреплён"))
await pad.getByRole("button", { name: "Остаться" }).click()
await attachButton.click()
await pad.waitFor({ state: "detached", timeout: 10000 }).catch(() => {})
await page.waitForTimeout(800)
const drawnAttached = await page.evaluate(() => [...document.querySelectorAll("img")].some((img) => /malik-drawing-/u.test(img.alt || img.title || "") || /malik-drawing-/u.test(img.closest("[title]")?.getAttribute("title") || "")) || document.body.innerText.includes("malik-drawing-"))
ok("the drawing is attached to the message", drawnAttached)

// ---- library -----------------------------------------------------------
await plus2.click(); await menu.waitFor({ state: "visible" })
await menu.locator('[data-tool="library"]').click()
const picker = page.locator(".mlp")
await picker.waitFor({ timeout: 5000 })
await picker.locator(".mlp-tile").first().waitFor({ timeout: 5000 })
ok("the library shows saved images", (await picker.locator(".mlp-tile").count()) === 3)
await picker.locator(".mlp-search input").fill("закат")
ok("search narrows by description", (await picker.locator(".mlp-tile").count()) === 1)
await picker.locator(".mlp-search input").fill("")
await picker.locator(".mlp-tile").nth(0).click()
await picker.locator(".mlp-tile").nth(2).click()
ok("two images selected, numbered", (await picker.locator(".mlp-tile.is-on").count()) === 2 && (await picker.getByRole("button", { name: "Прикрепить 2" }).count()) === 1)
await shot(page, "library")
const pending = page.locator(".malik-composer-attachments:visible img, .thome-attachments:visible img")
const before = await pending.count()
await picker.getByRole("button", { name: "Прикрепить 2" }).click()
await picker.waitFor({ state: "detached", timeout: 10000 }).catch(() => {})
await page.waitForTimeout(800)
const after = await pending.count()
ok("both images are attached", after - before === 2, `${before} → ${after}`)

// ---- folder --------------------------------------------------------------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "malik-folder-"))
const proj = path.join(dir, "proj")
const write = (relative, text) => { fs.mkdirSync(path.dirname(path.join(proj, relative)), { recursive: true }); fs.writeFileSync(path.join(proj, relative), text) }
write("README.md", "# Проект\n")
write("src/index.ts", "export const x = 1\n")
write("src/util.ts", "export const y = 2\n")
write(".env", "SECRET=1\n")
write("node_modules/lib/index.js", "junk\n")
write(".git/config", "[core]\n")
const folderInput = page.locator("input[webkitdirectory]").first()
await page.evaluate(() => document.querySelectorAll(".malik-composer-attachments button[aria-label^='Убрать'], .thome-attachments button[aria-label^='Убрать']").forEach((button) => button.click()))
await folderInput.setInputFiles(proj)
await page.waitForFunction(() => [...document.querySelectorAll("[data-composer-notice]")].some((el) => el.textContent?.includes("Папка «proj»")), null, { timeout: 15000 }).catch(() => {})
const notice = await page.locator("[data-composer-notice]:visible").first().innerText().catch(() => "")
ok("a folder becomes one document, junk and secrets left out", notice.includes("3 файла в одном документе") && notice.includes("с ключами и паролями") && notice.includes("служебных"), notice)
ok("the document is attached as proj.md", (await page.evaluate(() => document.body.innerText)).includes("proj.md"))
await shot(page, "folder")
fs.rmSync(dir, { recursive: true, force: true })

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
ok("no horizontal page overflow", overflow <= 0, String(overflow))
ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "))
await browser.close()
console.log(`\n${failures ? `${failures} FAILED` : "all passed"} at ${width}px`)
process.exit(failures ? 1 : 0)
