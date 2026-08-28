import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "malik-compute-test-"))
const nativeRequire = createRequire(import.meta.url)
const originalDir = process.env.MALIK_COMPUTE_DATA_DIR
const originalSecret = process.env.WORKOS_COOKIE_PASSWORD
process.env.MALIK_COMPUTE_DATA_DIR = temp
process.env.WORKOS_COOKIE_PASSWORD = "offline-compute-test-secret-never-production"
let actor = null
const jar = new Map()
let calls = 0
let nextAnswer = { content: "Готово", provider: "test-provider", model: "test-model", usedWeb: false, sources: [], attempts: [] }
let nextError = null
let videoResult = { ok: true, taskId: "test-video-1", status: "queued" }
let videoStatus = { ok: true, taskId: "test-video-1", status: "completed", videoUrl: "https://example.invalid/video.mp4" }
let researchResult = { answer: "Verified research", sources: [{ title: "Test", url: "https://example.invalid" }], cached: false }
const stubs = {
  "@/lib/auth/server": { getOptionalWorkOSAuth: async () => ({ user: actor }) },
  "next/headers": { cookies: async () => ({
    get: (key) => jar.has(key) ? { value: jar.get(key) } : undefined,
    set: (key, value, options) => { assert.equal(options.httpOnly, true); jar.set(key, value) },
  }) },
  "@/lib/malik-god-router": {
    malikGodAnswer: async (_body, selection) => { calls++; assert.equal(selection.modelId, "selected-test-model"); if (nextError) throw nextError; return nextAnswer },
    asPlainText: (answer) => answer.content, asJson: (answer) => answer,
  },
  "@/lib/server/malik-model-router": {
    resolveStrictMalikSelection: async () => ({ modelId: "selected-test-model" }),
    malikModelErrorPayload: () => ({ message: "Model unavailable" }),
    MalikModelRouteError: class extends Error {},
  },
  "@/lib/server/plugin-runtime": {
    parsePluginCommandFromBody: (body) => body.plugin === "test-plugin" ? { id: "test-plugin", query: "query" } : null,
    runMalikPlugin: async () => ({ ok: true, pluginId: "test-plugin", content: "Plugin result" }),
  },
  "../../../lib/malik-research/research": {
    runResearch: async (_message, emit) => {
      emit("done", { text: "Research stage complete" })
      return researchResult
    },
  },
  "@/lib/media/config": { maxVideoPromptLength: () => 6000 },
  "@/lib/media/limits": { checkMediaLimit: async () => ({ ok: true, remaining: 10, plan: "plus" }), nextMediaResetAt: () => "", recordMediaUsage: async () => {} },
  "@/lib/media/request": { resolveMediaUser: async () => ({ userId: actor.id, plan: "plus" }) },
  "@/lib/media/video-router": { routeVideoGeneration: async () => videoResult, refreshVideoJobStatus: async () => videoStatus },
}
const cache = new Map()
function load(file) {
  const absolute = path.resolve(root, file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const module = { exports: {} }
  cache.set(absolute, module)
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const require = (specifier) => {
    if (specifier in stubs) return stubs[specifier]
    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      const target = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(absolute), specifier)
      return load(target.endsWith(".ts") ? target : target + ".ts")
    }
    return nativeRequire(specifier)
  }
  new Function("require", "module", "exports", js)(require, module, module.exports)
  return module.exports
}

let checks = 0
async function check(name, run) { await run(); checks++; console.log("PASS " + name) }
const request = (pathname = "/api/stream", body = {}, signal) => new Request("https://malik.example" + pathname, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal,
})
const login = (id) => { actor = { id, email: id + "@example.com", emailVerified: true } }
const encoder = new TextEncoder()
const event = (name, data) => encoder.encode("event: " + name + "\ndata: " + JSON.stringify(data) + "\n\n")

