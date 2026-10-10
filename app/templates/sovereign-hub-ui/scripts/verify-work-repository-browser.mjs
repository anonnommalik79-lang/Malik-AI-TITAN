// Real React live hook/journal -> real HTTP handlers/SSE -> real executor/artifact exports.
// Auth, model and GitHub are explicit fixtures; this never calls paid providers or production.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { createRequire } from "node:module"
import { workTestLoader } from "./work-test-loader.mjs"
import { reactQaBundle, reactQaRuntime } from "./qa-react-bundle.mjs"

const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const owner = { authenticated: true, userId: "qa-repository-browser", plan: "pro" }
const commit = "a".repeat(40), original = "export const add = (a: number, b: number) => a - b;"
const calls = [], flows = []
const deps = {
  now: Date.now, random: Math.random,
  sleep: async ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 5))),
  async githubRead(ownerId, input, signal) {
    assert.equal(ownerId, owner.userId); signal.throwIfAborted(); calls.push({ tool: "github", ...input })
    if (input.action === "snapshot") return { repo: input.repo, ref: "main", commitSha: commit, truncated: false, tree: [{ path: "add.ts", type: "blob", mode: "100644", size: original.length }] }
    assert.equal(input.action, "file"); assert.equal(input.ref, commit)
    return { content: original, sha: "b".repeat(40) }
  },
  async text(request) {
    await new Promise(resolve => setTimeout(resolve, 400)); request.signal.throwIfAborted()
    const input = JSON.parse(request.prompt); calls.push({ tool: "model", goal: input.goal })
    if (input.goal.includes("QA_FAIL")) throw Object.assign(new Error("Provider denied"), { status: 403 })
    return { content: JSON.stringify(input.readFiles.length ? { action: "finish", finding: "Fixture diagnosis: subtraction observed in add.ts.", files: [{ path: "add.ts", content: original.replace("a - b", "a + b") }] } : { action: "read", paths: ["add.ts"] }), provider: "qa-model", model: "fixture" }
  },
}
const load = workTestLoader({ "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => owner }, "@/lib/os/runtime": { serverToolDeps: () => deps } })
const store = load("lib/os/store.ts"); store.configureOsBackend(store.memoryBackend())
const start = load("app/api/os/flows/route.ts").POST
const getFlow = load("app/api/os/flows/[id]/route.ts").GET
const stream = load("app/api/os/flows/[id]/events/route.ts").GET
const exportArtifact = load("app/api/os/artifacts/[id]/export/route.ts").GET
const { modules, bundle } = reactQaBundle()
const journal = bundle("components/sovereign/os/WorkJournal.tsx")
const client = bundle("components/sovereign/os/os-client.ts")
const css = fs.readFileSync("components/sovereign/os/work-journal.css", "utf8")
modules["qa-repository-journal"] = `const React=require('react'),{useLiveFlow}=require(${JSON.stringify(client)}),{WorkJournal}=require(${JSON.stringify(journal)});
function Fixture(){const[id,setId]=React.useState();const{flow,artifacts}=useLiveFlow(id);React.useEffect(()=>{fetch('/api/os/flows',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceMode:'work',clientRequestId:'qa-browser-'+crypto.randomUUID(),goal:'Изучи https://github.com/qa-owner/qa-repo и исправь ошибку '+(location.search.includes('fail')?'QA_FAIL':'')})}).then(r=>r.json()).then(r=>setId(r.flow.id))},[]);
return React.createElement(React.Fragment,null,React.createElement('p',{'data-testid':'status'},flow?.status||'starting'),React.createElement(WorkJournal,{events:flow?.events||[]}),...Object.values(artifacts).filter(a=>a.kind==='code').map(a=>React.createElement('a',{key:a.id,href:'/api/os/artifacts/'+a.id+'/export?format=zip'},'Скачать patch ZIP')))}module.exports={Fixture};`
const boot = `${reactQaRuntime(modules)}require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(require('qa-repository-journal').Fixture));`
const server = http.createServer(async (req, res) => {
  const abort = new AbortController(); res.on("close", () => abort.abort())
  try {
    const url = new URL(req.url, "http://127.0.0.1"), matched = url.pathname.match(/^\/api\/os\/(flows|artifacts)\/([\w-]+)(\/events|\/export)?$/)
    let response
    if (url.pathname === "/api/os/flows" && req.method === "POST") {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      response = await start(new Request(url, { method: "POST", body: Buffer.concat(chunks), headers: { "content-type": "application/json" } }))
      if (response.ok) flows.push((await response.clone().json()).flow.id)
    } else if (matched) {
      const context = { params: Promise.resolve({ id: matched[2] }) }, request = new Request(url, { signal: abort.signal })
      response = matched[1] === "artifacts" ? await exportArtifact(request, context) : matched[3] === "/events" ? await stream(request, context) : await getFlow(request, context)
    } else {
      res.setHeader("content-type", "text/html; charset=utf-8")
      res.end(`<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#000;color:#eee;font:16px Arial;margin:20px}main{max-width:800px;margin:auto}a{color:inherit}${css}</style><main><p>QA: настоящий журнал и runtime; внешние провайдеры — fixtures</p><div id="root"></div></main><script>${boot}</script></html>`); return
    }
    res.writeHead(response.status, Object.fromEntries(response.headers))
    const reader = response.body?.getReader(); if (!reader) { res.end(); return }
    const cancel = () => { void reader.cancel().catch(() => undefined) }; res.on("close", cancel)
    try { for (;;) { const part = await reader.read(); if (part.done || res.destroyed) break; res.write(Buffer.from(part.value)) } }
    finally { res.off("close", cancel); reader.releaseLock() }
    res.end()
  } catch (error) { if (!res.headersSent) res.writeHead(500); if (!res.destroyed) res.end(String(error)) }
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
let passed = 0
try {
  for (const [width, height, fail] of [[1440, 900, false], [390, 844, false], [390, 844, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, acceptDownloads: true }), errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}/${fail ? "?fail" : ""}`)
    await page.locator(".malik-work-journal summary").click()
    await page.waitForFunction(expected => document.querySelector('[data-testid="status"]')?.textContent === expected, fail ? "failed" : "completed", { timeout: 45000 })
    const saved = await store.getFlow(owner.userId, flows.at(-1))
    assert.equal(saved.status, fail ? "failed" : "completed")
    assert.equal(await page.locator(".malik-work-journal li").count(), saved.events.length)
    const text = await page.locator("body").innerText()
    assert.match(text, /Открываю GitHub и фиксирую исходный SHA/)
    assert.doesNotMatch(text, /Запускаю тесты|Редактирую GitHub/)
    if (fail) {
      assert.match(text, /Ошибка инструмента|Шаг не выполнен/)
      assert.equal(await page.getByRole("link", { name: "Скачать patch ZIP" }).count(), 0)
      assert.ok(!saved.events.some(event => event.type === "artifact.ready"))
    } else {
      assert.match(text, /Читаю файл: add.ts|code.syntax-check/)
      const download = page.waitForEvent("download"); await page.getByRole("link", { name: "Скачать patch ZIP" }).click()
      const zip = await download; assert.match(zip.suggestedFilename(), /\.zip$/); assert.equal(await zip.failure(), null)
      const bytes = fs.readFileSync(await zip.path()); assert.equal(bytes.subarray(0, 2).toString(), "PK")
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    if (process.env.MALIK_QA_OUTPUT) { fs.mkdirSync(process.env.MALIK_QA_OUTPUT, { recursive: true }); await page.screenshot({ path: path.join(process.env.MALIK_QA_OUTPUT, `work-repository-journal-${width}-${fail ? "failed" : "completed"}.png`) }) }
    await page.close(); passed++; console.log(`PASS ${width} ${fail ? "failure without artifact" : "real SSE receipts + ZIP download"}`)
  }
  assert.ok(calls.some(call => call.tool === "github" && call.action === "file"))
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
console.log(`${passed}/3 browser integration scenarios PASS; real journal/hook/API/SSE/executor/export, fixture auth/model/GitHub, not full dashboard or live production QA.`)
