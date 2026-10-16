// Actual founder React views -> HTTP API -> encrypted filesystem records.
// Auth/directory/model are fixtures, never a real account or production data.
import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { workTestLoader } from "./work-test-loader.mjs"
import { reactQaBundle, reactQaRuntime } from "./qa-react-bundle.mjs"

const require = createRequire(import.meta.url)
const playwright = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "malik-founder-browser-"))
const savedEnv = { ...process.env }
for (const key of Object.keys(process.env)) if (/^(FOUNDER_HISTORY_|FOUNDER_DATABASE_URL$|DATABASE_URL$|PRIVATE_STATE_|MEDIA_STORAGE_|AWS_|R2_|CLOUDFLARE_R2_|S3_BUCKET$|STORAGE_BUCKET$)/.test(key)) delete process.env[key]
Object.assign(process.env, { WORKOS_COOKIE_PASSWORD: "offline-founder-browser-".repeat(3), WORKOS_API_KEY: "fixture", MALIK_OWNER_EMAIL: "owner@example.test" })
const users = [{ id: "customer-a", email: "alpha@example.test", name: "Alpha" }, { id: "customer-b", email: "beta@example.test", name: "Beta" }]
const load = workTestLoader({
  "node:os": { tmpdir: () => temporary },
  "@/lib/auth/server": { getOptionalWorkOSAuth: async () => ({ user: { id: "owner", email: "owner@example.test", emailVerified: true } }) },
  "@/lib/server/request-safety": { fetchWithTimeout: async () => Response.json({ data: users }) },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => ({ authenticated: true, userId: users[0].email }) },
})
const store = load("lib/server/founder-message-log.ts")
const audit = load("lib/server/founder-request-audit.ts")
const messages = load("app/api/founder/messages/route.ts")
const activity = load("app/api/founder/activity/route.ts")
const frame = (type, payload) => `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
const wire = frame("content", { content: "Discarded draft", contentMode: "delta" }) + frame("done", { ok: true, finalContent: "Alpha verified answer password=hidden123", model: "fixture-model" })
const result = await audit.withFounderRequestAudit(async () => new Response(wire, { headers: { "content-type": "text/event-stream" } }))(new Request("http://localhost/api/stream", { method: "POST", body: JSON.stringify({ prompt: "Alpha request" }) }))
await result.text()
await store.appendFounderMessage({ id: "beta-1", userId: users[1].email, source: "chat", userText: "Beta request", assistantText: "Beta answer", status: "success" })
await store.appendFounderMessage({ id: "pending-1", userId: users[0].email, source: "chat", userText: "Pending request", assistantText: "", status: "pending" })

const { modules, bundle } = reactQaBundle()
modules["@/lib/auth/client-session"] = "module.exports={getStoredAuthSnapshot:()=>({isAdmin:true,email:'owner@example.test'})}"
const mainView = bundle("app/founder/history/FounderHistoryClient.tsx")
const legacyView = bundle("components/sovereign/FounderMessageHistoryRuntime.tsx")
const boot = `${reactQaRuntime(modules)}require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(require(location.pathname==='/legacy'?${JSON.stringify(legacyView)}:${JSON.stringify(mainView)}).default));`.replace(/<\/script/giu, "<\\/script")
const cssDirectory = path.join(process.cwd(), ".next/static/css")
const cssFiles = fs.readdirSync(cssDirectory).filter(file => file.endsWith(".css")).map(file => fs.readFileSync(path.join(cssDirectory, file), "utf8"))
const css = cssFiles.find(text => text.includes("@layer utilities"))
assert.ok(css, "Build CSS is required for real layout QA")
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost")
    let response
    if (url.pathname === "/api/founder/overview") response = Response.json({ ok: true, recentUsers: users })
    else if (url.pathname === "/api/founder/activity") response = await activity.GET(new Request(url))
    else if (url.pathname === "/api/founder/messages") response = await messages.GET(new Request(url))
    else {
      res.setHeader("content-type", "text/html;charset=utf-8")
      res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;background:#000;color:#fff}html{color-scheme:dark}</style>${url.pathname === "/legacy" ? '<section class="malik-founder-layer"><div class="malik-founder-header__actions"></div></section>' : ""}<div id="root"></div><script>${boot}</script></html>`)
      return
    }
    if (res.destroyed) return
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(await response.text())
  } catch { if (!res.headersSent) res.writeHead(500); res.end("QA fixture server error") }
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
let browser
let passed = 0
try {
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MALIK_QA_CHROMIUM_EXECUTABLE } : {}) })
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.clock.install()
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByRole("heading", { name: "История запросов", exact: true }).waitFor()
    await page.locator("aside").getByRole("button").filter({ hasText: "alpha@example.test" }).click()
    await page.getByRole("button").filter({ hasText: "Alpha request" }).click()
    await page.getByText("Alpha verified answer password=[REDACTED]", { exact: true }).waitFor()
    assert.doesNotMatch(await page.locator("body").innerText(), /Discarded draft|hidden123|Beta request/)
    assert.match(await page.locator("body").innerText(), /временном диске/)
    await page.getByRole("button").filter({ hasText: "Pending request" }).click()
    const completeText = `Pending completed ${width}`
    await store.appendFounderMessage({ id: "pending-1", userId: users[0].email, source: "chat", userText: "Pending request", assistantText: completeText, status: "success" })
    await page.clock.runFor(30_100)
    await page.getByText(completeText, { exact: true }).waitFor()
    await page.getByRole("button").filter({ hasText: "Alpha request" }).click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    if (process.env.MALIK_QA_OUTPUT) { fs.mkdirSync(process.env.MALIK_QA_OUTPUT, { recursive: true }); await page.screenshot({ path: path.join(process.env.MALIK_QA_OUTPUT, `founder-history-${width}.png`), fullPage: true }) }
    await page.goto(`http://127.0.0.1:${server.address().port}/legacy`)
    await page.getByRole("button", { name: "История сообщений пользователей", exact: true }).click()
    await page.locator("aside").getByRole("button").filter({ hasText: "alpha@example.test" }).click()
    await page.getByText("Alpha verified answer password=[REDACTED]", { exact: true }).waitFor()
    await page.locator("aside").getByRole("button").filter({ hasText: "beta@example.test" }).click()
    await page.getByText("Beta answer", { exact: true }).waitFor()
    assert.equal(await page.getByText("Alpha request", { exact: true }).count(), 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    assert.deepEqual(errors, [])
    if (process.env.MALIK_QA_OUTPUT) await page.screenshot({ path: path.join(process.env.MALIK_QA_OUTPUT, `founder-messages-${width}.png`) })
    await page.close()
    passed++
    console.log(`PASS ${width}px: real views/API/encrypted records, owner selection, final reply, auto-refresh, no horizontal overflow`)
  }
} finally {
  await browser?.close()
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
  Object.assign(process.env, savedEnv)
  if (!path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unsafe fixture cleanup")
  fs.rmSync(temporary, { recursive: true, force: true })
}
console.log(`${passed}/2 browser flows PASS; fixture auth/directory/model, not live WorkOS or production deployment`)
