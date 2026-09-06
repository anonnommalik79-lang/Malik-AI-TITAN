// Browser contract tests with intercepted TEST FIXTURES; not real-account OAuth E2E.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright")
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true })
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000"
const author = { id: "UC" + "a".repeat(22), title: "TEST FIXTURE CHANNEL", description: "Only in tests", subscribers: 100 }
const videos = ["abcdefghijk", "lmnopqrstuv"].map((id) => ({ id, sourceUrl: "https://www.youtube.com/watch?v=" + id, title: "TEST FIXTURE " + id, description: "", duration: 60, channel: author, views: 1000, likes: 40, comments: 2, publishedAt: "2026-09-01T00:00:00Z", rating: "none" }))
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage(), errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    let rating = "none", fail = false, saved = false, subscribed = false, posts = 0
    await page.addInitScript(() => {
      window.__testPlayers = []
      window.YT = { Player: class {
        constructor(host, options) {
          this.id = options.videoId; this.playing = false; this.muted = true; this.time = 8; this.destroyed = false; this.plays = 0
          this.frame = document.createElement("iframe"); this.frame.title = "TEST PLAYER CONTRACT"; this.frame.srcdoc = '<body style="background:#131313;color:white;font-family:system-ui">TEST PLAYER CONTRACT — no real playback</body>'; host.replaceWith(this.frame)
          window.__testPlayers.push(this); setTimeout(() => options.events.onReady({ target: this }), 0)
        }
        playVideo() { this.playing = true; this.plays++ }
        pauseVideo() { this.playing = false }
        mute() { this.muted = true }
        unMute() { this.muted = false }
        isMuted() { return this.muted }
        getCurrentTime() { return this.time }
        getDuration() { return 60 }
        getPlayerState() { return this.playing ? 1 : 2 }
        destroy() { this.destroyed = true; this.frame.remove() }
      } }
    })
    await page.route("**/api/shorts/history", (route) => route.fulfill({ json: { ok: true } }))
    await page.route("**/api/youtube/**", async (route) => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method()
      if (path.endsWith("/me")) return route.fulfill({ json: { connected: true, channel: author, channels: [author] } })
      if (path.endsWith("/feed")) return route.fulfill({ json: { items: videos } })
      if (path.endsWith("/rating")) { if (fail) { fail = false; return route.fulfill({ status: 403, json: { message: "TEST rejected rating" } }) } rating = req.postDataJSON().rating; return route.fulfill({ json: { video: { ...videos[0], rating, likes: rating === "like" ? 41 : 40 } } }) }
      if (path.endsWith("/saved")) { saved = req.postDataJSON().saved; return route.fulfill({ json: { saved } }) }
      if (path.endsWith("/subscription")) { subscribed = req.postDataJSON().subscribed; return route.fulfill({ json: { subscribed } }) }
      if (path.endsWith("/comments")) {
        const item = { id: "comment-test", author: author.title, channelId: author.id, text: "TEST comment", publishedAt: "2026-09-01", updatedAt: "2026-09-01", replyCount: 0, likes: 1, own: true }
        if (method === "POST") { posts++; return route.fulfill({ status: 201, json: { item: { ...item, id: "created-test-" + posts, text: req.postDataJSON().text } } }) }
        return route.fulfill({ json: { items: [item] } })
      }
      if (/\/videos\/[\w-]+$/.test(path)) return route.fulfill({ json: { video: { ...(videos.find((v) => path.endsWith(v.id)) || videos[0]), rating }, saved, subscribed } })
      return route.fulfill({ status: 404, json: { message: "TEST unexpected route" } })
    })
    await page.goto(base + "/visual-test/shorts", { waitUntil: "domcontentloaded", timeout: 120000 })
    const like = page.getByRole("button", { name: "Лайк YouTube", exact: true }).first()
    await like.waitFor({ timeout: 120000 })
    await page.waitForFunction(() => window.__testPlayers?.some((p) => p.playing), { timeout: 20000 })
    await page.waitForFunction(() => [...document.querySelectorAll('button[aria-label="Лайк YouTube"]')].some((b) => !b.disabled))
    await like.click(); await page.getByRole("button", { name: "Убрать лайк YouTube" }).waitFor()
    fail = true; await page.getByRole("button", { name: "Убрать лайк YouTube" }).click()
    await page.getByText("TEST rejected rating").waitFor(); assert.equal(await page.getByRole("button", { name: "Убрать лайк YouTube" }).count(), 1)
    await page.getByRole("button", { name: "Закрыть сообщение" }).click()
    await page.getByRole("button", { name: "Сохранить", exact: true }).first().click(); await page.getByRole("button", { name: "Сохранено", exact: true }).waitFor()
    await page.getByRole("button", { name: "Подписаться", exact: true }).first().click(); await page.getByRole("button", { name: "Отписаться", exact: true }).waitFor()
    await page.getByRole("button", { name: "Комментарии YouTube", exact: true }).first().click()
    await page.getByRole("dialog").waitFor(); await page.getByLabel("Текст комментария YouTube").fill("TEST posted text")
    await page.getByRole("button", { name: "Отправить в YouTube" }).click(); await page.getByText("TEST posted text", { exact: true }).waitFor(); assert.equal(posts, 1)
    await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" })
    await page.evaluate(() => { const p = window.__testPlayers.find((p) => !p.destroyed); p.pauseVideo(); p.__pausePlays = p.plays; p.unMute() })
    await page.waitForTimeout(1100)
    assert.ok(await page.evaluate(() => { const p = window.__testPlayers.find((p) => !p.destroyed); return !p.playing && p.plays === p.__pausePlays && !p.muted }))
    await page.locator('[data-video="lmnopqrstuv"]').scrollIntoViewIfNeeded()
    await page.waitForFunction(() => window.__testPlayers.some((p) => p.id === "lmnopqrstuv" && p.playing))
    assert.ok(await page.evaluate(() => { const alive = window.__testPlayers.filter((p) => !p.destroyed); return alive.length === 1 && !alive[0].muted && window.__testPlayers.filter((p) => p.destroyed).every((p) => !p.playing) }))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "No horizontal overflow")
    assert.deepEqual(errors, [])
    console.log(`PASS ${viewport.width}x${viewport.height}: real component + intercepted API, like rollback/save/subscribe/comments/player pause/mute/switch/layout`)
    await context.close()
  }
} finally { await browser.close() }
