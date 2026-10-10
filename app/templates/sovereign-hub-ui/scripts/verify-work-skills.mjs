import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
let connected = false, lanes = [], owner = { authenticated: true, userId: "qa-skills-owner", plan: "pro" }
const load = workTestLoader({ "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => owner }, "@/lib/server/plugin-pipes": { getPipesProviderState: async () => ({ connected }) }, "@/lib/server/malik-max-engine": { maxLaneStatus: async () => lanes } })
const store = load("lib/os/store.ts"); store.configureOsBackend(store.memoryBackend())
const catalog = load("app/api/work/skills/route.ts").GET, run = load("app/api/work/skills/run/route.ts").POST
const request = data => new Request("http://qa.invalid/api/work/skills/run", { method: "POST", body: JSON.stringify(data) })
let passed = 0; async function check(name, fn) { await fn(); passed++; console.log(`ok ${name}`) }
await check("catalog has engines, existing OS tools and GitHub with truthful missing connections", async () => {
  const result = await (await catalog(new Request("http://qa.invalid/api/work/skills"))).json()
  assert.equal(result.skills.length, 19)
  assert.equal(new Set(result.skills.map(s => s.id)).size, result.skills.length)
  assert.equal(result.skills.find(s => s.id === "github.work").status, "needs-connection")
  assert.equal(result.skills.find(s => s.id === "math.compute").status, "ready")
  assert.equal(result.skills.find(s => s.id === "document.export").status, "ready")
  assert.equal(result.skills.find(s => s.id === "github.read").status, "needs-connection")
  assert.equal(result.skills.find(s => s.id === "document.write").status, "needs-connection")
  connected = true; lanes = [{ restingMs: 0 }]
  const configured = await (await catalog(new Request("http://qa.invalid/api/work/skills"))).json()
  assert.equal(configured.skills.find(s => s.id === "github.read").status, "ready")
  assert.equal(configured.skills.find(s => s.id === "document.write").status, "ready")
  assert.equal(configured.skills.find(s => s.id === "github.work").status, "ready")
  assert.match(configured.skills.find(s => s.id === "github.work").detail, /Build\/terminal не запускаются/)
})
await check("actual math engine computes units and writes receipt without input data", async () => {
  const response = await run(request({ skill: "math.compute", task: { op: "convert", value: "72 km/h", to: "m/s" } })), body = await response.json()
  assert.equal(response.status, 200); assert.match(body.result.answer, /20/)
  const receipts = await store.readOwnerJson(owner.userId, "work-activity")
  assert.equal(receipts.at(-1).action, "math.compute"); assert.doesNotMatch(JSON.stringify(receipts), /72 km|m\/s|expression/)
})
await check("only engines run; identity/extra fields and unsafe expressions are rejected", async () => {
  assert.equal((await run(request({ skill: "github.write", payload: {} }))).status, 400)
  assert.equal((await run(request({ skill: "math.compute", task: { op: "evaluate", expression: "2+2" }, userId: "stranger" }))).status, 400)
  assert.equal((await run(request({ skill: "math.compute", task: { op: "evaluate", expression: "import(1)" } }))).status, 422)
})
await check("document engine returns real downloadable file", async () => {
  const response = await run(request({ skill: "document.export", title: "Отчёт", format: "docx", markdown: "# Отчёт\n\nКириллица" }))
  assert.equal(response.status, 200); assert.match(response.headers.get("content-disposition"), /filename\*/)
  const bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(bytes[0], 80)
})
await check("guest status and limits are explicit", async () => {
  owner = { authenticated: false, userId: "qa-skills-guest", plan: "free" }
  const result = await (await catalog(new Request("http://qa.invalid/api/work/skills"))).json()
  assert.equal(result.skills.find(s => s.id === "document.write").status, "plan-required")
  assert.equal(result.skills.find(s => s.id === "github.work").status, "plan-required")
  for (let i = 0; i < 6; i++) assert.equal((await run(request({ skill: "math.compute", task: { op: "evaluate", expression: "2+2" } }))).status, 200)
  assert.equal((await run(request({ skill: "math.compute", task: { op: "evaluate", expression: "2+2" } }))).status, 429)
})
console.log(`${passed}/${passed} passed (actual catalog/engines/routes/store; auth and provider-state boundaries stubbed)`)
