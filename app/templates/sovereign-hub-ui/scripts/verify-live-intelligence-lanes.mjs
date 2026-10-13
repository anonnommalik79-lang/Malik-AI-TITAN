// Execute the actual stream lane functions extracted from the route AST.
// Only provider, file perception, agent and account boundaries are fixtures.
import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"
import { workTestLoader } from "./work-test-loader.mjs"
const load = workTestLoader(), freshness = load("lib/ai/freshness-intent.ts"), evidence = load("lib/live-intelligence/evidence.ts")
const accuracy = load("lib/ai/accuracy/engine.ts"), gates = load("lib/ai/accuracy/stream.ts"), brain = load("lib/ai/brain-v1.ts")
const source = { title: "Next.js v99 TEST FIXTURE", url: "https://github.com/vercel/next.js/releases/tag/fixture-v99", domain: "github.com", snippet: "Stable software release TEST FIXTURE", publishedAt: new Date(Date.now() - 3600000).toISOString(), freshness: "recent", authority: "primary", checkedAt: new Date().toISOString() }
let queries = [], modelInputs = [], fileInputs = [], godInputs = [], fail = false, fileKind = "answer", draft = "Current stable release [1].", checks = 0
const deps = {
  ...freshness, ...evidence, ...accuracy, ...gates, ...brain,
  ...load("lib/ai/web-search-policy.ts"),
  // The production stream now enters petroleum routing before its live-intelligence
  // lanes. Exercise real domain/safety guards, while isolating the calculation
  // and document backends: these fixtures are not production petroleum tests.
  ...load("lib/work/petroleum/router.ts"),
  ...load("lib/work/petroleum/safety.ts"),
  executePetroleumDocument: async () => null,
  executePetroleumMessageAsync: async () => null,
  executePetroleumTable: () => null,
  coderPrompt: body => body.originalQuestion || body.prompt,
  coderHistory: body => body.history || [],
  hasMalikAttachments: items => Array.isArray(items) && items.length > 0,
  parsePluginCommand: prompt => prompt.startsWith("/github") ? { fixture: true } : null,
  gatherSourcesForPrompt: async (prompt, _progress, options) => { options?.signal?.throwIfAborted(); queries.push(prompt); return fail ? [] : [source] },
  sourceContext: sources => "UNTRUSTED WEB EVIDENCE " + sources.map(item => item.url).join("\n"),
  DEFAULT_MALIK_MODEL_ID: "malik-fast-120b", MALIK_CODER_MODEL_ID: "malik-coder-32b",
  runPluginModelAnswer: async () => ({ answer: { content: "Private account context", sources: [], provider: "fixture", model: "fixture", usedWeb: false, attempts: [] } }),
  hasMalikProAccess: () => false,
  buildMalikSuperpowerSystemPrompt: () => "", detectMalikSuperpowers: () => [],
  routeMalikAttachments: async input => { fileInputs.push(input); return { kind: fileKind, content: draft, prompt: "PRIVATE FILE CONTENT secret-project data", files: 1, estimatedTokens: 1, provider: "fixture", usage: {} } },
  buildChatArtifactSkillPrompt: () => "", buildOilGasSkillInstruction: () => "", resolveWorkspaceMode: () => "chat", workModeInstruction: () => "",
  prepareMalikAgentRuntime: async () => null,
  malikGodAnswer: async (...args) => { godInputs.push(args); return { content: "God answer fixture", accuracy: { fixture: true }, sources: args[7]?.sources || [], provider: "fixture", model: "fixture", attempts: [] } },
  runMalikCoderOrchestrator: async input => { modelInputs.push(input); return { content: draft, provider: "fixture", usage: { stages: [] } } },
}
const raw = fs.readFileSync("app/api/stream/route-impl.ts", "utf8"), ast = ts.createSourceFile("route.ts", raw, ts.ScriptTarget.Latest, true)
const names = ["shouldRunMalikCoder", "runSelectedAnswer", "runSelectedAnswerUnchecked"]
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(ast)).join("\n")
assert.equal(ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).length, 3)
const js = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const run = new Function(...Object.keys(deps), js + "\nreturn runSelectedAnswer;")(...Object.values(deps))
async function check(name, fn) { queries = []; modelInputs = []; fileInputs = []; godInputs = []; fail = false; fileKind = "answer"; draft = "Current stable release [1]."; await fn(); checks++; console.log("PASS " + name) }
const coder = { modelId: "malik-coder-32b", entitlement: { plan: "free" } }, text = { modelId: "malik-fast-120b", entitlement: { plan: "free" } }
await check("current coder receives evidence and one checked final answer", async () => { const tokens = []; const answer = await run({ prompt: "What is the current stable Next.js version?" }, coder, undefined, undefined, chunk => tokens.push(chunk)); assert.equal(queries.length, 1); assert.match(modelInputs[0].systemPrompt, /github.com/); assert.match(answer.content, /Sources checked/); assert.equal(tokens.length, 0) })
await check("static coder calculation uses no external source", async () => { draft = "Answer: 5"; const answer = await run({ prompt: "Calculate 2 + 2" }, coder); assert.equal(queries.length, 0); assert.equal(answer.content, "Answer: 4") })
await check("direct multimodal uses original public question without attachment contents", async () => { const answer = await run({ prompt: "What is the current stable Next.js version?", attachments: [{ text: "private-file-secret" }] }, text); assert.equal(queries.length, 1); assert.doesNotMatch(queries[0], /private-file-secret/); assert.match(fileInputs[0].systemPrompt, /github.com/); assert.equal(answer.usedWeb, true); assert.equal(answer.sources.length, 1); assert.match(answer.content, /Sources checked/) })
await check("attachment context carries prepared evidence into God without searching private text", async () => { fileKind = "context"; await run({ prompt: "What is the current stable Next.js version?", attachments: [{ text: "private-file-secret" }] }, text); assert.equal(queries.length, 1); assert.equal(godInputs[0][7].prompt, queries[0]); assert.match(godInputs[0][0].originalQuestion, /PRIVATE FILE CONTENT/); assert.equal(godInputs[0][7].sources.length, 1) })
await check("failed current coder lookup stops before model inference", async () => { fail = true; const answer = await run({ prompt: "Current Next.js version?" }, coder); assert.equal(modelInputs.length, 0); assert.match(answer.content, /could not confirm/) })
await check("failed current attachment lookup stops before perception inference", async () => { fail = true; const answer = await run({ prompt: "Current Next.js version?", attachments: [{}] }, text); assert.equal(fileInputs.length, 0); assert.match(answer.content, /could not confirm/) })
await check("connected-service commands do not search private account requests", async () => { const answer = await run({ prompt: "/github project updates today", attachments: [{}] }, text); assert.equal(queries.length, 0); assert.equal(answer.content, "Private account context") })
console.log(`${checks}/${checks} stream lane checks passed; external boundaries are fixtures`)
