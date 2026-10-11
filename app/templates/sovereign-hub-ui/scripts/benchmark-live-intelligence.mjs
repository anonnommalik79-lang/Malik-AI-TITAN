import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { performance } from "node:perf_hooks"
const require = createRequire(import.meta.url), baseline = "c3e504b8"
const rootPrefix = "app/templates/sovereign-hub-ui/"
function loader(ref) {
  const modules = new Map()
  function load(file) {
    const key = path.normalize(file)
    if (modules.has(key)) return modules.get(key).exports
    const source = ref ? execFileSync("git", ["show", ref + ":" + rootPrefix + key], { encoding: "utf8" }) : fs.readFileSync(key, "utf8")
    const module = { exports: {} }; modules.set(key, module)
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    new Function("require", "module", "exports", js)((name) => name.startsWith("@/") || name.startsWith(".") ? load((name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(key), name)) + ".ts") : require(name), module, module.exports)
    return module.exports
  }
  return load
}
const source = fs.readFileSync("scripts/verify-live-intelligence.mjs", "utf8")
const ast = ts.createSourceFile("fixtures.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const prompts = {}
for (const node of ast.statements) if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) if (["staticPrompts", "dynamicPrompts"].includes(declaration.name.getText(ast))) prompts[declaration.name.getText(ast)] = new Function("return " + declaration.initializer.getText(ast))()
const rows = []
for (const [name, choose] of [["before", loader(baseline)("lib/ai/web-search-policy.ts").shouldUseWeb], ["after", loader()("lib/ai/web-search-policy.ts").shouldUseWeb]]) {
  const times = [], errors = []
  for (let n = 0; n < 30; n++) for (const [list, expected] of [[prompts.staticPrompts, false], [prompts.dynamicPrompts, true]]) for (const prompt of list) {
    const started = performance.now(), actual = choose(prompt); times.push(performance.now() - started)
    if (!n && actual !== expected) errors.push({ prompt, expected, actual })
  }
  times.sort((a, b) => a - b)
  rows.push({ name, corpus: 75, correct: 75 - errors.length, falsePositiveSearches: errors.filter((e) => !e.expected).length, missedDynamicSearches: errors.filter((e) => e.expected).length, p50Ms: times[Math.floor(times.length * .5)], p95Ms: times[Math.floor(times.length * .95)], errors })
}
const { EvidenceSearchCache, ProviderCircuits, runLiveSearch } = loader()("lib/live-intelligence/search-engine.ts")
const fixed = new Date("2026-10-11T13:00:00Z"), clock = () => fixed.getTime()
const evidence = { title: "Introducing GPT-99 TEST FIXTURE", url: "https://openai.com/fixture/model", domain: "openai.com", publishedAt: "2026-10-11T09:00:00Z", snippet: "Official announcement TEST FIXTURE" }
const resourceCache = new EvidenceSearchCache()
global.gc?.()
const beforeHeap = process.memoryUsage().heapUsed
let serializedBytes = 0
for (let n = 0; n < 160; n++) {
  const sources = Array.from({ length: 8 }, (_, i) => ({ ...evidence, url: evidence.url + `/${n}/${i}`, snippet: `${n}/${i}: ` + "bounded fixture text ".repeat(120).slice(0, 2390) }))
  resourceCache.set("fixture-" + n, sources, clock(), 300000)
  if (n >= 32) serializedBytes += Buffer.byteLength(JSON.stringify(sources))
}
global.gc?.()
const cacheHeapDelta = process.memoryUsage().heapUsed - beforeHeap
const searchMetrics = []
for (const mode of ["fast", "deep", "max"]) {
  const query = "Какие новые ИИ-модели вышли за последние семь дней?", cache = new EvidenceSearchCache()
  const baseInput = { prompt: query, queries: [query, query + " official", query + " sources"], mode, now: clock, cache, circuits: new ProviderCircuits() }
  const fallback = await runLiveSearch({ ...baseInput, providers: [{ name: "broken-fixture", run: async () => { throw Error("fixture unavailable") } }, { name: "backup-fixture", run: async () => [evidence] }] })
  const repeat = await runLiveSearch({ ...baseInput, providers: [{ name: "broken-fixture", run: async () => { throw Error("fixture unavailable") } }, { name: "backup-fixture", run: async () => [evidence] }] })
  const failed = await runLiveSearch({ ...baseInput, cache: new EvidenceSearchCache(), providers: Array.from({ length: 20 }, (_, n) => ({ name: "down-" + n, run: async () => [] })) })
  searchMetrics.push({ mode, fallbackCalls: fallback.calls, fallbackSuccesses: fallback.fallbackSuccesses, failedAttempts: fallback.attempts.filter(a => a.outcome === "failed").length, cacheRepeatCalls: repeat.calls, allEmptyCallCap: failed.calls })
}
console.log(JSON.stringify({ baseline, rows, fixtureResources: { cacheEntries: resourceCache.size, retainedJsonBytes: serializedBytes, heapDeltaBytes: cacheHeapDelta, gcAvailable: Boolean(global.gc), searchMetrics, providerCostUSD: 0 }, note: "Curated intent corpus and simulated transports; not independent real-world accuracy or end-to-end production latency. Heap delta requires --expose-gc and is a single isolated cache measurement. No external API calls." }, null, 2))
