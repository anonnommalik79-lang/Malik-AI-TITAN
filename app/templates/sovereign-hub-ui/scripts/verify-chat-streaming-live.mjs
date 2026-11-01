// How the chat feels after a message is sent, in the real app: streaming,
// following and not following the newest line, waiting / writing / done /
// error states, Stop, Regenerate and Copy, at 375, 768 and 1440 px.
//
// The app runs as it is (a dev or production server); only /api/stream is
// replaced inside the page by a scripted SSE stream with real pauses between
// chunks, shaped like the server's own events. No model, no backend change.
//   MALIK_QA_BASE_URL   the running app (default http://localhost:3017)
//   MALIK_QA_PLAYWRIGHT_PATH   path to playwright or playwright-core
//   MALIK_QA_CHROMIUM_EXECUTABLE   a Chromium binary (optional)
//   MALIK_QA_OUTPUT   a folder for screenshots (optional)
//   MALIK_QA_ONLY   run only checks whose name contains this text (optional)
//   MALIK_QA_WIDTHS   comma-separated widths (default 375,768,1440)
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const BASE = (process.env.MALIK_QA_BASE_URL || "http://localhost:3017").replace(/\/$/, "")
const OUT = process.env.MALIK_QA_OUTPUT || ""
const ONLY = process.env.MALIK_QA_ONLY || ""

// ---- answers ---------------------------------------------------------------
const SHORT = "Привет! Это короткий ответ: он приходит словами, без скачков и мигания, а в конце остаётся целиком."
const words = (text) => text.match(/\S+\s*/g)
function longAnswer() {
  const parts = ["## Подробный разбор\n\nНиже — длинный ответ с заголовками, списками, таблицей и кодом, чтобы проверить, как чат держит большой поток.\n"]
  for (let section = 1; section <= 9; section += 1) {
    parts.push(`\n### Раздел ${section}\n\n`)
    parts.push(`Это абзац номер ${section}. Он достаточно длинный, чтобы занять несколько строк на телефоне и на компьютере, и содержит **жирный текст**, \`код в строке\` и обычные слова, которые приходят по одному.\n\n`)
    parts.push(`- Пункт ${section}.1 — первая мысль раздела\n- Пункт ${section}.2 — вторая мысль раздела\n- Пункт ${section}.3 — третья мысль раздела\n`)
    if (section === 3) parts.push("\n| Показатель | Значение | Комментарий |\n| --- | --- | --- |\n| Скорость | 120 мс | быстро |\n| Память | 48 МБ | норма |\n| Кадры | 60 FPS | плавно |\n| Ошибки | 0 | нет |\n")
    if (section === 6) parts.push("\n```ts filename=example.ts\nexport function sum(values: number[]) {\n  let total = 0\n  for (const value of values) total += value\n  return total\n}\n\nconsole.log(sum([1, 2, 3]))\n```\n")
  }
  parts.push("\nИтог: длинный ответ дописан до конца.")
  return parts.join("")
}
const LONG = longAnswer()
const REGENERATED = "Новый вариант ответа после перегенерации: другой текст, тот же вопрос."

// ---- the page --------------------------------------------------------------
/**
 * Replaces the chat stream with a scripted SSE stream; everything else goes to
 * the app. The app's own wrapper (AccountChatPersistence) still runs on top:
 * it turns POST /api/stream into POST /api/stream/background with a turn id,
 * and Stop cancels its controller and sends DELETE /api/stream/background/<id>.
 */
