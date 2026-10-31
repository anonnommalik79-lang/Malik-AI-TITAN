// The real ChatBuild cards and the Live Preview panel in Chromium, with the
// app's whole CSS cascade (layout.tsx sheets): a site being built step by
// step, the finished result and the panel beside the chat, a game, a phone.
// Fixture events only — no model, no network.
//   MALIK_QA_PLAYWRIGHT_PATH   path to playwright or playwright-core
//   MALIK_QA_CHROMIUM_EXECUTABLE   a Chromium binary (optional)
//   MALIK_QA_OUTPUT   a folder for screenshots (optional)
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { createRequire } from "node:module"
import { reactQaBundle, reactQaRuntime } from "./qa-react-bundle.mjs"
import { workTestLoader } from "./work-test-loader.mjs"
import { PLATFORMER_2D, PROMPT_C } from "./game-acceptance-fixtures.mjs"

const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const { modules, bundle } = reactQaBundle()
const build = bundle("components/sovereign/ChatBuild.tsx")
// The same module key ChatBuild.tsx resolves to, so both share one preview store.
const panel = bundle(path.join("components/sovereign", "./ChatBuildPreview") + ".tsx")
const lib = bundle("lib/ai/chat-build.ts")
const sheets = [...fs.readFileSync("app/layout.tsx", "utf8").matchAll(/import ["'](\.\/[^"']+\.css)["']/g)].map((match) => fs.readFileSync(path.join("app", match[1]), "utf8"))
sheets.push(fs.readFileSync("components/sovereign/chat-build.css", "utf8"))

// A real Malik game page, built by the studio pipeline from the acceptance fixture.
const load = workTestLoader()
const { buildGame } = load("lib/games/studio.ts")
const { LOGIC_START, LOGIC_END } = load("lib/games/author.ts")
let calls = 0
const game = await buildGame({ prompt: PROMPT_C, model: async () => (++calls === 1 ? "{}" : `${LOGIC_START}\n${PLATFORMER_2D}\n${LOGIC_END}`), polishUntil: Date.now() - 1 })

const site = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANATOMIA — студия движения</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#0d0d10;color:#f3efe6}header{display:flex;justify-content:space-between;padding:22px 5vw}section{min-height:80vh;padding:12vh 5vw}h1{font-size:clamp(48px,9vw,140px);line-height:.9;margin:0;letter-spacing:-.04em}.hero{background:radial-gradient(circle at 70% 30%,#c9562f,#0d0d10 60%)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{aspect-ratio:3/4;border-radius:18px;background:linear-gradient(160deg,#2b2b33,#15151a)}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style></head>
<body><header><b>ANATOMIA</b><nav>Работы · Студия · Контакты</nav></header><section class="hero"><h1>Тело<br>в движении</h1><p>Студия пластики и танца.</p></section><section><div class="grid"><div class="card"></div><div class="card"></div><div class="card"></div></div></section><section><h2>Контакты</h2></section><script>document.querySelector("p").textContent += " Сайт запущен."</script></body></html>`
const siteAnswer = `Готово — сайт студии.\n\n\`\`\`html filename=index.html\n${site}\n\`\`\`\n\nЧто дальше: могу добавить страницу расписания.`
const gameAnswer = `Игра готова.\n\n\`\`\`html filename=index.html\n${game.html}\n\`\`\`\n\n**Проверка:** синтаксис пройден.`

