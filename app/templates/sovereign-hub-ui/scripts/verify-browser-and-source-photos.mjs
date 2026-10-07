import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
function loader(mocks = {}) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText
    new Function("require", "module", "exports", code)((id) => {
      if (id in mocks) return mocks[id]
      if (id.endsWith(".css") || id === "server-only") return {}
      if (!id.startsWith("@/") && !id.startsWith(".")) return require(id)
      const base = id.startsWith("@/") ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id)
      const target = [base, base + ".ts", base + ".tsx"].find((name) => fs.existsSync(name))
      assert(target, `Missing module ${id}`)
      return load(target)
    }, module, module.exports)
    return module.exports
  }
  return load
}
const load = loader()
const { isBrowserTask, shouldUseDigitalBrowser } = load("lib/ai/computer-use.ts")
const positive = ["Открой сайт https://example.com и заполни форму", "Зайди в Gmail и отправь письмо после подтверждения", "Пожалуйста, перейди на github.com и открой репозиторий", "Прочитай новые письма в моей почте", "Open example.com and click the sign-in button", "Could you fill the form on the website?", "Сайтты аш https://example.com"]
const negative = ["Покажи сильные ноутбуки и цены по тенге", "Найди актуальные новости мира", "Найди цены на сайте магазина", "Как открыть сайт?", "Можешь объяснить как открыть сайт?", "Покажи как отправить письмо", "Напиши письмо для отправки", "Составь форму регистрации", "Не отправляй письмо", "Не открыть сайт, а объяснить", "Без браузера найди цены", "Compare book websites", "Show me how to open the website", "Don't send email", "Tell me about Gmail", "Опиши открытый сайт", "", "Открой сайт " + "x".repeat(8000)]
for (const prompt of positive) {
  assert(isBrowserTask(prompt), prompt)
  assert(shouldUseDigitalBrowser(prompt, true), prompt)
  assert(!shouldUseDigitalBrowser(prompt, false), `Chat must never launch: ${prompt}`)
}
for (const prompt of negative) assert(!isBrowserTask(prompt), prompt)

// Exercise real component event handlers without opening an automated browser.
function hooks() {
  let cursor = 0, effects = [], pending = []
  const slots = []
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value }] },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial } },
    useId() { cursor++; return "qa-activity" },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn },
    useEffect(fn, deps) { const i = cursor++; if (!same(effects[i]?.deps, deps)) { pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() } }) } },
  }
  return {
    react,
    render(component, props) { cursor = 0; const tree = component(props); const queue = pending; pending = []; queue.forEach((fn) => fn()); return tree },
    unmount() { effects.forEach((item) => item?.cleanup?.()); effects = [] },
  }
}
function nodes(tree) {
  if (tree == null || typeof tree !== "object") return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}
const activityHooks = hooks()
const activityLoad = loader({ react: activityHooks.react })
const { ChatExecution } = activityLoad("components/sovereign/ChatExecution.tsx")
const trace = { version: 1, id: "qa", startedAt: 100, state: "running", steps: [{ id: "search", title: "Поиск", kind: "search", tool: "web.search", state: "running", startedAt: 110 }] }
const props = { trace, live: true, stages: true, latest: true, writing: true, browserTask: negative[0], workMode: false }
const originalWindow = globalThis.window
globalThis.window = { setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {} }
let tree = activityHooks.render(ChatExecution, props)
const heading = () => nodes(tree).find((item) => item.props?.className === "malik-execution__summary")
assert.equal(heading().props["aria-expanded"], false)
assert(!nodes(tree).some((item) => item.props?.className === "malik-execution__panel"))
assert(!nodes(tree).some((item) => item.type?.name === "MalikDigitalBrowser"))
heading().props.onClick()
tree = activityHooks.render(ChatExecution, props)
assert.equal(heading().props["aria-expanded"], true)
assert(nodes(tree).some((item) => item.props?.className === "malik-execution__panel"))
heading().props.onClick()
tree = activityHooks.render(ChatExecution, { ...props, writing: false })
assert.equal(heading().props["aria-expanded"], false, "Streaming updates cannot reopen the activity panel")
tree = activityHooks.render(ChatExecution, { ...props, workMode: true })
assert(!nodes(tree).some((item) => item.type?.name === "MalikDigitalBrowser"), "Research in Work still needs no computer")
tree = activityHooks.render(ChatExecution, { ...props, workMode: true, browserTask: positive[0] })
assert(nodes(tree).some((item) => item.type?.name === "MalikDigitalBrowser"))
assert.equal(heading().props["aria-expanded"], false)
activityHooks.unmount()

const originalFetch = globalThis.fetch
async function browserTurn({ task = positive[0], workMode = true, autoStart = true, configured = true }) {
  const harness = hooks(), calls = []
  globalThis.fetch = async (_url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null
    calls.push(body || { operation: "availability" })
    return Response.json(body ? { ok: true, status: "complete", sessionId: "qa-session", summary: "Готово", steps: [], screenshots: [] } : { configured })
  }
  const { MalikDigitalBrowser } = loader({ react: harness.react })("components/sovereign/MalikDigitalBrowser.tsx")
  const props = { task, workMode, autoStart, latest: true }
  let tree
  for (let i = 0; i < 8; i++) { tree = harness.render(MalikDigitalBrowser, props); await new Promise((resolve) => setImmediate(resolve)) }
  harness.unmount()
  return { tree, calls }
}
const active = await browserTurn({})
assert.equal(active.calls.filter((call) => call.operation === "start").length, 1, "Live Work request starts exactly once")
assert.equal(active.calls.find((call) => call.operation === "start").workspaceMode, "work")
for (const options of [{ autoStart: false }, { workMode: false }, { task: negative[0] }]) {
  const turn = await browserTurn(options)
  assert.equal(turn.calls.length, 0, "History, Chat and research must not even initialize a browser session")
}
const disconnected = await browserTurn({ configured: false })
assert(!disconnected.calls.some((call) => call.operation === "start"))
assert(nodes(disconnected.tree).some((node) => typeof node.props?.children === "string" && node.props.children.includes("ещё не подключён")))
globalThis.fetch = originalFetch
globalThis.window = originalWindow

