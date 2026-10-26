// Real rendered Voice controls, with model traffic and microphone capture blocked.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const origin = new URL(process.env.MALIK_AUDIT_URL || "http://127.0.0.1:3000").origin
const output = path.resolve(process.env.MALIK_AUDIT_OUTPUT || ".data/voice-ui")
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE })
try {
  for (const width of [375, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.route("**/api/voice/**", (route) => route.fulfill({ status: 503, json: { ok: false, error: "qa_offline_voice" } }))
    await context.addInitScript(() => {
      window.__voiceCaptureFailure = "NotAllowedError"
      window.__voiceCaptureCalls = 0
      navigator.mediaDevices.getUserMedia = async () => {
        window.__voiceCaptureCalls++
        throw new DOMException("Controlled QA capture error", window.__voiceCaptureFailure)
      }
    })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.setDefaultTimeout(20000)
    // Use the real guest endpoint/cookie. Production builds intentionally
    // redirect to the canonical host; keep this isolated QA browser local.
    const entry = await context.request.get(`${origin}/guest`, { maxRedirects: 0 })
    assert.ok([302, 303, 307, 308].includes(entry.status()))
    const target = new URL(entry.headers().location, origin)
    assert.equal(target.pathname, "/dashboard")
    await page.goto(`${origin}${target.pathname}${target.search}`, { waitUntil: "domcontentloaded", timeout: 90000 })
    if (width < 980) await page.getByRole("button", { name: "Меню", exact: true }).click()
    const sidebar = width < 980 ? page.locator('.malik-mobile-drawer[data-open="true"] .malik-sidebar') : page.locator(".malik-sidebar").filter({ visible: true })
    await sidebar.getByRole("button", { name: "Голосовой режим", exact: true }).click()
    const voice = page.getByRole("dialog", { name: "Malik AI Voice Mode", exact: true })
    await voice.waitFor({ state: "visible" })
    // Voice requests the microphone automatically on entry (240ms delay).
    await voice.getByText("Разреши доступ к микрофону", { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__voiceCaptureCalls), 1, "permission denial retried")
    await page.evaluate(() => { window.__voiceCaptureFailure = "NotReadableError" })
    await voice.getByRole("button", { name: "Включить микрофон", exact: true }).click()
    await voice.getByText("Микрофон недоступен", { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__voiceCaptureCalls), 2, "device failure retried")
    const bounds = await voice.boundingBox()
    assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, "Voice overflows viewport")
    await page.screenshot({ path: path.join(output, `voice-${width}.png`) })
    await voice.getByRole("button", { name: "Закрыть голосовой режим", exact: true }).click()
    await voice.waitFor({ state: "hidden" })
    assert.deepEqual(errors, [], "uncaught browser errors")
    console.log(`PASS Voice ${width}px: open, permission denial, device failure, no repeated prompt, viewport, close, no page errors; model calls blocked`)
    await context.close()
  }
} finally { await browser.close() }
