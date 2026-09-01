import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

const source = fs.readFileSync("lib/ai/action-os.ts", "utf8")
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const box = { exports: {} }
new Function("require", "module", "exports", js)(
  (name) => { throw new Error(`unexpected require(${name})`) }, box, box.exports,
)

const {
  buildMalikActionInstruction,
  createMalikActionPlan,
  detectMalikMemoryIntent,
  settleMalikActionPlan,
} = box.exports

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`)
  }
}

console.log("\nMalik Action OS")

check("keeps a simple question as an uncluttered chat", () => {
  assert.equal(createMalikActionPlan({ prompt: "Что такое рендер?" }), null)
})

check("turns an end-to-end trip request into a cross-product plan", () => {
  const plan = createMalikActionPlan({ prompt: "Организуй поездку в Алматы: найди варианты, сравни цены, подготовь маршрут и такси, затем сохрани всё в проект" })
  assert.ok(plan)
  const kinds = plan.steps.map((step) => step.kind)
  assert.ok(kinds.includes("research"))
  assert.ok(kinds.includes("taxi"))
  assert.ok(kinds.includes("project"))
  assert.equal(plan.requiresConfirmation, true)
})

check("never wraps a paid slash generation command in a second plan", () => {
  assert.equal(createMalikActionPlan({ prompt: "/фото летящая лягушка и город" }), null)
  assert.equal(createMalikActionPlan({ prompt: "/video cinematic city" }), null)
})

check("settles only work that has evidence and reports zero silent external actions", () => {
  const plan = createMalikActionPlan({ prompt: "Организуй поездку: найди варианты и подготовь такси" })
  const settled = settleMalikActionPlan(plan, { usedWeb: true })
  assert.equal(settled.status, "awaiting-confirmation")
  assert.equal(settled.steps.find((step) => step.kind === "research").status, "done")
  assert.equal(settled.steps.find((step) => step.kind === "taxi").status, "ready")
  assert.equal(settled.receipt.externalActionsPerformed, 0)
})

check("execution contract forbids invented external success", () => {
  const plan = createMalikActionPlan({ prompt: "Организуй поездку и закажи такси" })
  const instruction = buildMalikActionInstruction(plan)
  assert.match(instruction, /Never claim that a purchase, booking/)
  assert.match(instruction, /Ask for confirmation/)
})

check("understands explicit, user-controlled memory commands", () => {
  assert.deepEqual(detectMalikMemoryIntent("Запомни: я предпочитаю короткие ответы"), { kind: "save", text: "я предпочитаю короткие ответы" })
  assert.deepEqual(detectMalikMemoryIntent("/memory"), { kind: "list" })
  assert.deepEqual(detectMalikMemoryIntent("Забудь всё"), { kind: "clear" })
  assert.equal(detectMalikMemoryIntent("Почему люди забывают имена?"), null)
})

console.log("\nwiring")

check("the dashboard sends saved memory and persists action receipts", () => {
  const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
  assert.match(dashboard, /buildMalikMemoryContext\(\)/)
  assert.match(dashboard, /buildMalikActionInstruction\(actionPlan\)/)
  assert.match(dashboard, /actionPlan: reviveMalikActionPlan/)
  assert.match(dashboard, /settleMalikActionPlan/)
})

check("the chat exposes a compact plan and explicit action buttons", () => {
  const chat = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
  assert.match(chat, /MalikActionPlanCard/)
  assert.match(chat, /Action receipt/)
  assert.match(chat, /Внешних действий:/)
  assert.match(chat, /onOpenActionTarget/)
})

console.log(failures ? `\n${failures} failing\n` : "\nall Action OS checks passed\n")
process.exit(failures ? 1 : 0)