const bootstrap = `${reactQaRuntime(modules)}
const B=require(${JSON.stringify(build)}),P=require(${JSON.stringify(panel)}),L=require(${JSON.stringify(lib)});
const root=require('react-dom/client').createRoot(document.getElementById('shell'));
window.qaRender=(item)=>{
  const files=item&&!item.live?L.chatBuildFiles(item.content):[];const primary=L.chatBuildPrimary(files);
  const chat=!item?null:item.live
    ?React.createElement(B.ChatBuildSteps,{kind:item.kind,question:item.question,trace:item.trace,live:true,content:item.content})
    :React.createElement(React.Fragment,null,
      React.createElement(B.ChatBuildSteps,{kind:item.kind,question:item.question,trace:item.trace,live:false,content:''}),
      React.createElement(B.ChatBuildResult,{messageId:item.id,kind:item.kind,question:item.question,files,primary,warnings:false,autoOpen:item.autoOpen!==false}));
  root.render(React.createElement(React.Fragment,null,
    React.createElement('section',{style:{flex:1,minWidth:0,overflow:'auto',padding:'24px clamp(16px,4vw,40px)'}},
      React.createElement('div',{className:'malik-message-card-assistant',style:{maxWidth:780,margin:'0 auto'}},chat)),
    React.createElement(P.ChatBuildPreviewPanel,{variant:'aside'})));
};
window.qaRender(null);`
const server = http.createServer((req, res) => {
  if (req.url === "/favicon.ico") { res.writeHead(204); res.end(); return }
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${sheets.join("\n")}\nbody{margin:0;background:#000}</style><div id="malik-root"><div class="malik-dashboard-shell" id="shell" style="display:flex;height:100vh;overflow:hidden"></div></div><script>${bootstrap.replace(/<\/script/gi, "<\\/script")}</script></html>`)
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))

const status = (id, title, at) => ({ id, title, kind: "status", state: "completed", startedAt: at, endedAt: at })
const out = process.env.MALIK_QA_OUTPUT || ""
let failures = 0
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
async function check(name, width, run) {
  const page = await browser.newPage({ viewport: { width, height: 860 } })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  // A game focuses its Play button; Chromium refuses focus inside a sandboxed frame and says so. Not an error of the page.
  page.on("console", (message) => { if (message.type() === "error" && !/^Blocked autofocusing on a <button> element in a cross-origin subframe/.test(message.text())) errors.push(message.text()) })
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    if (!(await page.evaluate(() => typeof window.qaRender === "function"))) throw new Error(`the QA page did not start: ${errors.join(" | ")}`)
    await run(page, async (shot) => { if (out) { fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, `${shot}.png`) }) } })
    assert.deepEqual(errors, [], "no errors in the page")
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures++
    console.log(`  FAIL ${name}\n       ${String(error && error.message || error).split("\n").slice(0, 8).join("\n       ")}`)
  } finally {
    await page.close()
  }
}

await check("a site is built step by step, without code on screen", 1440, async (page, shot) => {
  const start = await page.evaluate(() => Date.now())
  const trace = (steps) => ({ version: 1, id: "srv", startedAt: start, state: "running", steps: [{ id: "m:request", title: "Отправка запроса", kind: "status", state: "completed", startedAt: start }, ...steps] })
  const question = "Создай сайт студии танца ANATOMIA"
  await page.evaluate((item) => window.qaRender(item), { live: true, kind: "site", question, trace: trace([]), content: "" })
  await page.waitForSelector(".malik-build[data-state=running]")
  assert.equal(await page.locator(".malik-build__steps li").count(), 1)
  assert.match(await page.locator(".malik-build__steps li").first().innerText(), /Анализ запроса/)
  assert.equal(await page.locator(".malik-build__steps li[data-state=running] .animate-spin").count(), 1, "the current step spins")
  await page.evaluate((item) => window.qaRender(item), { live: true, kind: "site", question, content: "", trace: trace([status("s1", "Проектирую композицию под вашу задачу", start + 900), status("s2", "Подбираю изображения по теме без загрузки файлов на сервер", start + 2100)]) })
  await page.waitForTimeout(350)
  const rows = await page.locator(".malik-build__steps li").evaluateAll((items) => items.map((li) => [li.dataset.state, li.querySelector(".malik-build__title").textContent]))
  assert.deepEqual(rows.map((row) => row[0]), ["done", "done", "running"], "finished steps get their check, the newest one spins")
  const half = siteAnswer.slice(0, siteAnswer.indexOf("<section"))
  const writingSteps = [status("s1", "Проектирую композицию под вашу задачу", start + 900), status("s2", "Подбираю изображения по теме без загрузки файлов на сервер", start + 2100), status("s3", "Ответ поступает в чат", start + 2600)]
  await page.evaluate((item) => window.qaRender(item), { live: true, kind: "site", question, content: half, trace: trace(writingSteps) })
  await page.waitForTimeout(300)
  const writing = await page.locator(".malik-build__steps li[data-state=running]").innerText()
  assert.match(writing, /Пишу код · index\.html · \d+ строк/, writing)
  assert.equal(await page.locator("pre, code, .malik-md-codeblock").count(), 0, "no code is shown while it is written")
  const t1 = await page.locator(".malik-build__head time").innerText()
  await page.waitForTimeout(700)
  assert.notEqual(await page.locator(".malik-build__head time").innerText(), t1, "the timer runs")
  await shot("1-site-live")
})

