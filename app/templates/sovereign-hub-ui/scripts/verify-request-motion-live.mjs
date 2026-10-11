// Live: after an ordinary request the phone turns the same indicators as the
// computer - the spinner beside «Ход работы» and the ring around the Malik
// mark - also with «Remove animations» / reduced motion on; and a request that
// says not to make a picture never opens the photo card.
//
//   MALIK_QA_BASE_URL=http://localhost:3000 node scripts/verify-request-motion-live.mjs
//
// The /api/stream call is stubbed in the page; no model is used.
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const base = process.env.MALIK_QA_BASE_URL
if (!base) { console.log("SKIP live request motion: set MALIK_QA_BASE_URL to a running app"); process.exit(0) }
let engines
try { engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright") } catch { console.log("SKIP live request motion: Playwright is not installed"); process.exit(0) }

const VIDEO_PROMPT = "Я НЕ прошу генерировать изображение.\n\nОбъясни научно, почему единорог с крыльями, массой 500 кг и размахом крыльев 2 метра не смог бы летать на Земле.\n\nВАЖНО: не запускай генерацию фото или видео. Я прошу исключительно текстовый научный ответ."
let failures = 0
const ok = (name, condition, extra = "") => { if (!condition) failures += 1; console.log(`${condition ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`) }

const browser = await engines.chromium.launch()
for (const [width, motion] of [[390, "reduce"], [390, "no-preference"], [1280, "reduce"], [1280, "no-preference"]]) {
  const label = `${width}px, ${motion === "reduce" ? "reduced motion" : "normal motion"}`
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: 2, reducedMotion: motion })
  await ctx.addCookies([{ name: "malik-guest", value: "1", url: base }])
  await ctx.addInitScript(() => {
    const real = window.fetch.bind(window); const enc = new TextEncoder()
    const ev = (type, rest = {}) => enc.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...rest })}\n\n`)
    window.__streamPosts = 0
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url || String(input), location.href)
      if ((url.pathname === "/api/stream" || url.pathname === "/api/stream/background") && String(init.method || "GET").toUpperCase() === "POST") {
        window.__streamPosts += 1
        const signal = init.signal
        const stream = new ReadableStream({ async start(c) {
          c.enqueue(ev("status", { text: "Malik AI принял запрос" })); c.enqueue(ev("progress", { phase: "thinking", text: "Думает…" }))
          await new Promise((r) => setTimeout(r, 4000))
          for (let i = 0; i < 40 && !signal?.aborted; i++) { c.enqueue(ev("content", { content: `Слово ${i}. ` })); await new Promise((r) => setTimeout(r, 40)) }
          c.enqueue(ev("done", { provider: "mock", model: "mock", selectedModelId: "malik-max", sources: [] })); try { c.close() } catch {}
        } })
        return new Response(stream, { headers: { "content-type": "text/event-stream", "x-malik-background-turn-id": crypto.randomUUID() } })
      }
      return real(input, init)
    }
  })
  const page = await ctx.newPage()
  await page.goto(base + "/dashboard", { waitUntil: "load", timeout: 180000 })
  const box = page.locator("textarea").first(); await box.waitFor({ timeout: 120000 }); await page.waitForTimeout(1500)
  await box.fill(VIDEO_PROMPT); await page.keyboard.press("Enter")
  await page.waitForTimeout(1800)
  ok(`${label}: «не генерируй изображение» goes to the chat, not the photo card`, !(await page.evaluate(() => document.body.innerText.includes("Создать изображение?"))) && await page.evaluate(() => window.__streamPosts) === 1)
  const read = () => page.evaluate(() => {
    const spin = document.querySelector("#malik-root .malik-execution .is-spinning")
    const avatar = document.querySelector("#malik-root .malik-ai-avatar.is-working")
    return { spin: spin ? getComputedStyle(spin).transform : "absent", ring: avatar ? getComputedStyle(avatar, "::after").transform : "absent" }
  })
  const first = await read(); await page.waitForTimeout(260); const later = await read()
  ok(`${label}: the spinner beside «Ход работы» turns`, first.spin !== "absent" && first.spin !== later.spin, `${first.spin} → ${later.spin}`)
  ok(`${label}: the ring around the Malik mark turns`, first.ring !== "absent" && first.ring !== later.ring, `${first.ring} → ${later.ring}`)
  await page.waitForFunction(() => document.body.innerText.includes("Слово 39."), null, { timeout: 30000 }); await page.waitForTimeout(1500)
  ok(`${label}: nothing keeps turning after the answer`, await page.evaluate(() => document.getAnimations().filter((animation) => animation.id === "malik-request-keeper").length) === 0)
  await ctx.close()
}
await browser.close()
console.log(failures ? `\n${failures} FAILED` : "\nall live request motion checks passed")
process.exit(failures ? 1 : 0)
