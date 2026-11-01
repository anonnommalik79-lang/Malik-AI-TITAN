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

  // The answer's own text: photo captions, galleries and editorial section
  // numbers («01 /») are decoration that comes and goes with the pictures.
  const DECOR = "figure, .malik-editorial__media, .malik-editorial__num, .malik-editorial__slash, .malik-editorial__source, .malik-editorial__chips, [data-malik-photo-caption], [data-malik-photo-header], [data-malik-photo-lineup], [data-malik-photo-hints], .malik-editorial-eyebrow"
  window.__qaAnswerLength = (md) => {
    if (!md) return 0
    let length = md.textContent.length
    for (const node of md.querySelectorAll(DECOR)) if (!node.parentElement?.closest(DECOR)) length -= node.textContent.length
    return length
  }
  window.__qaAnswerText = () => {
    const rows = document.querySelectorAll('[data-malik-message="assistant"]')
    const md = rows[rows.length - 1]?.querySelector(".malik-md")
    if (!md) return ""
    const copy = md.cloneNode(true)
    copy.querySelectorAll(DECOR).forEach((node) => node.remove())
    document.body.appendChild(copy)
    copy.style.cssText = "position:absolute;left:-99999px;top:0;width:800px"
    const text = copy.innerText
    copy.remove()
    return text
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
          length: card ? window.__qaAnswerLength(card.querySelector(".malik-md")) : 0,
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
  // The local app only: a production build sends guests on to the public
  // domain, so the test sets the guest cookie itself and blocks that domain.
  await context.route(/^https?:\/\/(?:[^/]+\.)?malikaiworld\.world\//, (route) => route.abort())
  await context.addCookies([{ name: "malik-guest", value: "1", url: BASE }])
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 180_000 })
  if (new URL(page.url()).origin !== new URL(BASE).origin) throw new Error(`left the local app for ${page.url()}`)
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
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG short", JSON.stringify(samples.map((s) => `${s.t}:${s.length}`)), "longtasks", JSON.stringify((await page.evaluate(() => window.__qaSampler.longTasks))))
    const growth = steadyGrowth(samples)
    assert.equal(growth.blanks, 0, `the answer blanked ${growth.blanks} times while streaming`)
    assert.equal(growth.shrinks, 0, `the answer shrank ${growth.shrinks} times while streaming`)
    assert.ok(growth.steps >= 4, `the text grew in ${growth.steps} steps (streamed, not dropped in at once)`)
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
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG shrinks", JSON.stringify(samples.map((sample, index) => index && sample.length && sample.length < samples[index - 1].length ? { index, of: samples.length, from: samples[index - 1].length, to: sample.length, t: sample.t } : null).filter(Boolean)), "end", samples.at(-1)?.t)
    const growth = steadyGrowth(samples)
    assert.equal(growth.blanks, 0, `blank frames: ${growth.blanks}`)
    assert.equal(growth.shrinks, 0, `the text shrank ${growth.shrinks} times`)
    const streaming = samples.slice(Math.max(0, growth.first))
    // Following may lag one frame when a block lands or the glide after a
    // send is still moving; what a person sees as falling behind is a run.
    let run = 0, longestRun = 0
    for (const sample of streaming) { run = sample.away > 160 ? run + 1 : 0; longestRun = Math.max(longestRun, run) }
    const behind = longestRun
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG shrink", JSON.stringify(streaming.map((sample, index) => index && sample.length < streaming[index - 1].length ? { index, of: streaming.length, from: streaming[index - 1].length, to: sample.length } : null).filter(Boolean)))
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG behind", JSON.stringify(streaming.map((sample, index) => sample.away > 160 ? { index, of: streaming.length, away: sample.away, length: sample.length, height: sample.height } : null).filter(Boolean)), "final length", streaming.at(-1)?.length)
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG long behind", JSON.stringify(streaming.map((sample, index) => sample.away > 160 ? { index, of: streaming.length, ...sample } : null).filter(Boolean)), "tasks", JSON.stringify(longTasks))
    assert.ok(behind <= 2, `the newest line stayed out of view ${behind} frames in a row (max ${Math.max(...streaming.map((s) => s.away))}px)`)
    const gaps = streaming.slice(1).map((sample, index) => sample.t - streaming[index].t)
    const slow = gaps.filter((gap) => gap > 100).length
    const worstTask = longTasks.length ? Math.max(...longTasks) : 0
    assert.ok(worstTask < 250, `the longest main-thread task was ${worstTask} ms`)
    assert.ok(slow <= Math.max(3, gaps.length * 0.03), `${slow} of ${gaps.length} frames took over 100 ms`)
    const card = assistant(page)
    assert.ok(await card.locator("table").count() >= 1, "the table is rendered")
    assert.ok(await card.locator("pre").count() >= 1, "the code block is rendered")
    // What a person can see or pan: the answer itself past the thread's edge,
    // or the page scrolling sideways. (The thread clips its own overflow.)
    const overflow = await page.evaluate(() => {
      const thread = document.querySelector("[data-message-list]").getBoundingClientRect()
      const md = [...document.querySelectorAll('[data-malik-message="assistant"] .malik-md')].pop()
      return Math.max(0, Math.round(md.getBoundingClientRect().right - thread.right), document.documentElement.scrollWidth - window.innerWidth)
    })
    if (process.env.MALIK_QA_DEBUG && overflow > 1) console.log("DEBUG wide", JSON.stringify(await page.evaluate(() => {
      const t = document.querySelector("[data-message-list]"), edge = t.getBoundingClientRect().right
      return [...t.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > edge + 1 && !el.closest("pre, table, .malik-md-table-scroll"))
        .slice(0, 8).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)} edge=${Math.round(edge)}`)
    })))
    assert.ok(overflow <= 1, `the answer or the page goes ${overflow}px past the screen`)
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
    // The arrow slides in and out as the reader moves; press it where it is.
    await jump.evaluate((button) => button.click())
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
    const seen = await page.evaluate(() => window.__qaAnswerText())
    await stopButton(page).click()
    await waitIdle(page, 20_000)
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG stop", JSON.stringify((await page.evaluate(() => window.__qaSampler.stop())).samples.map((s) => s.length)))
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG text", JSON.stringify((await assistant(page).innerText()).slice(-400)))
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG qa", JSON.stringify(await page.evaluate(() => ({ requests: window.__qa.requests, aborted: window.__qa.aborted, stops: window.__qa.stops, frames: window.__qaFrames.length }))))
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG frames\n" + (await page.evaluate(() => window.__qaFrames.slice(-24).join("\n"))))
    const atStop = (await page.evaluate(() => window.__qaAnswerText())).length
    await page.waitForTimeout(1200)
    const after = await page.evaluate(() => window.__qaAnswerText())
    assert.equal(after.length, atStop, "nothing more arrives after Stop")
    const flat = (text) => text.replace(/\s+/g, " ").trim()
    if (process.env.MALIK_QA_DEBUG) console.log("DEBUG seen ", JSON.stringify(flat(seen)), "\nDEBUG after", JSON.stringify(flat(after)))
    // A finished long answer gains its contents list on top, so the text seen is
    // looked for inside the kept answer (its last word may still have been typing).
    assert.ok(flat(after).includes(flat(seen).slice(0, -12)), `every word seen before Stop stays (saw ${seen.length}, kept ${after.length})`)
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