try {
  const { FileComputeStore } = load("lib/malik-compute/file-store.ts")
  const { MalikComputeService } = load("lib/malik-compute/service.ts")
  const { computeService, withCompute, withComputeVideoStatus } = load("lib/malik-compute/runtime.ts")
  const identity = load("lib/malik-compute/identity.ts")
  const api = load("app/api/compute/route.ts")
  const stream = load("app/api/stream/route.ts")
  const chat = load("app/api/ai/chat/route.ts")
  const media = load("app/api/media/video/route.ts")
  const mediaStatus = load("app/api/media/video/status/route.ts")
  const research = load("app/api/malik-research/route.ts")
  const balance = (id) => computeService.getComputeBalance("workos:" + id)

  await check("filesystem balance survives a fresh store/service instance", () => {
    const service = new MalikComputeService(new FileComputeStore(temp))
    const item = service.reserveCompute("persistent", 10, "image", "one")
    service.settleCompute(item, 10)
    const restarted = new MalikComputeService(new FileComputeStore(temp))
    assert.equal(restarted.getComputeBalance("persistent").used, 10)
    assert.equal(restarted.getComputeBalance("other-user").used, 0)
    assert.ok(fs.readdirSync(path.join(temp, item.day)).every((name) => !name.includes("persistent")))
  })
  await check("corrupt storage fails closed instead of resetting allowance", () => {
    const folder = path.join(temp, "corrupt-test")
    const service = new MalikComputeService(new FileComputeStore(folder))
    const item = service.reserveCompute("corrupt", 1, "chat", "one")
    const dayFolder = path.join(folder, item.day)
    const file = path.join(dayFolder, fs.readdirSync(dayFolder)[0])
    fs.writeFileSync(file, "{broken")
    assert.throws(() => service.getComputeBalance("corrupt"), (error) => error.code === "MALIK_COMPUTE_STORAGE_UNAVAILABLE")
  })
  await check("exclusive lock does not lose or overwrite an in-flight debit", () => {
    const folder = path.join(temp, "lock-test")
    const store = new FileComputeStore(folder)
    const service = new MalikComputeService(store)
    const item = service.reserveCompute("locked", 1, "chat", "first")
    const dayFolder = path.join(folder, item.day)
    const file = path.join(dayFolder, fs.readdirSync(dayFolder)[0])
    fs.writeFileSync(file + ".lock", String(process.pid))
    assert.throws(() => service.reserveCompute("locked", 2, "voice", "second"), (error) => error.code === "MALIK_COMPUTE_STORE_BUSY")
    assert.equal(service.getComputeBalance("locked").reserved, 1)
  })
  await check("API rejects anonymous requests and creates distinct signed guest identities", async () => {
    assert.equal((await api.GET()).status, 401)
    jar.set("malik-guest", "1")
    const first = await identity.getComputeIdentity()
    assert.equal((await identity.getComputeIdentity()).userId, first.userId)
    const token = jar.get(identity.COMPUTE_GUEST_COOKIE)
    assert.equal(identity.verifyGuest(token, "wrong-secret"), undefined)
    jar.set(identity.COMPUTE_GUEST_COOKIE, token.slice(0, -1) + (token.endsWith("0") ? "1" : "0"))
    assert.notEqual((await identity.getComputeIdentity()).userId, first.userId)
    const response = await api.GET()
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    const result = await response.json()
    assert.equal(result.mode, "live")
    assert.equal(result.balance.used, 0)
    assert.equal("admin" in result, false)
  })
  await check("Admin is only returned for the verified server-side owner", async () => {
    jar.clear()
    for (const user of [
      { id: "outsider", email: "other@example.com", emailVerified: true, role: "admin" },
      { id: "unverified", email: "amangeldymalik38@gmail.com", emailVerified: false },
    ]) {
      actor = user
      assert.equal("admin" in await (await api.GET()).json(), false)
    }
    actor = { id: "owner", email: "amangeldymalik38@gmail.com", emailVerified: true }
    const data = await (await api.GET()).json()
    assert.ok(data.admin)
    assert.ok(data.admin.requests > 0)
    assert.equal(data.admin.providerHealth, null)
    assert.doesNotMatch(JSON.stringify(data), /test-provider|example.com|API_KEY/)
  })
  await check("real plain-text chat route charges the signed-in account only", async () => {
    login("plain-chat")
    const response = await stream.POST(request("/api/stream", { prompt: "привет", userId: "someone-else", compute: 0 }))
    assert.equal(response.status, 200)
    assert.equal(await response.text(), "Готово")
    assert.equal(balance("plain-chat").used, 1)
    assert.equal(balance("someone-else").used, 0)
    assert.equal((await (await api.GET()).json()).balance.used, 1)
  })
  await check("real SSE route charges research from original user question", async () => {
    login("sse-chat")
    nextAnswer = { ...nextAnswer, usedWeb: true, sources: [{ title: "Test", url: "https://example.invalid" }] }
    const response = await stream.POST(request("/api/stream", { stream: true, originalQuestion: "поищи в гугле", question: "internal instructions" }))
    const text = await response.text()
    assert.match(text, /event: done/)
    assert.equal(balance("sse-chat").used, 5)
    assert.equal(balance("sse-chat").usage.research, 5)
    assert.equal(balance("sse-chat").reserved, 0)
    nextAnswer = { ...nextAnswer, usedWeb: false, sources: [] }
  })
  await check("real chat route's plugin uses the same balance", async () => {
    login("plain-chat")
    await chat.POST(request("/api/ai/chat", { plugin: "test-plugin" }))
    assert.equal(balance("plain-chat").used, 3)
    assert.equal(balance("plain-chat").usage.plugin, 2)
  })
  await check("real research route ignores intermediate done before the final answer", async () => {
    login("research-final")
    const response = await research.POST(request("/api/malik-research", { message: "research test" }))
    assert.match(await response.text(), /Verified research/)
    assert.equal(balance("research-final").used, 5)
    assert.equal(balance("research-final").reserved, 0)
  })
  await check("a request cancelled before execution never calls a provider", async () => {
    login("pre-cancel")
    const controller = new AbortController()
    controller.abort()
    const before = calls
    assert.equal((await stream.POST(request("/api/stream", {}, controller.signal))).status, 499)
    assert.equal(calls, before)
    assert.equal(balance("pre-cancel").reserved, 0)
  })
  await check("unsuccessful web search refunds research; a real model answer costs only chat", async () => {
    login("no-sources")
    const original = researchResult
    researchResult = { answer: "Search unavailable", sources: [], cached: false }
    await (await research.POST(request("/api/malik-research", { message: "test" }))).text()
    assert.equal(balance("no-sources").used, 0)
    researchResult = original
    nextAnswer = { ...nextAnswer, usedWeb: true, sources: [] }
    await (await stream.POST(request("/api/stream", { prompt: "поищи в гугле", stream: true }))).text()
    assert.equal(balance("no-sources").used, 1)
    assert.equal(balance("no-sources").usage.chat, 1)
    nextAnswer = { ...nextAnswer, usedWeb: false }
  })
  await check("provider failure refunds both plain and SSE chat", async () => {
    login("failed-chat")
    nextError = new Error("private-key-must-not-leak")
    assert.equal((await stream.POST(request())).status, 503)
    const response = await stream.POST(request("/api/stream", { stream: true }))
    assert.match(await response.text(), /event: error/)
    assert.equal(balance("failed-chat").used, 0)
    assert.equal(balance("failed-chat").reserved, 0)
    nextError = null
  })
  await check("quota prevents provider execution and returns a Malik error", async () => {
    login("full")
    const item = computeService.reserveCompute("workos:full", 1000, "chat", "fill")
    computeService.settleCompute(item, 1000)
    const before = calls
    const response = await stream.POST(request())
    assert.equal(response.status, 429)
    assert.equal((await response.json()).code, "MALIK_COMPUTE_LIMIT_REACHED")
    assert.equal(calls, before)
  })
  await check("cached answers and failed-output placeholders are free", async () => {
    login("cached")
    const original = nextAnswer
    for (const provider of ["test-provider-cache", "local-smart", "source-fallback", "hard-fallback", "voice-local-fallback"]) {
      nextAnswer = { ...original, provider }
      await stream.POST(request())
    }
    nextAnswer = original
    nextAnswer = { ...original, content: "" }
    await stream.POST(request())
    nextAnswer = original
    assert.equal(balance("cached").used, 0)
    assert.equal(balance("cached").reserved, 0)
  })
  await check("nested adapters execute once and failed JSON is not charged", async () => {
    login("nested")
    const inner = withCompute(async () => Response.json({ ok: true, content: "done" }), "chat")
    const outer = withCompute(inner, "chat")
    await outer(request())
    assert.equal(balance("nested").used, 1)
    await withCompute(async () => Response.json({ ok: false, error: "failed" }), "image")(request())
    assert.equal(balance("nested").used, 1)
  })
  await check("binary voice output is metered without parsing audio as JSON", async () => {
    login("audio")
    const response = await withCompute(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } }), "voice")(request())
    assert.equal((await response.arrayBuffer()).byteLength, 3)
    assert.equal(balance("audio").used, 2)
  })
  await check("SSE cancellation and truncated/empty responses refund reservations", async () => {
    login("cancel")
    const hanging = withCompute(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(event("status", { text: "waiting" })) },
    }), { headers: { "Content-Type": "text/event-stream" } }), "chat")
    const response = await hanging(request())
    const reader = response.body.getReader()
    await reader.read()
    await reader.cancel()
    assert.equal(balance("cancel").reserved, 0)
    for (const events of [[event("content", { content: "partial" })], [event("done", { type: "done" })]]) {
      const incomplete = withCompute(async () => new Response(new ReadableStream({
        start(controller) { for (const bytes of events) controller.enqueue(bytes); controller.close() },
      }), { headers: { "Content-Type": "text/event-stream" } }), "chat")
      await (await incomplete(request())).text()
    }
    assert.equal(balance("cancel").used, 0)
    assert.equal(balance("cancel").reserved, 0)
  })
  await check("a completed terminal answer cannot be refunded by cancelling afterward", async () => {
    login("complete-then-cancel")
    const handler = withCompute(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(event("content", { content: "finished" }))
        controller.enqueue(event("done", { type: "done" }))
      },
    }), { headers: { "Content-Type": "text/event-stream" } }), "chat")
    const reader = (await handler(request())).body.getReader()
    await reader.read()
    await reader.read()
    await reader.cancel()
    assert.equal(balance("complete-then-cancel").used, 1)
  })
  await check("real video route reserves; real polling settles once, for its owner", async () => {
    login("video-owner")
    assert.equal((await media.POST(request("/api/media/video", { prompt: "test" }))).status, 200)
    assert.equal(balance("video-owner").used, 0)
    assert.equal(balance("video-owner").reserved, 25)
    const poll = () => mediaStatus.GET(new Request("https://malik.example/api/media/video/status?taskId=test-video-1"))
    login("video-outsider")
    await poll()
    assert.equal(balance("video-owner").reserved, 25)
    login("video-owner")
    await poll()
    await poll()
    assert.equal(balance("video-owner").used, 25)
    assert.equal(balance("video-owner").reserved, 0)
    assert.equal(balance("video-outsider").used, 0)
  })
  await check("failed asynchronous video releases its original reservation", async () => {
    login("video-fail")
    videoResult = { ok: true, taskId: "failed-video", status: "queued" }
    videoStatus = { ok: false, taskId: "failed-video", status: "failed", error: "generation failed" }
    await media.POST(request("/api/media/video", { prompt: "test" }))
    await mediaStatus.GET(new Request("https://malik.example/api/media/video/status?taskId=failed-video"))
    assert.equal(balance("video-fail").reserved, 0)
    assert.equal(balance("video-fail").used, 0)
  })
  await check("dynamic generation cost cannot be lowered using a spoofed body kind", async () => {
    const { generationComputeOperation } = load("lib/malik-compute/policies.ts")
    assert.equal(await generationComputeOperation(request("/api/generate/photo", { kind: "text" })), "image")
    assert.equal(await generationComputeOperation(request("/api/generate/video", { kind: "text" })), "video")
  })
  await check("all advertised endpoints export metered handlers", () => {
    for (const endpoint of ["stream", "ai/chat", "ai/code", "ai/image", "malik-research", "generate", "generate/[kind]", "generate/video", "media/image", "media/video", "voice/turn", "voice/tts", "transcribe", "translator"]) {
      assert.match(fs.readFileSync(path.join(root, "app/api", endpoint, "route.ts"), "utf8"), /export const POST = withCompute\(/, endpoint)
    }
    assert.equal(typeof withComputeVideoStatus, "function")
  })
  console.log("\n" + checks + " live-integration checks passed; stub providers, no paid API calls.")
} finally {
  if (originalDir === undefined) delete process.env.MALIK_COMPUTE_DATA_DIR
  else process.env.MALIK_COMPUTE_DATA_DIR = originalDir
  if (originalSecret === undefined) delete process.env.WORKOS_COOKIE_PASSWORD
  else process.env.WORKOS_COOKIE_PASSWORD = originalSecret
  // Only the exact mkdtemp-created test directory, never the application ledger.
  if (path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith("malik-compute-test-")) {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}
