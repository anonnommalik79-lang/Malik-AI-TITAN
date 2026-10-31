import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import ts from "typescript"
import { dialogues } from "./conversation-continuity-dialogues.mjs"

const ref = process.argv.find(arg => arg.startsWith("--ref="))?.slice(6)
const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9)
const record = process.argv.includes("--record-baseline")
const root = process.cwd(), prefix = "app/templates/sovereign-hub-ui/"
const require = createRequire(import.meta.url)
const deps = process.env.MALIK_QA_DEPS ? createRequire(path.join(process.env.MALIK_QA_DEPS, "fixture.cjs")) : require
const cache = new Map()
const captured = []
function load(file) {
  const absolute = path.resolve(root, file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const source = ref ? execFileSync("git", ["show", `${ref}:${prefix}${path.relative(root, absolute).replaceAll("\\", "/")}`], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }) : fs.readFileSync(absolute, "utf8")
  const module = { exports: {} }; cache.set(absolute, module)
  const resolve = (name) => {
    if (name === "./malik-max-engine") return { runMalikMax: async input => { captured.push(input); throw new Error("CONVERSATION_CAPTURE_STOP") } }
    if (name === "@/lib/server/domain-planner") return { refineDomainPlan: async plan => plan }
    if (name === "@/lib/server/petroleum-eia") return { fetchEiaSpotEvidence: async () => ({ context: "", sources: [] }) }
    if (name === "@/lib/work/math/skill") return { computeMathForMessage: () => null, mathEngineInstruction: () => "" }
    if (name === "@/lib/work/math/model-plan") return { planWorkMath: async () => null, plannedMathInstruction: () => "" }
    if (name === "server-only") return {}
    if (name === "@workos-inc/authkit-nextjs") return { withAuth: () => { throw new Error("No authentication call in context packet tests") } }
    if (name === "@/lib/server/context-fusion") return { requestedFusionConnectors: () => [], collectMalikConnectedContext: async () => ({ context: "", sources: [], requested: false, connectorIds: [], executions: [] }) }
    if (name === "@/lib/server/science-context") return { collectMalikScienceContext: async () => ({ context: "", sources: [], providers: [] }) }
    if (name === "@/lib/server/request-entitlement") return { resolveRequestEntitlement: () => { throw new Error("No identity operation is allowed in context tests") } }
    if (name === "@/lib/server/hidden-gemini-multimodal") return { hasHiddenGeminiMedia: () => false, runHiddenGeminiMultimodal: () => { throw new Error("No provider call in context tests") } }
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.resolve(root, name.slice(2)) : path.resolve(path.dirname(absolute), name)
      for (const suffix of [".ts", ".tsx", "/index.ts"]) if (fs.existsSync(base + suffix)) return load(base + suffix)
    }
    try { return require(name) } catch (error) { if (error.code === "MODULE_NOT_FOUND") return deps(name); throw error }
  }
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: absolute })(resolve, module, module.exports)
  return module.exports
}
const { resolveConversationIntent } = load("lib/ai/conversation-intent.ts")
const report = { ref: ref || "working-tree", scope: "real intent, context, budget, completion and provider-packet logic; no generated-answer stubs or live model claims", cases: [] }
for (const item of dialogues) {
  try {
    if (item.kind === "intent" || item.kind === "validation") {
      const intent = resolveConversationIntent({ prompt: item.prompt, messages: item.history })
      if (item.kind === "validation") {
        const content = item.history.at(-1).content
        assert.equal(load("lib/ai/conversation-validation.ts").validateConversationAnswer(intent, content, content).issue, item.expected)
      } else for (const [key, expected] of Object.entries(item.expected)) {
        const actual = key === "source" ? intent.source?.content : key in intent.requirements ? intent.requirements[key] : intent[key]
        assert.deepEqual(actual, expected, key)
      }
    } else if (item.kind === "focus") {
      const actual = load("lib/ai/conversation-focus.ts").conversationFocus(item.prompt, item.history)
      assert.equal(actual.anchor, item.expected.anchor)
    } else if (item.kind === "resume") {
      assert.equal(load("lib/ai/answer-completion.ts").isContinueRequest(item.prompt), item.expected)
    } else if (item.kind === "provider") {
      const before = JSON.stringify(item.history)
      const messages = load("lib/server/malik-model-router.ts").buildMessages({ model: { id: "malik-max", label: "MalikLLM MAX", provider: "cloudflare", providerModel: "fixture", capabilities: ["chat"] }, prompt: item.prompt, taskPrompt: item.taskPrompt, systemPrompt: "", history: item.history })
      if (item.retained) assert.ok(messages.some(message => String(message.content).includes(item.retained)), "prior user constraint must reach the provider")
      if (item.countCurrent !== undefined) assert.equal(messages.filter(message => message.role === "user" && message.content === item.prompt).length, item.countCurrent)
      if (item.countOriginal !== undefined) assert.equal(messages.filter(message => message.role === "user" && message.content === item.taskPrompt).length, item.countOriginal)
      if (item.excludeScaffold) assert.ok(!messages.some(message => String(message.content).includes("[MALIK_SESSION_MEMORY]")))
      if (item.bounded) assert.ok(JSON.stringify(messages).length < 185_000, "provider history must stay within its character budget")
      assert.equal(JSON.stringify(item.history), before, "input history must not be mutated")
    } else if (item.kind === "budget") {
      const budget = load("lib/ai/answer-budget.ts").answerBudget({ history: item.history }, item.prompt, item.target)
      if (item.max) assert.ok(budget <= item.max, `budget ${budget} > ${item.max}`)
      if (item.min) assert.ok(budget >= item.min, `budget ${budget} < ${item.min}`)
    } else if (item.kind === "claim") {
      const intent = resolveConversationIntent({ prompt: item.prompt })
      assert.equal(load("lib/ai/conversation-validation.ts").validateConversationAnswer(intent, item.draft).issue, item.expected)
    } else if (item.kind === "domain") {
      assert.equal(load("lib/ai/domain-intelligence.ts").resolveDomainPlan({ prompt: item.prompt, messages: item.history }).context.anchor, item.expected)
    } else if (item.kind === "overlap") {
      let text = ""
      const filter = load("lib/ai/continuation-overlap.ts").createContinuationFilter(item.previous, chunk => { text += chunk })
      for (const character of item.incoming) filter.push(character)
      filter.end()
      assert.equal(text, item.expected)
    } else if (item.kind === "pipeline") {
      captured.length = 0
      // No answer is substituted: execution stops at the model boundary and
      // we inspect the packet the real existing pipeline would send.
      const body = { originalQuestion: item.prompt, history: item.history, messages: item.messages, research: false, disableResearch: true }
      const prepared = item.owner ? load("lib/server/malik-owner-context.ts").withVerifiedOwnerChatContext(body) : body
      try { await load("lib/malik-god-router.ts").malikGodAnswer(prepared, { modelId: "malik-max" }) } catch (error) { assert.equal(error.message, "CONVERSATION_CAPTURE_STOP") }
      assert.equal(captured.length, 1, "contextual turn must reach the selected model once")
      assert.ok(captured[0].systemPrompt.includes(`"language":"${item.language}"`))
      assert.ok(/without real receipts|not a successful tool receipt/.test(captured[0].systemPrompt))
      if (item.retained) {
        const packet = load("lib/server/malik-model-router.ts").buildMessages({ model: { id: "malik-max", label: "MalikLLM MAX", provider: "cloudflare", providerModel: "fixture", capabilities: ["chat"] }, ...captured[0] })
        assert.ok(packet.some(message => String(message.content).includes(item.retained)))
      }
    } else if (item.kind === "identity") {
      const result = load("lib/server/malik-owner-context.ts").malikIdentityAnswer({ originalQuestion: item.prompt, history: item.history }, false)
      assert.match(result, /^Мен/)
    }
    report.cases.push({ name: item.name, passed: true })
  } catch (error) { report.cases.push({ name: item.name, passed: false, error: error.message.slice(0, 260) }) }
}
report.passed = report.cases.filter(item => item.passed).length
report.total = report.cases.length
if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2)) }
for (const item of report.cases) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}${item.error ? ": " + item.error.split("\n")[0] : ""}`)
console.log(`${report.passed}/${report.total}; source=${report.ref}`)
if (!record && report.passed !== report.total) process.exitCode = 1
