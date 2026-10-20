// Execute the actual MAX coordinator function. Search/model/account boundaries
// are fixtures, not a claim of authenticated live-provider correctness.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"
import { workTestLoader } from "./work-test-loader.mjs"
const load = workTestLoader()
const domain = load("lib/ai/domain-intelligence.ts")
const sourceText = fs.readFileSync("lib/malik-god-router.ts", "utf8")
const ast = ts.createSourceFile("router.ts", sourceText, ts.ScriptTarget.Latest, true)
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "malikGodAnswer")
assert.ok(fn)
const js = ts.transpileModule(fn.getText(ast).replace(/^export\s+/u, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const empty = () => ""
let calls, searches, classifierNeedsWeb, classifierFails, modelInputs
const deps = {
  ...load("lib/server/chat-website-design.ts"),
  ...domain, ...load("lib/ai/conversation-intent.ts"), ...load("lib/ai/conversation-focus.ts"),
  ...load("lib/ai/freshness-intent.ts"), ...load("lib/ai/web-search-policy.ts"), ...load("lib/server/domain-planner.ts"),
  extractPrompt: b => b.prompt, conversationRepairInstruction: empty,
  detectMalikSuperpowers: () => [], superpowerOutputBudget: () => 1000,
  requestedFusionConnectors: () => [], instantReply: () => null,
  analyzeMalikBrainV1: () => ({ task: "fixture", depth: "balanced", outputTokenTarget: 1000, temperature: 0.2 }), buildMalikBrainSystemInstruction: empty,
  gatherSources: async query => { searches.push(query); return [{ title: "Fixture evidence", url: "https://example.org/fixture", domain: "example.org", snippet: "Fixture evidence" }] },
  collectMalikConnectedContext: () => { throw Error("unexpected private-account read") },
  collectMalikScienceContext: () => { throw Error("unexpected scholarly fanout") },
  fetchEiaSpotEvidence: async () => ({ context: "" }), freshnessMode: () => "fast",
  needsCurrentEvidence: () => false, truthNeedsLiveEvidence: () => false, currentEvidenceAvailable: () => true,
  sourceContext: s => JSON.stringify(s), computeMathForMessage: () => null, planWorkMath: async () => null,
  mathEngineInstruction: empty, plannedMathInstruction: empty, accuracyInstruction: empty,
  workModeInstruction: empty, resolveWorkspaceMode: () => "chat", userContextBlocks: empty,
  computedEvidenceInstruction: empty, systemPrompt: empty, petroleumKnowledgeInstruction: empty,
  answerBudget: b => b.maxTokens || 1000, accuracyTokenGate: (_p, cb) => cb,
  runStrictMalikModel: async input => {
    modelInputs.push(input)
    if (input.systemPrompt === domain.DOMAIN_SEMANTIC_INSTRUCTION) { calls.planning++; if (classifierFails) throw Error("fixture provider failure"); return { content: JSON.stringify({ domains: ["agronomy"], goal: "explain", needsWeb: classifierNeedsWeb }) } }
    calls.final++; input.onToken?.("Fixture final answer")
    return { content: "Fixture final answer", provider: "fixture", model: "fixture", selectedModelId: "malik-max", latencyMs: 1 }
  },
  cleanText: s => s, answerCardsToText: s => s, finalizeAccuracy: content => ({ content, report: { checked: 0, issues: [], verificationMs: 0 } }),
  finalizeTruthAnswer: s => s, finalizeFreshAnswer: s => s, auditGroundedAnswer: () => null,
}
const run = new Function(...Object.keys(deps), js + "\nreturn malikGodAnswer;")(...Object.values(deps))
const unknown = "Почему на участке ухудшается состояние урожая при одинаковом поливе и какие наблюдения помогут отличить вероятные причины, не подменяя измерения догадками?"
async function execute(prompt, extra = {}) {
  calls = { planning: 0, final: 0 }; searches = []; modelInputs = []; classifierNeedsWeb = extra.needsWeb ?? true; classifierFails = extra.fails ?? false
  const tokens = []
  const answer = await run({ prompt, maxTokens: extra.maxTokens ?? 1800, ...extra.body }, { modelId: "malik-max" }, undefined, t => tokens.push(t))
  return { answer, tokens }
}
test("semantic interpretation activates real search in the MAX coordinator and produces one final stream", async () => {
  const { answer, tokens } = await execute(unknown)
  assert.equal(calls.planning, 1); assert.equal(searches.length, 1); assert.equal(searches[0], unknown)
  assert.equal(calls.final, 1); assert.deepEqual(tokens, ["Fixture final answer"]); assert.equal(answer.usedWeb, true)
  assert.match(modelInputs.at(-1).systemPrompt, /agronomy/); assert.match(modelInputs.at(-1).prompt, /Fixture evidence/)
  assert.equal(modelInputs.at(-1).maxTokens, 1480)
})
test("simple calculation/science does not acquire extra semantic or browsing latency", async () => {
  await execute("Объясни CUDA")
  assert.equal(calls.planning, 0); assert.equal(searches.length, 0); assert.equal(calls.final, 1)
})
test("new text topic cannot inherit earlier web/image preferences", async () => {
  await execute("Объясни CUDA", { body: { history: [{ role: "user", content: "Найди новости с фото" }, { role: "assistant", content: "Fixture" }] } })
  assert.equal(searches.length, 0); assert.equal(calls.planning, 0)
})
test("explicit no-web overrides even a model request for external evidence", async () => {
  await execute(unknown + " Без интернета.")
  assert.equal(calls.planning, 1); assert.equal(searches.length, 0); assert.equal(calls.final, 1)
})
test("classifier failure remains one bounded attempt, not a failed chat", async () => {
  const { answer } = await execute(unknown, { fails: true })
  assert.equal(calls.planning, 1); assert.equal(calls.final, 1); assert.equal(answer.content, "Fixture final answer")
})
test("small account allowance skips auxiliary inference", async () => {
  await execute(unknown, { maxTokens: 600 })
  assert.equal(calls.planning, 0); assert.equal(calls.final, 1); assert.equal(modelInputs[0].maxTokens, 600)
})
