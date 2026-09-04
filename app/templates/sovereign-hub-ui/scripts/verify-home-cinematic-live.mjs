import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.MALIK_PLAYWRIGHT_PACKAGE || "playwright")
const browser = await chromium.launch({ channel: "msedge", headless: true })
const requestedViewport = process.env.MALIK_TEST_VIEWPORT?.split("x").map(Number)
const viewports = requestedViewport?.length === 2 && requestedViewport.every(Number.isFinite)
  ? [requestedViewport]
  : [[320, 568], [360, 800], [390, 844], [430, 932]]

try {
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } })
    await context.addCookies([{
      name: "malik-guest",
      value: "1",
      url: "http://127.0.0.1:3000",
      httpOnly: true,
      sameSite: "Lax",
    }])
    const page = await context.newPage()
    page.setDefaultTimeout(30000)
    await page.goto("http://127.0.0.1:3000/dashboard", { timeout: 120000 })
    await page.locator(".thome-welcome").waitFor()
    await page.waitForTimeout(700)

    const state = await page.evaluate(() => {
      const welcome = document.querySelector(".thome-welcome")
      const layer = document.querySelector(".thome-mobile-exact-layer")
      const home = document.querySelector(".thome")
      const composer = welcome.querySelector(":scope > .thome-composer")
      const actions = welcome.querySelector('[aria-label="Бесплатные плагины источников"]')
      const signIn = document.querySelector(".titan-mobile-signin")
      const rect = (element) => {
        const value = element.getBoundingClientRect()
        return { x: value.x, y: value.y, width: value.width, height: value.height, bottom: value.bottom }
      }
      const hero = getComputedStyle(welcome)
      const inspect = (selector) => {
        const element = document.querySelector(selector)
        if (!element) return null
        const style = getComputedStyle(element)
        return {
          ...rect(element),
          padding: style.padding,
          margin: style.margin,
          boxSizing: style.boxSizing,
          display: style.display,
          gap: style.gap,
        }
      }
      return {
        clientHeight: document.documentElement.clientHeight,
        home: rect(home),
        welcome: rect(welcome),
        composer: rect(composer),
        actions: rect(actions),
        heroBackground: hero.backgroundImage,
        heroSize: hero.backgroundSize,
        exactLayerDisplay: layer ? getComputedStyle(layer).display : "missing",
        signInDisplay: signIn ? getComputedStyle(signIn).display : "missing",
        shells: {
          topbar: inspect(".titan-topbar"),
          root: inspect("#malik-root"),
          shell: inspect(".malik-dashboard-shell"),
          shellChildren: Array.from(document.querySelector(".malik-dashboard-shell")?.children || []).map((element) => ({
            tag: element.tagName,
            className: element.className,
            ...rect(element),
            position: getComputedStyle(element).position,
          })),
          contentChildren: Array.from(document.querySelector(".titan-topbar")?.parentElement?.children || []).map((element) => ({
            tag: element.tagName,
            className: element.className,
            ...rect(element),
            position: getComputedStyle(element).position,
            flex: getComputedStyle(element).flex,
          })),
          mobileHomeParent: (() => {
            const element = document.querySelector(".malik-mobile-home")?.parentElement
            if (!element) return null
            const style = getComputedStyle(element)
            return {
              tag: element.tagName,
              className: element.className,
              ...rect(element),
              display: style.display,
              gap: style.gap,
              padding: style.padding,
              heightValue: style.height,
              minHeight: style.minHeight,
              maxHeight: style.maxHeight,
              flex: style.flex,
              transform: style.transform,
            }
          })(),
          main: inspect(".titan-main"),
          scroll: inspect(".malik-main-scroll-host"),
          content: inspect(".titan-content"),
          contentHost: (() => {
            const element = document.querySelector(".titan-topbar")?.nextElementSibling
            if (!element) return null
            const style = getComputedStyle(element)
            return { ...rect(element), padding: style.padding, margin: style.margin, boxSizing: style.boxSizing }
          })(),
          mobileHome: inspect(".malik-mobile-home"),
        },
      }
    })

    assert.match(state.heroBackground, /malik-mobile-cinematic-portrait\.png/)
    assert.match(state.heroSize, /cover/)
    assert.equal(state.exactLayerDisplay, "none")
    assert.equal(state.signInDisplay, "none")
    assert.ok(state.home.y >= 0 && Math.abs(state.home.bottom - state.clientHeight) < 2, JSON.stringify({ width, height, state }))
    assert.ok(state.welcome.y >= 0 && Math.abs(state.welcome.bottom - state.clientHeight) < 2, JSON.stringify({ width, height, state }))
    assert.ok(state.actions.y >= 0 && state.actions.bottom <= state.clientHeight + 1, JSON.stringify({ width, height, state }))
    assert.ok(state.composer.y >= 0 && state.composer.bottom <= state.clientHeight + 1, JSON.stringify({ width, height, state }))
    assert.ok(state.composer.bottom >= state.clientHeight - 24, JSON.stringify({ width, height, state }))
    if (process.env.MALIK_TEST_SCREENSHOT) {
      await page.screenshot({ path: process.env.MALIK_TEST_SCREENSHOT })
    }

    await context.close()
    console.log(`PASS ${width}x${height}: live V5 layout, portrait hero, no black tail`)
  }

  if (process.env.MALIK_SKIP_CHAT_HANDOFF === "1") {
    console.log("SKIP chat handoff")
  } else {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addCookies([{
    name: "malik-guest",
    value: "1",
    url: "http://127.0.0.1:3000",
    httpOnly: true,
    sameSite: "Lax",
  }])
  const page = await context.newPage()
  await page.goto("http://127.0.0.1:3000/dashboard", { timeout: 120000 })
  const input = page.locator(".thome-welcome > .thome-composer textarea")
  await input.fill("Проверка перехода в чат")
  await input.press("Enter")
  await page.locator(".malik-premium-chat-host").waitFor({ timeout: 30000 })
  assert.equal(await page.locator(".thome-welcome").count(), 0)
  assert.equal(
    await page.locator(".malik-premium-chat-host").evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(0, 0, 0)",
  )
  await context.close()
  console.log("PASS chat handoff: mobile portrait disappears and black chat takes over")
  }
} finally {
  await browser.close()
}
