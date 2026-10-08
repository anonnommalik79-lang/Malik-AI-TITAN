// Runs the existing memory module with a browser-storage fixture. No auth
// bypass, cloud writes, model calls, or claim of production account validation.
import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

const data = new Map()
const legacy = [{ id: "old-private", text: "Legacy private preference", createdAt: "2026-10-01", updatedAt: "2026-10-01" }]
data.set("malik.memory.items.v1", JSON.stringify(legacy))
const originalWindow = globalThis.window, originalCustomEvent = globalThis.CustomEvent
class FixtureCustomEvent extends Event { constructor(type, options) { super(type); this.detail = options?.detail } }
const browser = new EventTarget()
browser.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) }
globalThis.window = browser
globalThis.CustomEvent = FixtureCustomEvent
try {
  const js = ts.transpileModule(fs.readFileSync("lib/malik-context.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  new Function("require", "module", "exports", js)(name => {
    if (name === "react") return {}
    if (name.endsWith("plugin-registry")) return { getMalikPlugin: () => null }
    throw new Error(`Unexpected dependency ${name}`)
  }, mod, mod.exports)
  const memory = mod.exports
  assert.deepEqual(memory.readMalikMemories(), [], "legacy ownerless memory must never be read before the account is known")
  assert.equal(memory.addMalikMemory("Not yet scoped"), null, "do not acknowledge a save without account scope")
  memory.setMalikMemoryAccountScope("account-a")
  const alice = memory.addMalikMemory("Alice's private project")
  assert.ok(alice)
  assert.equal(memory.readMalikMemories()[0].text, "Alice's private project")
  memory.setMalikMemoryAccountScope("account-b")
  assert.deepEqual(memory.readMalikMemories(), [], "second account cannot see first account's memories")
  assert.equal(memory.updateMalikMemory(alice.id, "Changed by Bob"), false)
  memory.removeMalikMemory(alice.id)
  const bob = memory.addMalikMemory("Bob's private project")
  assert.ok(bob)
  memory.setMalikMemoryAccountScope("guest")
  assert.deepEqual(memory.readMalikMemories(), [], "sign-out does not reveal private account memory")
  memory.setMalikMemoryAccountScope("account-a")
  assert.equal(memory.readMalikMemories()[0].text, "Alice's private project")
  assert.match(memory.buildMalikMemoryContext(), /Alice's private project/)
  assert.doesNotMatch(memory.buildMalikMemoryContext(), /Bob|Legacy/)
  memory.setMalikMemoryAccountScope("account-b")
  memory.clearMalikMemories()
  assert.deepEqual(memory.readMalikMemories(), [])
  memory.setMalikMemoryAccountScope("account-a")
  assert.equal(memory.readMalikMemories()[0].id, alice.id, "clearing one account never clears another")
  const normalSet = browser.localStorage.setItem
  browser.localStorage.setItem = () => { throw new DOMException("No storage capacity", "QuotaExceededError") }
  assert.equal(memory.addMalikMemory("Must not pretend to save"), null)
  assert.equal(memory.updateMalikMemory(alice.id, "Must not pretend to update"), false)
  browser.localStorage.setItem = normalSet
  assert.equal(memory.readMalikMemories()[0].text, "Alice's private project", "storage failure never destroys an existing memory")
  assert.deepEqual(JSON.parse(data.get("malik.memory.items.v1")), legacy, "legacy data is retained unchanged, not claimed by a new account")
  memory.setMalikMemoryAccountScope("")
  assert.deepEqual(memory.readMalikMemories(), [])
  console.log("PASS memory: unknown owner, two accounts, sign-out, update/delete/clear isolation, context, legacy preservation")
} finally {
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow
  if (originalCustomEvent === undefined) delete globalThis.CustomEvent; else globalThis.CustomEvent = originalCustomEvent
}
