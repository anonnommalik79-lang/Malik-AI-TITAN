import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
const load = workTestLoader(), { planWorkMath, plannedMathInstruction, plannedMathReceiptText } = load("lib/work/math/model-plan.ts")
const input = { prompt: "Реши физическую задачу в несколько этапов. Масса 5 кг, ускорение 9.81 м/с². Найди силу и проверь размерность.", mode: "work", explicitMath: false, attachments: 0 }
const valid = { givens: ["Масса 5 кг", "Ускорение 9.81 м/с²", "Модель: F = ma"], unknown: "Сила", tasks: [{ op: "evaluate", expression: "5 kg * 9.81 m/s^2", expectUnit: "N" }] }
let passed = 0; async function check(name, fn) { await fn(); passed++; console.log(`ok ${name}`) }
await check("validated model formula is computed by actual engine with dimensions", async () => {
  const plan = await planWorkMath(input, async () => JSON.stringify(valid))
  assert.equal(plan.receipts[0].outcome.answer, "49.05 N")
  assert.ok(plan.receipts[0].outcome.checks.some(check => check.name === "Размерность" && check.ok))
  assert.match(plannedMathInstruction(plan), /Формулы составлены моделью, посчитаны движком/)
  assert.match(plannedMathReceiptText(plan.receipts[0].task, plan.receipts[0].outcome), /49.05 N/)
})
await check("chat, simple prompts, explicit math and attachments do not call extra model", async () => {
  let called = 0
  for (const options of [{ ...input, mode: "chat" }, { ...input, prompt: "2+2" }, { ...input, explicitMath: true }, { ...input, attachments: 1 }]) assert.equal(await planWorkMath(options, async () => { called++; return JSON.stringify(valid) }), null)
  assert.equal(called, 0)
})
await check("bad JSON, extra fields and more than six tasks fall back without engine claims", async () => {
  for (const raw of ["```json\n{}\n```", JSON.stringify({ ...valid, result: "invented" }), JSON.stringify({ ...valid, tasks: Array(7).fill(valid.tasks[0]) }), "not JSON"]) {
    const plan = await planWorkMath(input, async () => raw); assert.equal(plan, null); assert.equal(plannedMathInstruction(plan), "")
  }
})
await check("unsafe expression or dimensional contradiction discard all receipts", async () => {
  for (const task of [{ op: "evaluate", expression: "import(1)" }, { op: "convert", value: "5 kg", to: "m" }]) assert.equal(await planWorkMath(input, async () => JSON.stringify({ ...valid, tasks: [valid.tasks[0], task] })), null)
})
await check("planning deadline aborts a stalled model", async () => {
  let aborted = false; const started = Date.now()
  const result = await planWorkMath(input, signal => new Promise(() => signal.addEventListener("abort", () => { aborted = true }, { once: true })), 30)
  assert.equal(result, null); assert.equal(aborted, true); assert.ok(Date.now() - started < 500)
})
await check("request cancellation does not yield an engine block", async () => {
  const controller = new AbortController(); controller.abort()
  assert.equal(await planWorkMath({ ...input, signal: controller.signal }, async () => JSON.stringify(valid)), null)
})
console.log(`${passed}/${passed} passed (actual math engine and validation; planning model stubbed)`)
