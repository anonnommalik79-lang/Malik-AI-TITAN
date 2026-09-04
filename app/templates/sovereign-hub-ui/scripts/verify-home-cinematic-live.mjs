import assert from "node:assert/strict"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.MALIK_PLAYWRIGHT_PACKAGE || "playwright")
const browser = await chromium.launch({ channel: "msedge", headless: true })

try {
  for (const [width,height] of [[320,568],[360,800],[390,844],[430,932]]) {
    const context = await browser.newContext({ viewport: {width,height} })
    await context.addCookies([{name:"malik-guest",value:"1",url:"http://127.0.0.1:3000",httpOnly:true,sameSite:"Lax"}])
    const page = await context.newPage()
    page.setDefaultTimeout(30000)
    await page.goto("http://127.0.0.1:3000/dashboard", {timeout:120000})
    await page.locator('[data-testid="mobile-exact-interactive-layer"]').waitFor()
    const state = await page.evaluate(() => {
      const welcome = document.querySelector(".thome-welcome")
      const layer = document.querySelector(".thome-mobile-exact-layer")
      const composer = document.querySelector(".thome-mobile-exact-composer")
      const rect = element => {const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}
      const css = getComputedStyle(welcome)
      return {welcome:rect(welcome),layer:rect(layer),composer:rect(composer),background:css.backgroundImage,size:css.backgroundSize}
    })
    assert.match(state.background,/malik-mobile-home-exact-8k\.avif/)
    assert.equal(state.size,"100% 100%")
    assert.ok(Math.abs(state.welcome.width-width)<1 && Math.abs(state.welcome.height-height)<1,JSON.stringify({width,height,state}))
    assert.ok(Math.abs(state.layer.width-width)<1 && Math.abs(state.layer.height-height)<1,JSON.stringify({width,height,state}))
    assert.ok(state.composer.y>=0 && state.composer.y+state.composer.height<=height+2,JSON.stringify({width,height,state}))
    await page.getByTestId("mobile-quick-help").click()
    const input=page.locator(".thome-mobile-exact-composer textarea")
    assert.match(await input.inputValue(),/Помоги мне решить задачу/)
    await input.fill("Проверка перехода в чат")
    await input.press("Enter")
    await page.locator(".malik-premium-chat-host").waitFor()
    assert.equal(await page.locator(".thome-welcome").count(),0)
    assert.equal(await page.locator(".malik-premium-chat-host").evaluate(e=>getComputedStyle(e).backgroundColor),"rgb(0, 0, 0)")
    await context.close()
    console.log(`PASS ${width}x${height}: full artwork, actions, composer, black chat handoff`)
  }
} finally { await browser.close() }