await check("the finished site: steps, result card and the Live Preview beside the chat", 1440, async (page, shot) => {
  const start = 1_000_000
  const trace = { version: 1, id: "srv", startedAt: start, state: "completed", endedAt: start + 17_500, steps: [
    status("s1", "Проектирую композицию под вашу задачу", start + 1200), status("s2", "Подбираю изображения по теме без загрузки файлов на сервер", start + 4600),
    status("s3", "Ответ поступает в чат", start + 6100), status("s4", "Проверяю сайт и дорабатываю слабые места", start + 14_000),
  ] }
  await page.evaluate((item) => window.qaRender(item), { id: "site-1", kind: "site", question: "Создай сайт студии танца ANATOMIA", trace, content: siteAnswer })
  await page.waitForSelector(".malik-build-preview")
  assert.deepEqual(await page.locator(".malik-build__steps li").evaluateAll((items) => items.map((li) => li.dataset.state)), ["done", "done", "done", "done", "done"])
  assert.deepEqual(await page.locator(".malik-build__time").allInnerTexts(), ["1,2 сек", "3,4 сек", "1,5 сек", "7,9 сек", "3,5 сек"])
  assert.match(await page.locator(".malik-build__done").innerText(), /Сайт успешно создан! Итого: 17,5 сек/)
  assert.match(await page.locator(".malik-build-result__folder").innerText(), /anatomia-студия-движения\//)
  assert.deepEqual(await page.locator(".malik-build-result__file").allInnerTexts(), ["index.html"])
  assert.equal(await page.locator(".malik-build-result__thumb iframe").getAttribute("sandbox"), "allow-scripts")
  const facts = await page.locator(".malik-build-result__facts dd").allInnerTexts()
  assert.equal(facts.length, 4)
  assert.match(facts[1], /HTML5, CSS3, JavaScript/)
  assert.equal(facts[2], "ПК, планшет, телефон")
  // The panel opened by itself, beside the chat, about half the screen.
  const box = await page.locator(".malik-build-preview").boundingBox()
  assert.ok(box.x > 600 && box.width > 600 && box.width < 800 && box.height > 800, JSON.stringify(box))
  assert.match(await page.locator(".malik-build-preview__title").innerText(), /LIVE PREVIEW/)
  const frame = page.frameLocator(".malik-build-preview iframe")
  await frame.locator("text=Сайт запущен.").waitFor({ timeout: 5000 })
  assert.equal(await page.locator(".malik-build-preview__zoom-value").innerText(), "50%", "a desktop page is laid out wide and scaled to the panel")
  await shot("2-site-done")
  await page.click(".malik-build-preview__devices button[aria-label=Телефон]")
  await page.waitForTimeout(250)
  assert.equal(await page.locator(".malik-build-preview__size").innerText(), "390 × 844")
  const phone = await page.locator(".malik-build-preview iframe").evaluate((el) => ({ width: el.style.width, scale: el.style.transform }))
  assert.equal(phone.width, "390px")
  await shot("3-site-phone")
  await page.click(".malik-build-preview__devices button[aria-label=Планшет]")
  await page.waitForTimeout(150)
  assert.equal(await page.locator(".malik-build-preview__size").innerText(), "768 × 1024")
  const zoom = await page.locator(".malik-build-preview__zoom-value").innerText()
  await page.click(".malik-build-preview__zoom button[aria-label=Увеличить]")
  assert.notEqual(await page.locator(".malik-build-preview__zoom-value").innerText(), zoom, "zoom steps")
  await page.click(".malik-build-preview button[aria-label='Закрыть предпросмотр']")
  assert.equal(await page.locator(".malik-build-preview").count(), 0)
  assert.match(await page.locator(".malik-build-result__actions .is-primary").innerText(), /Открыть превью/)
  await page.click(".malik-build-result__actions .is-primary")
  await page.waitForSelector(".malik-build-preview")
  assert.match(await page.locator(".malik-build-result__actions .is-primary").innerText(), /Скрыть превью/)
})

await check("a game: static thumbnail, the game runs only in the panel", 1440, async (page, shot) => {
  const start = 2_000_000
  const trace = { version: 1, id: "g", startedAt: start, state: "completed", endedAt: start + 48_200, steps: [
    status("g1", "Проектирую игру: жанр, механики, уровни и стиль", start + 900), status("g2", "Пишу код игры", start + 6000),
    status("g3", "Проверяю синтаксис и безопасность кода", start + 31_000), status("g4", "Запускаю игру в изолированной песочнице: 600 кадров с управлением", start + 31_300),
    status("g5", "Собираю страницу игры", start + 47_000), status("g6", "Ответ поступает в чат", start + 48_100),
  ] }
  await page.evaluate((item) => window.qaRender(item), { id: "game-1", kind: "game", question: "Сделай игру платформер", trace, content: gameAnswer })
  await page.waitForSelector(".malik-build-preview iframe")
  assert.match(await page.locator(".malik-build__done").innerText(), /Игра успешно создана! Итого: 48,2 сек/)
  assert.equal(await page.locator(".malik-build__steps li").count(), 6)
  assert.equal(await page.locator(".malik-build-result__thumb iframe").getAttribute("sandbox"), "", "no second copy of the game runs in the thumbnail")
  const facts = await page.locator(".malik-build-result__facts dt").allInnerTexts()
  assert.equal(facts[0].toLowerCase(), "движок")
  assert.match((await page.locator(".malik-build-result__facts dd").allInnerTexts())[0], /2D · Canvas/)
  await page.frameLocator(".malik-build-preview iframe").locator("button[data-act=play]").waitFor({ timeout: 8000 })
  await page.waitForTimeout(800)
  await shot("4-game-done")
})

await check("on a phone the panel opens on request, over the whole screen", 390, async (page, shot) => {
  const trace = { version: 1, id: "srv", startedAt: 0, state: "completed", endedAt: 9000, steps: [status("s1", "Проектирую композицию под вашу задачу", 1000), status("s2", "Ответ поступает в чат", 2500)] }
  await page.evaluate((item) => window.qaRender(item), { id: "site-phone", kind: "site", question: "Создай сайт студии танца ANATOMIA", trace, content: siteAnswer })
  await page.waitForSelector(".malik-build-result")
  await page.waitForTimeout(300)
  assert.equal(await page.locator(".malik-build-preview").count(), 0, "a phone is not covered by itself")
  // The app's phone sheets paint every <header> navy: the build's surfaces stay one flat black.
  const paint = await page.evaluate(() => [".malik-build", ".malik-build__head", ".malik-build-result", ".malik-build-result__head", ".malik-build-result__facts div"]
    .map((selector) => [selector, getComputedStyle(document.querySelector(selector)).backgroundColor]))
  for (const [selector, color] of paint) assert.ok(color === "rgb(0, 0, 0)" || color === "rgba(0, 0, 0, 0)", `${selector} is ${color}`)
  const titles = await page.locator(".malik-build__title").evaluateAll((items) => items.map((el) => el.scrollHeight - el.clientHeight))
  assert.ok(titles.every((hidden) => hidden <= 1), `step names are not cut off on a phone (${titles})`)
  const buttons = await page.locator(".malik-build-result__actions button").evaluateAll((items) => items.map((el) => Math.round(el.getBoundingClientRect().height)))
  assert.ok(buttons.every((height) => height >= 44), `buttons fit a thumb (${buttons})`)
  const overflow = await page.evaluate(() => document.querySelector("section").scrollWidth - document.querySelector("section").clientWidth)
  assert.ok(overflow <= 1, `no sideways scroll (${overflow}px)`)
  await shot("5-phone-result")
  await page.click(".malik-build-result__thumb")
  await page.waitForSelector(".malik-build-preview")
  const box = await page.locator(".malik-build-preview").boundingBox()
  assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 390, 860])
  const bars = await page.evaluate(() => [".malik-build-preview", ".malik-build-preview__bar", ".malik-build-preview__report"].map((selector) => getComputedStyle(document.querySelector(selector)).backgroundColor))
  assert.deepEqual(bars, ["rgb(0, 0, 0)", "rgb(0, 0, 0)", "rgb(0, 0, 0)"], "the preview's bars are black on a phone")
  await shot("6-phone-panel")
  await page.keyboard.press("Escape")
  assert.equal(await page.locator(".malik-build-preview").count(), 0, "Escape closes the full-screen preview")
})

await browser.close()
server.close()
console.log(failures ? `\n${failures} build check(s) failed` : "\nall chat build checks passed")
process.exit(failures ? 1 : 0)
