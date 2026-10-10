// Real transport and handlers; model/session/cloud IO are deterministic stubs.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const cache = new Map()
let entitlement = { authenticated: true, userId: "account-a", plan: "free" }
const turns = new Map(), tails = []
let modelCalls = 0, modelRequest, modelResponse
const mocks = {
  "server-only": {},
  "next/server": { after(run) { tails.push(run()) }, NextResponse: { redirect(url) { return { url: String(url), cookies: { set() {} } } } } },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => entitlement },
  "@/lib/server/request-frequency": { takeRequestFrequency: () => true },
  "@/lib/server/background-chat-turns": {
    normalizeBackgroundTurnId: (id) => id.toLowerCase(),
    startBackgroundChatTurn: async (id, ownerId) => {
      if (turns.has(id)) return false
      turns.set(id, { ownerId, status: "pending" }); return true
    },
    completeBackgroundChatTurn: async (id, data) => turns.set(id, { ...turns.get(id), ...data, status: "complete" }),
    failBackgroundChatTurn: async (id, error, execution, content) => turns.set(id, { ...turns.get(id), status: "failed", error: String(error), execution, content }),
    readBackgroundChatTurn: async (id) => turns.get(id),
  },
}
function load(file) {
  const full = path.resolve(file)
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const js = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", js)((name) => {
    if (name in mocks) return mocks[name]
    if (full.replaceAll("\\", "/").endsWith("/background/route.ts") && name === "../route") return { POST: async (request) => { modelCalls++; modelRequest = request; return modelResponse } }
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(full), name)
      return load(base + ".ts")
    }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}

