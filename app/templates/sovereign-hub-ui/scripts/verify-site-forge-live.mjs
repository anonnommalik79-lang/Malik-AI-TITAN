// Malik Site Forge in a real browser: every generated site is clicked through
// like a visitor would — pages, back button, phone menu, catalogue filters,
// basket and checkout, booking with time slots, lightbox, not-found page —
// at desktop and phone sizes, top-level and inside the chat's sandboxed frame.
//
//   node scripts/verify-site-forge-live.mjs            (needs Playwright)
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { workTestLoader } from "./work-test-loader.mjs"

const require = createRequire(import.meta.url)
let playwright
for (const base of [process.env.PLAYWRIGHT_NODE_MODULES, "/home/claude/node_modules/", path.resolve("node_modules") + "/"].filter(Boolean)) {
  try { playwright = createRequire(base)("playwright"); break } catch { /* next */ }
}
if (!playwright) { try { playwright = require("playwright") } catch { console.log("SKIP: playwright is not installed"); process.exit(0) } }

const load = workTestLoader()
const { forgeSite } = load("lib/sites/forge/index.ts")
const shots = process.env.FORGE_SHOTS || ""
const prompts = [
  ["coffee", "создай сайт на кофейню фулл страницами рабочий крутым дизайном"],
  ["barber", "сделай сайт для барбершопа в Астане"],
  ["hotel", "create a website for a boutique hotel"],
  ["clinic", "сайт стоматологии"],
]

let failures = 0
const ok = (name, condition, extra = "") => { if (!condition) failures += 1; console.log(`${condition ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`) }