// The API repeats the UI gate: a direct request cannot bypass Work intent.
let configured = true, authenticated = true
const operations = []
const api = loader({
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => ({ authenticated, userId: "qa-user" }) },
  "@/lib/server/computer-use-runtime": { malikComputerUseStatus: () => ({ configured }), runMalikComputerTask: async (body) => { operations.push(body); return { ok: true, status: "running", steps: [], screenshots: [] } } },
})("app/api/ai/computer/route.ts")
const post = (body) => api.POST(new Request("https://malikaiworld.world/api/ai/computer", { method: "POST", headers: { "content-type": "application/json", origin: "https://malikaiworld.world" }, body: JSON.stringify(body) }))
for (const body of [{ task: positive[0], confirm: true }, { workspaceMode: "chat", task: positive[0], confirm: true }, { workspaceMode: "work", task: negative[0], confirm: true }]) assert.equal((await post(body)).status, 400)
assert.equal(operations.length, 0)
assert.equal((await post({ workspaceMode: "work", task: positive[0] })).status, 409)
configured = false
assert.equal((await post({ workspaceMode: "work", task: positive[0], confirm: true })).status, 503)
assert.equal(operations.length, 0)
configured = true
assert.equal((await post({ workspaceMode: "work", task: positive[0], confirm: true })).status, 200)
assert.equal((await post({ workspaceMode: "work", operation: "poll", sessionId: "qa-session" })).status, 200)
assert.deepEqual(operations.map((item) => item.operation), ["start", "poll"])
assert.equal((await post({ workspaceMode: "work", operation: "approve", sessionId: "qa-session", confirm: true })).status, 409)
authenticated = false
assert.equal((await post({ workspaceMode: "work", task: positive[0], confirm: true })).status, 401)

const { sourceReferencePhoto } = load("lib/media/source-reference-photos.ts")
const policy = load("lib/ai/reference-visual-policy.ts")
const source = { title: "Купить Lenovo Legion Pro 7 — цена в тенге", url: "https://shop.example/product/lenovo-legion-pro-7", image: "https://cdn.shop.example/legion-7.jpg" }
const plan = { topic: "Lenovo Legion Pro 7", queries: ["laptop"], explicit: true, layout: "landscape" }
assert(policy.planReferenceVisuals(negative[0]), "The user's laptop request must allow reference photographs")
assert.equal(sourceReferencePhoto(plan, [source]).url, source.image)
assert.equal(sourceReferencePhoto({ ...plan, topic: "Lenovo Legion Pro 9" }, [source]), null)
assert.equal(sourceReferencePhoto({ ...plan, topic: "Dell XPS 16", queries: [plan.topic] }, [source]), null, "A broader alias must not substitute another device")
assert.equal(sourceReferencePhoto({ ...plan, topic: "iPhone 16" }, [{ ...source, title: "Apple iPhone 16 Pro", url: "https://shop.example/iphone-16-pro" }]), null)
for (const image of ["data:image/png;base64,AAA", "http://cdn.shop.example/a.jpg", "https://127.0.0.1/a.jpg", "https://localhost/a.jpg", "https://cdn.internal/a.jpg", "https://user:pass@cdn.shop.example/a.jpg", "https://cdn.shop.example:8080/a.jpg", "https://cdn.shop.example/logo.png"]) assert.equal(sourceReferencePhoto(plan, [{ ...source, image }]), null, image)
assert.equal(sourceReferencePhoto({ ...plan, kind: "tutorial" }, [source]), null)
assert.equal(sourceReferencePhoto(plan, [{ ...source, title: "Lenovo Legion Pro 7 vs Dell XPS 16" }]), null)

// Render the actual answer path, including citation context and full-width photo.
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server")
const { MalikMarkdown } = load("components/sovereign/MalikMarkdown.tsx")
function answer(text, question = negative[0]) {
  return renderToStaticMarkup(React.createElement(MalikMarkdown, { text, citations: [source], visualContext: { question, isLatest: true, streaming: true } }))
}
const table = "| Модель | Цена | Экран |\n|---|---|---|\n| Lenovo Legion Pro 7 | 1 200 000 ₸ [1] | 16 дюймов |"
const html = answer(table)
assert(html.includes(`src="${source.image}"`), "Product table must display the real cited page photograph without photo metadata")
assert(html.includes(`href="${source.url}"`))
assert(html.includes("malik-answer-photo-row__image"))
assert(html.includes("1 200 000 ₸") && html.includes("16 дюймов"), "Price and size stay below the matching photo")
assert(!answer(table, negative[0] + " без фото").includes(`src="${source.image}"`))
assert(!answer("```malik-cards\n{partial").includes("Подготавливаю визуальный блок"))
assert(!answer("```malik-visual\n{partial").includes("Подготавливаю визуальный блок"))
console.log("PASS: Work-only browser intent, collapsed activity, one-time live start, no history replay, API gates, sourced model photos and rendered price/size captions")