const { pollingChatResponse } = load("lib/ai/chat-poll-transport.ts")
const { parseChatSseFrame } = load("lib/ai/chat-stream-contract.ts")
const { guestRedirectOrigin, getRenderAccessOrigin } = load("lib/auth/guest-origin.ts")
const postRoute = load("app/api/stream/background/route.ts")
const statusRoute = load("app/api/stream/background/[turnId]/route.ts")
const id = "b33b3ae7-5047-4d1e-b920-0c6b9677d6f1"
const frame = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
const wireResponse = () => new Response(frame("content", { content: "Әлем 🌍" }) + frame("done", { ok: true, content: "Әлем 🌍", usedWeb: true, sources: [{ url: "https://example.test/source" }] }), { headers: { "content-type": "text/event-stream" } })
const admission = () => new Response(JSON.stringify({ ok: true, turnId: id }), { status: 202, headers: { "content-type": "application/json", "preference-applied": "respond-async", "x-malik-background-turn-id": id } })
const events = (text) => text.split(/\r?\n\r?\n/).map(parseChatSseFrame).filter(Boolean)
const request = (prefer = "respond-async") => new Request("https://malikaiworld.world/api/stream/background", { method: "POST", headers: { "x-malik-background-turn-id": id, prefer, accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ question: "Hello" }) })
let count = 0
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`) }

await check("async admission returns finite JSON while internal SSE retains the complete answer and sources", async () => {
  modelResponse = wireResponse()
  const response = await postRoute.POST(request())
  assert.equal(response.status, 202)
  assert.equal(response.headers.get("preference-applied"), "respond-async")
  assert.match(response.headers.get("cache-control"), /private.*no-store/)
  assert.equal((await response.json()).turnId, id)
  assert.equal(modelRequest.headers.get("accept"), "text/event-stream")
  assert.equal((await modelRequest.json()).question, "Hello")
  await Promise.all(tails.splice(0))
  assert.equal(turns.get(id).content, "Әлем 🌍")
  assert.equal(turns.get(id).status, "complete")
  assert.equal(turns.get(id).responseMetadata.sources.length, 1)
  assert.equal(modelCalls, 1)
})
await check("duplicate async POST cannot regenerate or consume another model request", async () => {
  const response = await postRoute.POST(request())
  assert.equal(response.status, 409); assert.equal(modelCalls, 1)
})
await check("guest async admission is rejected before creating an unreadable job", async () => {
  turns.clear(); entitlement = { authenticated: false, userId: "guest:fixture", plan: "free" }
  assert.equal((await postRoute.POST(request())).status, 401)
  assert.equal(modelCalls, 1); assert.equal(turns.size, 0)
  entitlement = { authenticated: true, userId: "account-a", plan: "free" }
})
await check("quota and Compute errors keep their real HTTP status and body", async () => {
  for (const status of [403, 429, 503]) {
    turns.clear(); modelResponse = Response.json({ ok: false, code: "MALIK_COMPUTE_STORAGE_UNAVAILABLE" }, { status })
    const response = await postRoute.POST(request())
    assert.equal(response.status, status)
    assert.equal(response.headers.get("preference-applied"), null)
    assert.equal((await response.json()).ok, false)
    await Promise.all(tails.splice(0))
    assert.equal(turns.get(id).status, "failed")
  }
})
await check("normal streaming and owner isolation are preserved", async () => {
  turns.clear(); modelResponse = wireResponse()
  const response = await postRoute.POST(request(""))
  assert.equal(response.status, 200); assert.match(await response.text(), /Әлем/)
  await Promise.all(tails.splice(0))
  const read = () => statusRoute.GET(new Request(`https://malikaiworld.world/api/stream/background/${id}`), { params: Promise.resolve({ turnId: id }) })
  assert.equal((await read()).status, 200)
  entitlement = { authenticated: true, userId: "account-b", plan: "free" }
  assert.equal((await read()).status, 404)
  entitlement = { authenticated: false, userId: "account-a", plan: "free" }
  assert.equal((await read()).status, 404)
  entitlement = { authenticated: true, userId: "account-a", plan: "free" }
})
await check("polling performs GET only and delivers one complete UTF-8 answer with metadata", async () => {
  const calls = []
  const response = pollingChatResponse(admission(), { signal: new AbortController().signal, pollMs: 1,
    fetcher: async (url, init) => {
      calls.push({ url, ...init })
      return Response.json({ turn: calls.length === 1 ? { status: "pending" } : { status: "complete", content: "Әлем 🌍", usedWeb: true, sources: [{ url: "https://example.test/source" }] } })
    },
  })
  const result = events(await response.text())
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.method === "GET" && call.credentials === "same-origin" && call.url === `/api/stream/background/${id}`))
  assert.equal(result.filter(e => e.type === "content").length, 1)
  assert.equal(result.find(e => e.type === "content").payload.content, "Әлем 🌍")
  assert.equal(result.find(e => e.type === "done").payload.sources.length, 1)
  assert.equal(result.find(e => e.type === "done").payload.usedWeb, true)
})
await check("polling stops immediately on account, missing-job and quota failures", async () => {
  for (const status of [401, 403, 404, 429]) {
    let calls = 0
    const response = pollingChatResponse(admission(), { signal: new AbortController().signal,
      fetcher: async () => { calls++; return new Response("denied", { status }) },
    })
    const result = events(await response.text())
    assert.equal(calls, 1); assert.equal(result.filter(e => e.type === "error").length, 1)
    assert.equal(result.filter(e => e.type === "done").length, 0)
  }
})
await check("failed and empty jobs never produce false successful completions", async () => {
  for (const turn of [{ status: "failed", content: "Partial answer", error: "Stopped" }, { status: "complete", content: "" }]) {
    const response = pollingChatResponse(admission(), { signal: new AbortController().signal, fetcher: async () => Response.json({ turn }) })
    const result = events(await response.text())
    assert.equal(result.filter(e => e.type === "done").length, 0)
    assert.equal(result.filter(e => e.type === "error").length, 1)
    if (turn.content) assert.equal(result.find(e => e.type === "content").payload.content, turn.content)
  }
})
await check("explicit Stop aborts an outstanding JSON read", async () => {
  const controller = new AbortController()
  let aborted = false
  const response = pollingChatResponse(admission(), { signal: controller.signal, fetcher: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Stopped", "AbortError")) }, { once: true })
  }) })
  const reading = response.text()
  controller.abort()
  await assert.rejects(reading, { name: "AbortError" }); assert.equal(aborted, true)
})
await check("body cancellation aborts polling without another read", async () => {
  let calls = 0, aborted = false
  const response = pollingChatResponse(admission(), { signal: new AbortController().signal, fetcher: async (_url, init) => {
    calls++
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Stopped", "AbortError")) }, { once: true }))
  } })
  const reader = response.body.getReader()
  await reader.read(); await reader.cancel()
  assert.equal(aborted, true); assert.equal(calls, 1)
})
await check("poll deadlines end visibly and unrelated responses pass through", async () => {
  let calls = 0
  const response = pollingChatResponse(admission(), { signal: new AbortController().signal, timeoutMs: 0, fetcher: async () => { calls++; return Response.json({}) } })
  assert.equal(events(await response.text()).filter(e => e.type === "error").length, 1); assert.equal(calls, 0)
  const denied = new Response("limit", { status: 429 })
  assert.equal(pollingChatResponse(denied, { signal: new AbortController().signal, fetcher: fetch }), denied)
})
await check("only the exact Render service alias can retain guest redirects; OAuth stays canonical", async () => {
  const environment = { NODE_ENV: process.env.NODE_ENV, RENDER: process.env.RENDER, RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL }
  try {
    Object.assign(process.env, { NODE_ENV: "production", RENDER: "true", RENDER_EXTERNAL_URL: "https://exact-service.onrender.com" })
    for (const headers of [{ host: "exact-service.onrender.com" }, { host: "localhost:10000", "x-forwarded-host": "exact-service.onrender.com" }]) {
      assert.equal(guestRedirectOrigin(new Request("http://localhost:10000/guest", { headers })), "https://exact-service.onrender.com")
    }
    for (const host of ["other.onrender.com", "exact-service.onrender.com.evil.test", "exact-service.onrender.com@evil.test", "malikaiworld.world"]) {
      assert.equal(guestRedirectOrigin(new Request("http://localhost:10000/guest", { headers: { host, "x-forwarded-host": "exact-service.onrender.com" } })), "https://malikaiworld.world")
    }
    const guest = load("app/guest/route.ts")
    const aliasRequest = new Request("http://localhost:10000/guest", { headers: { host: "exact-service.onrender.com" } })
    aliasRequest.nextUrl = new URL(aliasRequest.url)
    assert.equal(guest.GET(aliasRequest).url, "https://exact-service.onrender.com/dashboard")
    const auth = load("lib/auth/canonical-sign-in.ts")
    assert.equal(new URL(auth.canonicalSignInRedirect(new Request("https://exact-service.onrender.com/sign-in"))).origin, "https://malikaiworld.world")
    for (const url of ["https://evil.test", "http://exact-service.onrender.com", "https://user@exact-service.onrender.com", "https://exact-service.onrender.com/path"]) {
      process.env.RENDER_EXTERNAL_URL = url; assert.equal(getRenderAccessOrigin(), "")
    }
    process.env.RENDER_EXTERNAL_URL = "https://exact-service.onrender.com"
    const page = await load("app/connection/route.ts").GET()
    const html = await page.text()
    assert.ok(html.includes("/dashboard?connection=poll")); assert.ok(!html.includes("<script"))
    assert.match(page.headers.get("content-security-policy"), /default-src 'none'/)
  } finally {
    for (const [key, value] of Object.entries(environment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})
console.log(`${count}/${count} network checks passed; real restricted network, Windows and live providers require deployment-side verification.`)