function installFakeStream() {
  const realFetch = window.fetch.bind(window)
  const qa = window.__qa = { queue: [], requests: 0, aborted: 0, stops: 0 }
  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const method = String(init.method || (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase()
    if (/\/api\/stream\/background\/[^/?]+/.test(url)) {
      if (method === "DELETE") qa.stops += 1
      return Promise.resolve(new Response(null, { status: method === "DELETE" ? 204 : 404 }))
    }
    if (!/\/api\/stream(?:\/background)?(?:\?|$)/.test(url) || method !== "POST") return realFetch(input, init)
    qa.requests += 1
    const plan = qa.queue.shift() || { chunks: ["Ответ."] }
    const signal = init.signal
    const encoder = new TextEncoder()
    const traceId = `qa-${qa.requests}`
    const startedAt = Date.now()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event, data) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        // A real fetch aborted with a reason errors its body with that very reason.
        const reason = () => signal?.reason ?? new DOMException("The operation was aborted.", "AbortError")
        const wait = (ms) => new Promise((resolve, reject) => {
          if (signal?.aborted) { reject(reason()); return }
          const timer = setTimeout(resolve, ms)
          signal?.addEventListener("abort", () => { clearTimeout(timer); reject(reason()) }, { once: true })
        })
        const step = (id, title, state, kind = "status") => ({ id: `${traceId}:${id}`, title, kind, state, startedAt, ...(state === "running" ? {} : { endedAt: Date.now() }) })
        try {
          send("activity", { type: "activity", traceId, startedAt, step: step(1, "Обработка запроса", "running") })
          send("status", { type: "status", text: "Malik AI принял запрос" })
          send("progress", { type: "progress", phase: "thinking", text: "Думает…" })
          await wait(plan.thinkMs ?? 500)
          send("activity", { type: "activity", traceId, startedAt, step: step(2, "Ответ поступает в чат", "completed") })
          send("progress", { type: "progress", phase: "writing", text: "Пишет ответ…" })
          for (const chunk of plan.chunks) {
            send("content", { type: "content", content: chunk, contentMode: "delta" })
            await wait(plan.everyMs ?? 25)
          }
          if (plan.error) {
            send("error", { type: "error", message: plan.error })
            controller.close()
            return
          }
          if (plan.cut) { controller.close(); return }
          const endedAt = Date.now()
          send("done", { type: "done", tookMs: endedAt - startedAt, execution: { version: 1, id: traceId, startedAt, endedAt, state: "completed", steps: [{ ...step(1, "Обработка запроса", "completed"), endedAt }, step(2, "Ответ поступает в чат", "completed")] } })
          controller.close()
        } catch (error) {
          qa.aborted += 1
          try { controller.error(error) } catch { /* already closed */ }
        }
      },
    })
    return Promise.resolve(new Response(stream, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } }))
  }

  // Per-frame samples of the newest answer and the thread while it streams.
  window.__qaSampler = {
    samples: [], longTasks: [], running: false,
    start() {
      this.samples = []; this.longTasks = []; this.running = true
      try {
        this.observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) this.longTasks.push(Math.round(entry.duration)) })
        this.observer.observe({ type: "longtask", buffered: false })
      } catch { /* longtask is Chromium-only */ }
      // Measured after the frame is painted (a task after the rendering step),
      // so a correction made by a ResizeObserver in the same frame counts as seen.
      const tick = () => setTimeout(() => this.sample(performance.now()), 0)
      this.sample = (now) => {
        if (!this.running) return
        const thread = document.querySelector("[data-message-list]")
        const rows = document.querySelectorAll('[data-malik-message="assistant"]')
        const row = rows[rows.length - 1]
        const card = row?.querySelector(".malik-message-card")
        this.samples.push({
          t: Math.round(now),
          length: card ? (card.querySelector(".malik-md")?.textContent || "").length : 0,
          top: thread ? Math.round(thread.scrollTop) : 0,
          away: thread ? Math.round(thread.scrollHeight - thread.scrollTop - thread.clientHeight) : 0,
          height: thread ? thread.scrollHeight : 0,
        })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    stop() { this.running = false; this.observer?.disconnect(); return { samples: this.samples, longTasks: this.longTasks } },
  }
}

// ---- helpers ---------------------------------------------------------------
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
let failures = 0
const report = []

async function openChat(width, height) {
  const mobile = width < 768
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile, permissions: ["clipboard-read", "clipboard-write"] })
  await context.addInitScript(installFakeStream)
  if (process.env.MALIK_QA_DEBUG) await context.addInitScript(() => {
    // Debug: every SSE frame any reader in the page decodes, with the time.
    const decode = TextDecoder.prototype.decode
    window.__qaFrames = []
    TextDecoder.prototype.decode = function (...args) {
      const text = decode.apply(this, args)
      if (/event: (?:content|error|done|progress)/.test(text)) window.__qaFrames.push(`${Math.round(performance.now())} ${text.replace(/\s+/g, " ").slice(0, 160)}`)
      return text
    }
  })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  // The guest entry sets its cookie and lands on the chat.
  await page.goto(`${BASE}/guest`, { waitUntil: "domcontentloaded", timeout: 180_000 })
  await page.waitForSelector("textarea", { timeout: 120_000 })
  await page.waitForTimeout(1200)
  return { context, page, errors }
}