const browser = await playwright.chromium.launch()
for (const [id, prompt] of prompts) {
  const site = await forgeSite({ prompt })
  for (const phone of [false, true]) {
    const tag = `${id}/${phone ? "phone" : "desktop"}`
    const ctx = await browser.newContext({ viewport: { width: phone ? 390 : 1366, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone })
    await ctx.route("**/*", (route) => (route.request().url().startsWith("http") ? route.abort() : route.continue()))
    const page = await ctx.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    const file = path.join(process.env.TMPDIR || "/tmp", `forge-${id}.html`)
    fs.writeFileSync(file, site.html)
    await page.goto("file://" + file)
    await page.waitForFunction(() => document.documentElement.getAttribute("data-ready") === "true")
    const active = () => page.evaluate(() => document.querySelector(".page.is-active")?.getAttribute("data-page"))
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

    // Pages through the real menu (phone: through the burger).
    for (const name of ["catalog", "about", "gallery", "booking", "contacts"]) {
      if (phone) {
        await page.click("[data-menu-toggle]")
        ok(`${tag}: phone menu opens`, await page.isVisible("#mnav"))
        await page.click(`#mnav [data-nav="${name}"]`)
        ok(`${tag}: phone menu closes after a choice`, !(await page.isVisible("#mnav")))
      } else await page.click(`.nav [data-nav="${name}"]`)
      ok(`${tag}: «${name}» opens`, (await active()) === name)
      ok(`${tag}: «${name}» fits the screen`, (await overflow()) <= 0)
    }
    await page.goBack()
    ok(`${tag}: back button returns to the previous page`, (await active()) === "booking")
    await page.evaluate(() => { location.hash = "#/no-such-page" })
    await page.waitForTimeout(100)
    ok(`${tag}: unknown address shows the not-found page`, (await active()) === "404")

    // Catalogue: filter, search, sort, reset.
    await page.evaluate(() => { location.hash = "#/catalog" })
    await page.waitForTimeout(100)
    const visible = () => page.$$eval("[data-catalog-page] [data-item]", (items) => items.filter((item) => !item.hidden).length)
    const total = await visible()
    const chip = site.plan.catalog.categories[1]
    if (chip) {
      await page.click(`[data-filter="${chip.id}"]`)
      const expected = site.plan.catalog.items.filter((item) => item.category === chip.id).length
      ok(`${tag}: category filter`, (await visible()) === expected, `${await visible()}/${expected}`)
      await page.click('[data-filter="all"]')
    }
    const word = site.plan.catalog.items[2].name.slice(0, 4).toLowerCase()
    await page.fill("[data-search-input]", word)
    ok(`${tag}: search finds «${word}»`, (await visible()) >= 1 && (await visible()) < total)
    await page.fill("[data-search-input]", "zzzzqqq")
    ok(`${tag}: empty search says so`, await page.isVisible("[data-catalog-page] [data-empty]"))
    await page.click("[data-reset]")
    await page.selectOption("[data-sort]", "asc")
    const prices = await page.$$eval("[data-catalog-page] [data-item]", (items) => items.filter((item) => !item.hidden).map((item) => Number(item.getAttribute("data-price"))))
    ok(`${tag}: sort by price`, prices.every((value, index) => index === 0 || prices[index - 1] <= value) && prices.length === total)

    // Basket and checkout, or booking from a service.
    if (site.plan.order) {
      const [a, b] = site.plan.catalog.items
      await page.click(`[data-catalog-page] [data-add="${a.id}"]`)
      await page.click(`[data-catalog-page] [data-add="${b.id}"]`)
      await page.click(`[data-catalog-page] [data-add="${b.id}"]`)
      ok(`${tag}: basket count`, (await page.textContent(".hdr [data-cart-count]")) === "3")
      await page.click(phone ? ".sticky-cta [data-cart-open]" : ".hdr [data-cart-open]")
      await page.waitForSelector("[data-cart].is-open")
      await page.click(`[data-inc="${a.id}"]`)
      const sum = a.price * 2 + b.price * 2
      const shown = await page.textContent("[data-stage=cart] [data-total], [data-cart-foot] [data-total]")
      ok(`${tag}: basket total`, shown.replace(/\D/g, "") === String(sum).replace(/\D/g, ""), `${shown} vs ${sum}`)
      await page.click("[data-checkout]")
      await page.click("[data-checkout-form] button[type=submit]")
      ok(`${tag}: checkout asks for a name`, await page.isVisible("[data-checkout-form] .field[data-invalid]"))
      await page.fill("#c-name", "Алия")
      await page.fill("#c-phone", "+7 701 123 45 67")
      if (await page.isVisible("#c-address")) await page.fill("#c-address", "ул. Сатпаева, 5")
      await page.click("[data-checkout-form] button[type=submit]")
      const text = await page.textContent("[data-order-text]")
      ok(`${tag}: order summary lists items and total`, text.includes(a.name) && text.includes(b.name) && text.includes("Алия"))
      const wa = await page.getAttribute("[data-stage=done] [data-send=wa]", "href")
      ok(`${tag}: order goes to WhatsApp with the text`, /^https:\/\/wa\.me\/\d{10,15}\?text=/.test(wa || ""), wa)
      await page.click("[data-new-order]")
      ok(`${tag}: new order empties the basket`, (await page.textContent(".hdr [data-cart-count]")) === "0")
    } else {
      const service = site.plan.catalog.items[0]
      await page.click(`[data-catalog-page] [data-service="${service.name}"]`)
      ok(`${tag}: «book» on a service opens booking`, (await active()) === "booking")
    }

    await page.evaluate(() => { location.hash = "#/booking" })
    await page.waitForTimeout(100)
    const tomorrow = await page.evaluate(() => { const d = new Date(Date.now() + 864e5); return d.toISOString().slice(0, 10) })
    await page.fill("#b-date", tomorrow)
    await page.dispatchEvent("#b-date", "change")
    if (await page.$("#b-time")) ok(`${tag}: time slots for tomorrow`, (await page.$$eval("#b-time option", (options) => options.filter((option) => option.value).length)) > 3)
    if (await page.$("[data-slots] .slot")) {
      const third = page.locator("[data-slots] .slot").nth(2)
      const value = await third.getAttribute("data-slot")
      await third.click()
      ok(`${tag}: a time button picks that time`, (await page.inputValue("#b-time")) === value && (await third.getAttribute("aria-checked")) === "true", value)
    }
    if (await page.$("#b-checkout")) { const after = await page.evaluate(() => new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)); await page.fill("#b-checkout", after) }
    await page.click("[data-booking] button[type=submit]")
    ok(`${tag}: booking asks for a name`, await page.isVisible("[data-booking] .field[data-invalid]"))
    ok(`${tag}: error summary lists every problem`, (await page.isVisible("[data-booking] [data-errsum]")) && (await page.$$eval("[data-booking] [data-errsum] li", (items) => items.length)) >= 2)
    await page.fill("#b-name", "Данияр")
    await page.fill("#b-phone", "87011234567")
    await page.click("[data-booking] button[type=submit]")
    ok(`${tag}: booking confirmation`, await page.isVisible("[data-booking-done]"))
    ok(`${tag}: booking text has the date`, (await page.textContent("[data-booking-text]")).includes(tomorrow))
    ok(`${tag}: calendar button`, await page.isVisible("[data-ics]"))

    // Lightbox.
    await page.evaluate(() => { location.hash = "#/gallery" })
    await page.waitForTimeout(100)
    await page.click(".masonry [data-lb] >> nth=0")
    ok(`${tag}: photo opens full screen`, await page.isVisible("[data-lightbox-root]"))
    ok(`${tag}: the full-screen photo shows its number`, /^1 \/ \d+$/.test((await page.textContent("[data-lb-count]")) || ""))
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab")
    ok(`${tag}: focus stays inside the full-screen gallery`, await page.evaluate(() => document.querySelector("[data-lightbox-root]").contains(document.activeElement)))
    await page.keyboard.press("Escape")
    ok(`${tag}: Escape closes it`, !(await page.isVisible("[data-lightbox-root]")))

    // Home: sections appear while scrolling, numbers count, the carousel steps.
    await page.evaluate(() => { location.hash = "#/" })
    await page.waitForTimeout(150)
    const hidden = await page.$$eval('[data-page="home"] [data-reveal]', (nodes) => nodes.filter((node) => !node.classList.contains("is-in")).length)
    for (let y = 0; y < 20000; y += 400) { await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y); await page.waitForTimeout(40); if (await page.evaluate((top) => top > document.documentElement.scrollHeight, y)) break }
    await page.waitForTimeout(1300)
    const left = await page.$$eval('[data-page="home"] [data-reveal]', (nodes) => nodes.filter((node) => !node.classList.contains("is-in")).map((node) => node.className))
    ok(`${tag}: every home section appears on scroll`, hidden > 0 && left.length === 0, left.join(","))
    const counted = await page.$eval('[data-page="home"] .tile--stat [data-count]', (node) => node.textContent === node.getAttribute("data-count"))
    ok(`${tag}: the opening-hours number counts up to the real value`, counted)
    ok(`${tag}: back-to-top appears far down the page`, await page.isVisible("[data-top]"))
    if (!phone && (await page.$("[data-rail]")) && !(await page.$eval("[data-rail]", (rail) => rail.classList.contains("is-static")))) {
      await page.evaluate(() => document.querySelector("[data-rail]").scrollIntoView({ block: "center", behavior: "instant" }))
      const before = await page.$eval(".rail__track", (track) => track.scrollLeft)
      await page.click("[data-rail-next]")
      await page.waitForTimeout(700)
      ok(`${tag}: carousel arrow moves one card`, (await page.$eval(".rail__track", (track) => track.scrollLeft)) > before && !(await page.isDisabled("[data-rail-prev]")))
    }
    ok(`${tag}: home fits the screen`, (await overflow()) <= 0)
    if (site.plan.order) {
      await page.click(phone ? ".sticky-cta [data-cart-open]" : ".hdr [data-cart-open]")
      await page.waitForSelector("[data-cart].is-open")
      for (let i = 0; i < 15; i++) await page.keyboard.press("Tab")
      ok(`${tag}: focus stays inside the basket`, await page.evaluate(() => document.querySelector("[data-cart]").contains(document.activeElement)))
      await page.keyboard.press("Escape")
    }

    ok(`${tag}: no script errors`, errors.length === 0, errors.join(" | "))
    if (shots) {
      await page.evaluate(() => { location.hash = "#/" })
      await page.waitForTimeout(1200)
      await page.screenshot({ path: path.join(shots, `${id}-${phone ? "phone" : "desktop"}.png`) })
    }
    await ctx.close()
  }

  // Inside the chat's sandbox (no same-origin: storage throws there).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.route("**/*", (route) => (route.request().url().startsWith("http") ? route.abort() : route.continue()))
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.setContent(`<iframe id="f" sandbox="allow-scripts allow-forms allow-modals allow-popups" style="width:1200px;height:800px"></iframe>`)
  await page.$eval("#f", (frame, html) => { frame.srcdoc = html }, site.html)
  const frame = page.frameLocator("#f")
  await frame.locator("html[data-ready=true]").waitFor()
  await frame.locator('.nav [data-nav="catalog"]').click()
  ok(`${id}/sandbox: pages switch inside the chat preview`, await frame.locator('[data-page="catalog"].is-active').isVisible())
  if (site.plan.order) {
    await frame.locator(`[data-catalog-page] [data-add="${site.plan.catalog.items[0].id}"]`).click()
    ok(`${id}/sandbox: basket works without storage`, (await frame.locator(".hdr [data-cart-count]").textContent()) === "1")
  }
  ok(`${id}/sandbox: no script errors`, errors.length === 0, errors.join(" | "))
  await ctx.close()
}
await browser.close()
assert.equal(failures, 0, `${failures} live checks failed`)
console.log("all site forge live checks passed")
