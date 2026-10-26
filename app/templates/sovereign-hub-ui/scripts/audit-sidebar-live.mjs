// Real guest-browser inventory. Does not submit generation, payment, OAuth,
// deletion or upload forms. UI evidence never certifies provider workflows.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const origin = new URL(process.env.MALIK_AUDIT_URL || "http://127.0.0.1:3000").origin
const output = path.resolve(process.env.MALIK_AUDIT_OUTPUT || ".data/sidebar-audit")
const width = Number(process.env.MALIK_AUDIT_WIDTH || 1440)
assert.ok(Number.isInteger(width) && width >= 320 && width <= 1920)
const names = ["Новый чат", "Голосовой режим", "Библиотека", "Проекты PRO", "Задачи", "Бизнес под ключ PRO", "Malik Work NEW", "Malik Shorts BETA", "Сайты", "Генерация видео", "Создать трек PRO", "Презентации", "Генерация изображений", "Плагины", "Compute", "Переводчик", "Анализ данных"]
const selected = process.argv.includes("--only") ? Number(process.argv[process.argv.indexOf("--only") + 1]) : null
const safeError = error => String(error.message || error).replace(/https?:\/\/[^\s"<>]+/g, raw => {try {const url=new URL(raw);return url.origin+url.pathname}catch{return '[URL]'}}).slice(0,2000)
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE, args: ["--disable-dev-shm-usage"] })
const report = { origin, at: new Date().toISOString(), scope: "real-guest-ui-not-model-certification", entries: [], console: [], network: [], requestFailures: [] }
try {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" })
  const page = await context.newPage()
  page.setDefaultTimeout(18000)
  let section = "auth"
  const requestSections = new WeakMap()
  page.on("request", request => requestSections.set(request, section))
  page.on("pageerror", error => report.console.push({ section, kind: "pageerror", message: error.message.slice(0, 1500) }))
  page.on("console", message => { if (["error", "warning"].includes(message.type())) report.console.push({ section, kind: message.type(), message: safeError(message.text()), location: message.location().url ? safeError(message.location().url) : undefined }) })
  page.on("response", response => {
    const url = new URL(response.url())
    if (url.origin === origin && !url.pathname.startsWith("/_next/")) report.network.push({ section: requestSections.get(response.request()) || section, method: response.request().method(), path: url.pathname, status: response.status() })
    else if(response.status() >= 400) report.network.push({section:requestSections.get(response.request())||section,externalHost:url.hostname,path:url.pathname,status:response.status()})
  })
  page.on("requestfailed", request => { const url = new URL(request.url()); report.requestFailures.push({ section, path: url.origin === origin ? url.pathname : url.hostname, error: request.failure()?.errorText }) })
  // Same real server route used by the observed guest button. The button was
  // separately exercised in the app browser; no cookie or auth state is forged.
  await page.goto(`${origin}/guest`, { waitUntil: "domcontentloaded", timeout: 90000 })
  if(width < 980) await page.getByRole("button",{name:"Меню",exact:true}).click()
  await page.locator(".malik-sidebar").filter({ visible: true }).waitFor({ state: "visible", timeout: 90000 })
  const sidebar = () => width < 980
    ? page.locator('.malik-mobile-drawer[data-open="true"] .malik-sidebar')
    : page.locator(".malik-sidebar").filter({ visible: true })
  report.navigation = await sidebar().locator("nav button").allTextContents()
  for (const [index, name] of names.entries()) {
    if (selected !== null && index + 1 !== selected) continue
    section = `${String(index + 1).padStart(2, "0")}-${name}`
    const entry = { section, label: name, uiStatus: "UNVERIFIED", workflowStatus: "BLOCKED", blocker: "Full action requires additional model/media quota, hardware, a verified account, or explicit test-data permissions; not submitted by this non-mutating probe.", checks: [], screenshots: [] }
    report.entries.push(entry)
    try {
      if(!page.url().startsWith(origin + '/')) await page.goto(`${origin}/guest`, {waitUntil:'domcontentloaded'})
      if (!(await sidebar().isVisible())) {
        if(!page.url().includes('/dashboard')) await page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" })
        if(width < 980) await page.getByRole("button",{name:"Меню",exact:true}).click()
        await sidebar().waitFor({ state: "visible" })
      }
      await sidebar().getByRole("button", { name, exact: true }).click()
      // Web-first assertions, no blanket sleep or artificial success state.
      if (name === "Новый чат" || name === "Malik Work NEW") await page.locator("textarea").filter({visible:true}).first().waitFor({state:"visible"})
      if (name === "Голосовой режим") await page.locator("[data-voice-mode]").waitFor({state:"visible"})
      if (name === "Проекты PRO" || name === "Создать трек PRO") await page.getByRole("dialog").waitFor({state:"visible"})
      if (name === "Задачи") await page.getByRole("dialog", {name:"Malik AI OS",exact:true}).waitFor({state:"visible"})
      if(name === "Библиотека") {
        const search=page.getByPlaceholder("Поиск по всей истории…")
        await search.fill('malik-audit-no-matches');await search.fill('')
        entry.checks.push({check:'library search input accepts and clears a harmless query',status:'VERIFIED PASS'})
      }
      if(name === "Сайты") await page.getByRole('heading',{name:'Сайты',exact:true}).waitFor()
      if(name === "Генерация видео") await page.locator('[data-view="video-generation-v2"]').waitFor({state:'visible'})
      if(name === "Презентации") await page.locator('.ps-root').waitFor({state:'visible'})
      if(name === "Генерация изображений") {
        await page.locator('[data-view="photo-generation"]').waitFor({state:'visible'})
        entry.blocker='Intentionally closed until Voltframe launch; explicitly reconfirmed by user. Do not restore the removed studio.'
      }
      if(name === "Плагины") {
        const search=page.getByLabel('Поиск плагинов',{exact:true})
        await search.fill('malik-audit-no-matches');await search.fill('')
        entry.checks.push({check:'plugin search input accepts and clears a harmless query; no OAuth or grant submitted',status:'VERIFIED PASS'})
      }
      if(name === "Compute") await page.locator('[data-malik-compute]').waitFor({state:'visible'})
      if (name === "Malik Shorts BETA") {
        await page.waitForURL(/\/shorts|\/sign-in|authkit\.app/)
        entry.uiStatus='BLOCKED';entry.url='/shorts'
        entry.blocker='Guest requests to Shorts identity/following return 401 and the page may redirect to sign-in; real account is required. No login automated.'
        await page.screenshot({path:path.join(output,`${index+1}-${width}-auth-gate.png`)})
        await page.goto(`${origin}/guest`,{waitUntil:'domcontentloaded'})
        console.log(JSON.stringify({section,uiStatus:entry.uiStatus,workflowStatus:entry.workflowStatus,path:entry.url}))
        continue
      }
      if (name === "Переводчик") await page.waitForURL(/\/translator/)
      await page.locator("body").waitFor({ state: "visible" })
      const visibleText = await page.locator("body").innerText()
      assert.doesNotMatch(visibleText, /Application error:|client-side exception|Internal Server Error|500: Internal Server Error/i)
      entry.url = new URL(page.url()).pathname
      entry.headings = await page.locator("h1,h2,h3").allTextContents()
      entry.controls = await page.locator("button,input,textarea,select,[role=combobox]").evaluateAll(elements => elements.filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height).map(e => ({ tag: e.tagName.toLowerCase(), role: e.getAttribute("role"), label: e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.textContent?.trim().slice(0, 100), disabled: Boolean(e.disabled) })))
      entry.checks.push({ check: "navigation and no fatal document error", status: "VERIFIED PASS" })
      const screenshot = path.join(output, `${index + 1}-${width}.png`)
      await page.screenshot({ path: screenshot })
      entry.screenshots.push(screenshot)
      entry.uiStatus = "VERIFIED PASS"
      if (name === "Голосовой режим") {
        const voice=page.getByRole('dialog',{name:'Malik AI Voice Mode',exact:true})
        await voice.getByRole('button',{name:'Закрыть голосовой режим',exact:true}).click()
        await voice.waitFor({state:'hidden'})
        entry.checks.push({check:'voice opens and its own close button removes the modal',status:'VERIFIED PASS'})
      }
      const dialog = page.getByRole("dialog").filter({visible:true})
      if (await dialog.count()) {
        const close = dialog.getByRole("button",{name:/^Закрыть(?: окно)?$/})
        if(await close.count()) await close.click()
        else await page.keyboard.press("Escape")
      }
      // A section is NOT marked globally passed just because navigation worked.
      console.log(JSON.stringify({ section, uiStatus: entry.uiStatus, workflowStatus: entry.workflowStatus, path: entry.url }))
    } catch (error) {
      entry.uiStatus = "FAIL"
      entry.error = safeError(error)
      await page.screenshot({ path: path.join(output, `${index + 1}-failure.png`) }).catch(() => {})
      console.error(JSON.stringify({ section, uiStatus: "FAIL", error: entry.error }))
      break // First broken boundary: diagnose before advancing.
    } finally {
      await fs.writeFile(path.join(output, `sidebar-${selected || "all"}.json`), JSON.stringify(report, null, 2))
    }
  }
  if(selected === null && report.entries.length === 17 && report.entries.every(entry=>entry.uiStatus !== 'FAIL')) {
    report.extras=[]
    for(const [label,selector] of [['Настройки','.malik-sidebar-quickrow button[aria-label="Настройки"]'],['Поддержка','.malik-sidebar-quickrow button[aria-label="Поддержка"]']]) {
      section='footer-'+label
      const entry={section,status:'UNVERIFIED'};report.extras.push(entry)
      try {
        if(width < 980 && !await sidebar().isVisible()) await page.getByRole('button',{name:'Меню',exact:true}).click()
        await sidebar().locator(selector).click()
        const dialog=page.getByRole('dialog');await dialog.waitFor()
        entry.headings=await dialog.locator('h1,h2,h3').allTextContents()
        await page.screenshot({path:path.join(output,`footer-${report.extras.length}-${width}.png`)})
        await dialog.getByRole('button',{name:'Закрыть окно',exact:true}).click()
        entry.status='VERIFIED PASS'
      }catch(error){entry.status='FAIL';entry.error=safeError(error);break}
    }
  }
  await context.close()
} catch (error) {
  report.startupError = safeError(error)
  process.exitCode = 1
  console.error(report.startupError)
} finally {
  await fs.writeFile(path.join(output, `sidebar-${selected || "all"}.json`), JSON.stringify(report, null, 2))
  await browser.close()
}
if (report.entries.some(entry => entry.uiStatus === "FAIL") || report.extras?.some(entry=>entry.status==='FAIL')) process.exitCode = 1