async function send(page, text, plan) {
  await page.evaluate((next) => window.__qa.queue.push(next), plan)
  // The start screen has its own composer; the thread has the docked one.
  const box = page.locator("textarea:visible").first()
  await box.click()
  await box.fill(text)
  await page.keyboard.press("Enter")
}

const assistant = (page) => page.locator('[data-malik-message="assistant"]').last()
const stopButton = (page) => page.locator('button[aria-label="Остановить генерацию"]')
async function waitIdle(page, timeout = 60_000) {
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Остановить генерацию"]'), null, { timeout })
  await page.waitForTimeout(400)
}
async function shot(page, name) {
  if (!OUT) return
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}

/** Text never shrinks or blanks while it streams: no flicker, no vanished fragments. */
function steadyGrowth(samples) {
  const lengths = samples.map((sample) => sample.length)
  const first = lengths.findIndex((length) => length > 0)
  let shrinks = 0, blanks = 0, steps = 0
  for (let index = Math.max(1, first + 1); index < lengths.length; index += 1) {
    if (lengths[index] === 0) blanks += 1
    else if (lengths[index] < lengths[index - 1]) shrinks += 1
    else if (lengths[index] > lengths[index - 1]) steps += 1
  }
  return { shrinks, blanks, steps, first }
}

async function check(name, width, run) {
  if (ONLY && !name.includes(ONLY)) return
  const height = width < 768 ? 812 : width < 1200 ? 1024 : 900
  const { context, page, errors } = await openChat(width, height)
  try {
    const notes = await run(page) || ""
    assert.deepEqual(errors, [], "no errors in the page")
    console.log(`  ok  ${name} @${width}${notes ? `  (${notes})` : ""}`)
    report.push({ name, width, ok: true, notes })
  } catch (error) {
    failures += 1
    const message = String(error && error.message || error).split("\n").slice(0, 6).join("\n       ")
    console.log(`  FAIL ${name} @${width}\n       ${message}`)
    report.push({ name, width, ok: false, notes: message })
    await shot(page, `fail-${width}-${name.replace(/[^\p{L}\p{N}]+/gu, "-")}`).catch(() => {})
  } finally {
    await context.close()
  }
}

// ---- checks ----------------------------------------------------------------
const WIDTHS = (process.env.MALIK_QA_WIDTHS || "375,768,1440").split(",").map(Number)

