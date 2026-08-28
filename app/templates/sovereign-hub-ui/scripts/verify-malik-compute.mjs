import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"

// Offline: load only Compute and its owner policy. No env, network or disk writes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const nativeRequire = createRequire(import.meta.url)
function loader(stubs = {}) {
  const cache = new Map()
  const load = (file) => {
    const absolute = path.resolve(root, file)
    if (cache.has(absolute)) return cache.get(absolute).exports
    const module = { exports: {} }
    cache.set(absolute, module)
    const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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
  return load
}

let checks = 0
async function check(name, run) { await run(); checks++; console.log("PASS " + name) }
const load = loader()
const { MalikComputeService, estimateCompute } = load("lib/malik-compute/service.ts")
const { MemoryComputeStore, executeWithCompute, classifyComputeFailure } = load("lib/malik-compute/adapter.ts")
const config = load("lib/malik-compute/config.ts")
const make = (limit = 1000, now = () => new Date("2026-08-28T12:00:00Z")) => new MalikComputeService(new MemoryComputeStore(limit), now)
const code = (expected) => (error) => error.code === expected

await check("central weights and agent limits", () => {
  assert.deepEqual(Object.keys(config.COMPUTE_WEIGHTS), ["chat", "agent", "research", "image", "voice", "video", "plugin"])
  for (const [operation, weight] of Object.entries(config.COMPUTE_WEIGHTS)) assert.equal(estimateCompute(operation, 3), weight * 3)
  assert.equal(config.MAX_AGENT_STEPS, 40)
  assert.equal(config.MAX_AGENT_RETRIES, 4)
  assert.equal(config.MAX_AGENT_COMPUTE, 150)
})
await check("one balance across all capabilities", () => {
  const service = make()
  let used = 0
  for (const operation of Object.keys(config.COMPUTE_WEIGHTS)) {
    const cost = estimateCompute(operation)
    const reservation = service.reserveCompute("user-a", cost, operation, operation)
    service.settleCompute(reservation, cost)
    used += cost
  }
  const balance = service.getComputeBalance("user-a")
  assert.equal(balance.used, used)
  assert.equal(balance.remaining, 1000 - used)
  assert.equal(Object.values(balance.usage).reduce((a, b) => a + b, 0), used)
  assert.equal(service.getComputeBalance("user-b").remaining, 1000)
})
await check("reserve 100 -> actual 37 -> refund 63", () => {
  const service = make()
  const reservation = service.reserveCompute("a", 100, "chat", "one")
  assert.equal(service.getComputeBalance("a").remaining, 900)
  assert.equal(service.getComputeBalance("a").reserved, 100)
  const settled = service.settleCompute(reservation, 37)
  assert.equal(settled.refund, 63)
  assert.equal(service.getComputeBalance("a").used, 37)
  assert.equal(service.getComputeBalance("a").remaining, 963)
  assert.equal(service.getComputeBalance("a").reserved, 0)
  assert.deepEqual(service.settleCompute(reservation, 37), settled)
})
await check("quota includes outstanding reservations", () => {
  const service = make(10)
  service.reserveCompute("a", 10, "chat", "one")
  assert.equal(service.hasEnoughCompute("a", 1), false)
  assert.throws(() => service.reserveCompute("a", 1, "voice", "two"), code("MALIK_COMPUTE_LIMIT_REACHED"))
})
await check("duplicate reserve does not consume twice; conflicting IDs rejected", () => {
  const service = make()
  service.reserveCompute("a", 10, "chat", "same")
  assert.equal(service.reserveCompute("a", 10, "chat", "same").replayed, true)
  assert.equal(service.getComputeBalance("a").reserved, 10)
  assert.throws(() => service.reserveCompute("a", 11, "chat", "same"), code("MALIK_COMPUTE_REQUEST_CONFLICT"))
  assert.equal(service.getAdminStats().requests, 1)
})
await check("invalid quantities, overflow and unsafe operation rejected", () => {
  for (const amount of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => make().reserveCompute("a", amount, "chat", "one"))
  }
  for (const operation of ["unknown", "__proto__", "constructor"]) assert.throws(() => estimateCompute(operation))
  assert.throws(() => estimateCompute("video", Number.MAX_SAFE_INTEGER))
  assert.throws(() => make().reserveCompute("", 1, "chat", "one"))
  assert.throws(() => make().reserveCompute("a", 1, "chat", ""))
})
await check("request IDs cannot change prototypes", () => {
  const service = make()
  for (const id of ["__proto__", "constructor", "toString"]) {
    const reservation = service.reserveCompute("a", 10, "plugin", id)
    service.settleCompute(reservation, 2)
  }
  assert.equal(service.getComputeBalance("a").used, 6)
})
await check("agent compute budget is enforced", () => {
  assert.throws(() => make().reserveCompute("a", 151, "agent", "one"), code("MALIK_COMPUTE_AGENT_BUDGET"))
  assert.equal(make().reserveCompute("a", 150, "agent", "one").amount, 150)
})
await check("reset is UTC; late settlement stays on original day", () => {
  let time = new Date("2026-08-28T23:59:59Z")
  const service = make(1000, () => time)
  const reservation = service.reserveCompute("a", 100, "chat", "one")
  assert.equal(service.getComputeBalance("a").resetsAt, "2026-08-29T00:00:00.000Z")
  time = new Date("2026-08-29T00:00:01Z")
  service.settleCompute(reservation, 37)
  assert.equal(service.getComputeBalance("a").used, 0)
  assert.equal(service.getComputeBalance("a").remaining, 1000)
})
for (const [failure, expected] of [
  [{ status: 429 }, "PROVIDER_RATE_LIMITED"],
  [{ status: 503 }, "PROVIDER_UNAVAILABLE"],
  [{ status: 504 }, "PROVIDER_TIMEOUT"],
  [{ name: "TimeoutError" }, "PROVIDER_TIMEOUT"],
  [new Error("sensitive-provider-secret"), "EXECUTION_FAILED"],
]) await check("failure refunds without exhausting balance: " + expected, async () => {
  const service = make()
  const result = await executeWithCompute({ service, userId: "a", requestId: "one", operation: "chat", estimate: 100, execute: async () => { throw failure } })
  assert.equal(result.code, expected)
  assert.equal(service.getComputeBalance("a").remaining, 1000)
  assert.equal(service.getComputeBalance("a").used, 0)
  assert.equal(service.getAdminStats().failedRequests, 1)
  assert.doesNotMatch(JSON.stringify(result), /sensitive-provider-secret/)
  assert.equal(classifyComputeFailure(failure), expected)
})
await check("fallback stays in one reservation; success settles measured cost", async () => {
  const service = make()
  const result = await executeWithCompute({ service, userId: "a", requestId: "one", operation: "research", estimate: 100, execute: async (reportFallback) => {
    reportFallback()
    return { value: "done", actualCompute: 37 }
  } })
  assert.deepEqual(result, { ok: true, value: "done", charged: 37, refunded: 63 })
  assert.equal(service.getAdminStats().fallbackCount, 1)
  assert.equal(service.getAdminStats().requests, 1)
})
await check("insufficient quota never executes provider", async () => {
  let calls = 0
  const result = await executeWithCompute({ service: make(0), userId: "a", requestId: "one", operation: "chat", execute: async () => { calls++; return { value: "no", actualCompute: 1 } } })
  assert.equal(result.code, "MALIK_COMPUTE_LIMIT_REACHED")
  assert.equal(result.message, "You’ve reached today’s Malik usage limit.")
  assert.equal(calls, 0)
})
await check("concurrent duplicate does not execute or refund original request", async () => {
  const service = make()
  let release
  let calls = 0
  const gate = new Promise((resolve) => { release = resolve })
  const input = { service, userId: "a", requestId: "same", operation: "chat", estimate: 100, execute: async () => { calls++; await gate; return { value: "ok", actualCompute: 37 } } }
  const first = executeWithCompute(input)
  const duplicate = await executeWithCompute(input)
  assert.equal(duplicate.code, "MALIK_COMPUTE_REQUEST_DUPLICATE")
  assert.equal(service.getComputeBalance("a").reserved, 100)
  release()
  await first
  assert.equal(calls, 1)
  assert.equal(service.getComputeBalance("a").used, 37)
  const completed = await executeWithCompute(input)
  assert.equal(completed.code, "MALIK_COMPUTE_REQUEST_DUPLICATE")
  assert.equal(calls, 1)
})
await check("cost over ceiling is rejected and reservation released", async () => {
  const service = make()
  const result = await executeWithCompute({ service, userId: "a", requestId: "one", operation: "chat", execute: async () => ({ value: "ok", actualCompute: 2 }) })
  assert.equal(result.code, "MALIK_COMPUTE_ESTIMATE_EXCEEDED")
  assert.equal(service.getComputeBalance("a").remaining, 1000)
})
await check("store snapshots cannot mutate ledger; failed update is atomic", () => {
  const service = make()
  const reservation = service.reserveCompute("a", 100, "chat", "one")
  const balance = service.getComputeBalance("a")
  balance.usage.chat = 9999
  assert.equal(service.getComputeBalance("a").usage.chat, 0)
  assert.throws(() => service.settleCompute(reservation, 101))
  assert.equal(service.getComputeBalance("a").reserved, 100)
})
await check("provider health is not invented", () => {
  const stats = make().getAdminStats()
  assert.equal(stats.requests, 0)
  assert.equal(stats.providerHealth, null)
  assert.equal(stats.routingDistribution, null)
})
await check("expired reservations release balance and cannot charge late", () => {
  let time = new Date("2026-08-28T12:00:00Z")
  const service = make(1000, () => time)
  const reservation = service.reserveCompute("a", 100, "chat", "stale")
  time = new Date("2026-08-28T13:00:00Z")
  assert.equal(service.getComputeBalance("a").reserved, 0)
  assert.equal(service.settleCompute(reservation, 10).status, "failed")
  assert.equal(service.getComputeBalance("a").used, 0)
  assert.equal(service.getAdminStats().failedRequests, 1)
})
await check("real /compute route and shared sidebar navigation", () => {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
  assert.match(read("app/compute/page.tsx"), /initialView="compute"/)
  assert.match(read("components/sovereign/sidebar.tsx"), /label: "Compute", icon: Cpu, view: "compute"/)
  assert.match(read("components/sovereign/dashboard.tsx"), /window.location.assign\("\/compute"\)/)
  assert.match(read("components/sovereign/compute/compute.module.css"), /@media \(max-width: 700px\)/)
})
console.log("\n" + checks + " Compute checks passed; no provider calls.")
