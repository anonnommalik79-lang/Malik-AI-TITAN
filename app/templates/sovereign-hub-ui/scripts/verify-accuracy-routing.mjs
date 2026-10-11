// Real production router + math + finalizer. Provider/connected-service boundaries
// are deterministic fixtures; this is NOT a live model or WorkOS verification.
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
let calls = 0, output = "", tokens = [], observedInstruction = ""
const load = workTestLoader({
  "@/lib/server/malik-model-router": {
    async runStrictMalikModel(input) {
      input.signal?.throwIfAborted(); calls++; observedInstruction = input.systemPrompt
      for (const chunk of output.match(/.{1,8}/gs) || []) input.onToken?.(chunk)
      return { content: output, provider: "fixture-no-paid-provider", model: "fixture", selectedModelId: input.modelId, latencyMs: 1 }
    },
  },
  "@/lib/server/context-fusion": { requestedFusionConnectors: () => [], collectMalikConnectedContext: async () => ({ requested: false, connectorIds: [], executions: [], context: "", sources: [] }) },
  "@/lib/server/science-context": { collectMalikScienceContext: async () => ({ context: "", sources: [], providers: [] }) },
})
const { malikGodAnswer } = load("lib/malik-god-router.ts")
const { DEFAULT_MALIK_MODEL_ID } = load("lib/ai/malik-models.ts")
async function answer(prompt, draft) {
  output = draft; tokens = []; const before = calls
  const result = await malikGodAnswer({ prompt, research: false, workspaceMode: "chat" }, { modelId: DEFAULT_MALIK_MODEL_ID }, undefined, chunk => tokens.push(chunk))
  assert.equal(calls - before, 1, "no extra verification/planning calls for chat")
  assert.equal(result.accuracy.repairCalls, 0)
  return result
}
let count = 0
function pass(name) { count++; console.log(`PASS ${name}`) }
const numeric = await answer("Реши 17 * 23", "Ответ: 400")
assert.equal(numeric.content, "Ответ: 391")
assert.equal(tokens.length, 0, "wrong numeric deltas never reach the emitter")
assert.match(observedInstruction, /ACTUAL EXACT COMPUTATION/)
pass("selected model → actual exact computation → correction before SSE")
const finance = await answer("MAU: 10000; Конверсия: 2%; ARPPU: 20 USD", "Платящие пользователи: 3000\nВыручка: 60000 USD")
assert.equal(finance.content, "Платящие пользователи: 200\nВыручка: 4000 USD")
assert.equal(tokens.length, 0)
assert.equal(finance.factAudit, null, "local derived finance must not require a web source")
pass("financial graph → summary agreement → no irrelevant web-citation warning")
const englishFinance = await answer("MAU: 10000; Conversion: 2%; ARPPU: 20 USD", "Paying users: 3000\nRevenue: $60000")
assert.equal(englishFinance.content, "Paying users: 200\nRevenue: $4000")
assert.equal(englishFinance.factAudit, null)
pass("English derived finance does not falsely require an internet source")
const scientific = await answer("Научно объясни полёт единорога, не генерируй фото", "Единорогу необходимо 12.734 м² крыла.")
assert.doesNotMatch(scientific.content, /12.734/)
assert.equal(scientific.accuracy.issues[0].code, "scientific-precision")
pass("scientific unsupported precision withheld on actual router")
const text = await answer("Объясни различие стека и очереди кратко", "Стек извлекает последний элемент, очередь — первый.")
assert.equal(tokens.join(""), text.content)
pass("ordinary prose retains live deltas")
const surprise = await answer("Объясни результат сложения словами", "Проверяем: 2+2=5")
assert.equal(surprise.content, "Проверяем: 2+2 = 4")
assert.doesNotMatch(tokens.join(""), /5/)
pass("unexpected numeric assertion held even without digits in question")
const stop = new AbortController(); stop.abort()
await assert.rejects(malikGodAnswer({ prompt: "Реши 17 * 23", research: false }, { modelId: DEFAULT_MALIK_MODEL_ID }, undefined, undefined, undefined, undefined, stop.signal), error => error.name === "AbortError")
pass("cancellation propagates without a repair retry")
console.log(`Accuracy production router fixtures PASS: ${count}; no real provider requests`)