for (const width of WIDTHS) {
  await check("main screen as it is", width, async (page) => {
    await shot(page, `home-${width}`)
  })

  await check("a short answer streams word by word, then stands complete", width, async (page) => {
    await send(page, "Скажи привет", { chunks: words(SHORT), everyMs: 45, thinkMs: 700 })
    // Waiting: a real indicator and the Stop button, before any text.
    await page.waitForSelector('[data-malik-message="assistant"]', { timeout: 10_000 })
    assert.equal(await stopButton(page).count(), 1, "Stop is offered while the answer is prepared")
    await page.evaluate(() => window.__qaSampler.start())
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('[data-malik-message="assistant"]')
      return (rows[rows.length - 1]?.querySelector(".malik-md")?.textContent || "").length > 0
    }, null, { timeout: 15_000 })
    await waitIdle(page)
    const { samples } = await page.evaluate(() => window.__qaSampler.stop())
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG short", JSON.stringify(samples.map((s) => s.length)))
    const growth = steadyGrowth(samples)
    assert.equal(growth.blanks, 0, `the answer blanked ${growth.blanks} times while streaming`)
    assert.equal(growth.shrinks, 0, `the answer shrank ${growth.shrinks} times while streaming`)
    assert.ok(growth.steps >= 6, `the text grew in ${growth.steps} steps (streamed, not dropped in at once)`)
    const text = await assistant(page).locator(".malik-md").innerText()
    assert.ok(text.replace(/\s+/g, " ").includes(SHORT.replace(/\s+/g, " ").trim()), "the whole answer stays")
    assert.equal(await stopButton(page).count(), 0, "Stop leaves when the answer is done")
    assert.ok(await assistant(page).locator('button[aria-label="Копировать ответ"]').count() >= 1, "Copy is offered")
    assert.ok(await assistant(page).locator('button[title="Перегенерировать"]').count() >= 1, "Regenerate is offered")
    await shot(page, `short-${width}`)
    return `${growth.steps} growth steps`
  })

  await check("a long answer with a table and code follows the bottom without lag", width, async (page) => {
    const chunks = words(LONG)
    await send(page, "Дай длинный разбор", { chunks, everyMs: 12, thinkMs: 300 })
    await page.waitForSelector('[data-malik-message="assistant"]', { timeout: 10_000 })
    await page.evaluate(() => window.__qaSampler.start())
    await waitIdle(page, 120_000)
    const { samples, longTasks } = await page.evaluate(() => window.__qaSampler.stop())
    const growth = steadyGrowth(samples)
    assert.equal(growth.blanks, 0, `blank frames: ${growth.blanks}`)
    assert.equal(growth.shrinks, 0, `the text shrank ${growth.shrinks} times`)
    const streaming = samples.slice(Math.max(0, growth.first))
    const behind = streaming.filter((sample) => sample.away > 160).length
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG long behind", JSON.stringify(streaming.map((sample, index) => sample.away > 160 ? { index, of: streaming.length, ...sample } : null).filter(Boolean)), "tasks", JSON.stringify(longTasks))
    assert.ok(behind <= 2, `the newest line fell out of view in ${behind} frames (max ${Math.max(...streaming.map((s) => s.away))}px)`)
    const gaps = streaming.slice(1).map((sample, index) => sample.t - streaming[index].t)
    const slow = gaps.filter((gap) => gap > 100).length
    const worstTask = longTasks.length ? Math.max(...longTasks) : 0
    assert.ok(worstTask < 250, `the longest main-thread task was ${worstTask} ms`)
    assert.ok(slow <= Math.max(3, gaps.length * 0.03), `${slow} of ${gaps.length} frames took over 100 ms`)
    const card = assistant(page)
    assert.ok(await card.locator("table").count() >= 1, "the table is rendered")
    assert.ok(await card.locator("pre").count() >= 1, "the code block is rendered")
    const overflow = await page.evaluate(() => { const t = document.querySelector("[data-message-list]"); return t.scrollWidth - t.clientWidth })
    assert.ok(overflow <= 1, `the thread scrolls sideways by ${overflow}px`)
    assert.match(await card.locator(".malik-md").innerText(), /Итог: длинный ответ дописан до конца\./)
    await shot(page, `long-${width}`)
    return `${streaming.length} frames, ${slow} over 100 ms, longest task ${worstTask} ms`
  })

  await check("reading above: the stream does not pull the page down", width, async (page) => {
    await send(page, "Первый вопрос", { chunks: words(LONG), everyMs: 4, thinkMs: 200 })
    await waitIdle(page, 120_000)
    await send(page, "Второй длинный вопрос", { chunks: words(LONG), everyMs: 20, thinkMs: 300 })
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('[data-malik-message="assistant"]')
      return rows.length >= 2 && (rows[rows.length - 1].querySelector(".malik-md")?.textContent || "").length > 400
    }, null, { timeout: 30_000 })
    // The person scrolls up to read the first answer.
    const thread = page.locator("[data-message-list]")
    const box = await thread.boundingBox()
    if (width < 768) await page.evaluate(() => document.querySelector("[data-message-list]").scrollBy(0, -900))
    else { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -900) }
    await page.waitForTimeout(500)
    const held = await page.evaluate(() => document.querySelector("[data-message-list]").scrollTop)
    await page.evaluate(() => window.__qaSampler.start())
    await page.waitForTimeout(2500)
    const { samples } = await page.evaluate(() => window.__qaSampler.stop())
    const moved = samples.filter((sample) => Math.abs(sample.top - held) > 1)
    assert.equal(moved.length, 0, `the page moved by itself in ${moved.length} frames (to ${moved[0]?.top} from ${held})`)
    assert.ok(samples.at(-1).height > samples[0].height, "the answer kept streaming below")
    // The round arrow brings the reader back and following resumes.
    const jump = page.locator('button[aria-label="Прокрутить к последнему сообщению"]')
    await jump.waitFor({ timeout: 3000 })
    await jump.click()
    await page.waitForTimeout(900)
    const away = await page.evaluate(() => { const t = document.querySelector("[data-message-list]"); return t.scrollHeight - t.scrollTop - t.clientHeight })
    assert.ok(away < 160, `after the arrow the newest line is in view (${away}px away)`)
    await waitIdle(page, 120_000)
    return `held at ${held}px for ${samples.length} frames`
  })

  await check("Stop keeps what was written and ends the answer cleanly", width, async (page) => {
    await send(page, "Пиши долго", { chunks: words(LONG), everyMs: 30, thinkMs: 300 })
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('[data-malik-message="assistant"]')
      return (rows[rows.length - 1]?.querySelector(".malik-md")?.textContent || "").length > 300
    }, null, { timeout: 30_000 })
    if (process.env.MALIK_QA_DEBUG) await page.evaluate(() => window.__qaSampler.start())
    // What the person sees at the press: every word of it must stay.
    const seen = await assistant(page).locator(".malik-md").innerText()
    await stopButton(page).click()
    await waitIdle(page, 20_000)
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG stop", JSON.stringify((await page.evaluate(() => window.__qaSampler.stop())).samples.map((s) => s.length)))
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG text", JSON.stringify((await assistant(page).innerText()).slice(-400)))
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG frames\n" + (await page.evaluate(() => window.__qaFrames.slice(-14).join("\n"))))
    const atStop = (await assistant(page).locator(".malik-md").innerText()).length
    await page.waitForTimeout(1200)
    const after = await assistant(page).locator(".malik-md").innerText()
    assert.equal(after.length, atStop, "nothing more arrives after Stop")
    const flat = (text) => text.replace(/\s+/g, " ").trim()
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG seen ", JSON.stringify(flat(seen)), "\nDEBUG after", JSON.stringify(flat(after)))
    assert.ok(flat(after).startsWith(flat(seen).slice(0, -12)), `every word seen before Stop stays (saw ${seen.length}, kept ${after.length})`)
    assert.match(await assistant(page).innerText(), /Остановлено/, "the answer says it was stopped")
    assert.equal(await page.evaluate(() => window.__qa.aborted), 1, "the request itself was cancelled")
    assert.equal(await page.evaluate(() => window.__qa.stops), 1, "the server is told to stop the turn")
    assert.ok(await assistant(page).locator('button[title="Перегенерировать"]').count() >= 1, "Regenerate is offered after Stop")
    await shot(page, `stopped-${width}`)
  })

  await check("Regenerate answers again in place; Copy copies the answer", width, async (page) => {
    await send(page, "Скажи привет", { chunks: words(SHORT), everyMs: 10, thinkMs: 200 })
    await waitIdle(page)
    await assistant(page).hover().catch(() => {})
    await assistant(page).locator('button[aria-label="Копировать ответ"]').first().click()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    assert.ok(copied.replace(/\s+/g, " ").includes("короткий ответ"), `copied: ${copied.slice(0, 80)}`)
    await page.evaluate((next) => window.__qa.queue.push(next), { chunks: words(REGENERATED), everyMs: 30, thinkMs: 300 })
    const rowsBefore = await page.locator('[data-malik-message="assistant"]').count()
    await assistant(page).locator('button[title="Перегенерировать"]').first().click()
    await page.waitForFunction(() => !!document.querySelector('button[aria-label="Остановить генерацию"]'), null, { timeout: 10_000 })
    await waitIdle(page)
    assert.equal(await page.locator('[data-malik-message="assistant"]').count(), rowsBefore, "the answer is replaced in place, not appended")
    assert.match(await assistant(page).locator(".malik-md").innerText(), /Новый вариант ответа/)
    assert.equal(await page.evaluate(() => window.__qa.requests), 2)
    await shot(page, `regenerated-${width}`)
  })

  await check("an error is said plainly, with no pretend thinking left behind", width, async (page) => {
    await send(page, "Сломай ответ", { chunks: words("Начало ответа"), everyMs: 30, thinkMs: 300, error: "Сервис моделей временно недоступен." })
    await waitIdle(page)
    const text = await assistant(page).innerText()
    assert.match(text, /недоступ|ошибк|не удалось|прервал/i, `the failure is visible: ${text.slice(0, 160)}`)
    assert.equal(await page.locator(".malik-live-activity, .malik-thinking-line").count(), 0, "no thinking indicator stays after the error")
    assert.equal(await stopButton(page).count(), 0)
    await shot(page, `error-${width}`)
  })
}

await browser.close()
if (OUT) fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2))
console.log(failures ? `\n${failures} chat check(s) failed` : "\nall chat streaming checks passed")
process.exit(failures ? 1 : 0)
