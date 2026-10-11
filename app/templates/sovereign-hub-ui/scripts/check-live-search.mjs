// Explicit live smoke: public services only; no LLM generations or private-account data.
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url), cache = new Map()
function load(file) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const module = { exports: {} }; cache.set(absolute, module)
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", js)((name) => {
    if (name === "server-only") return {}
    if (name === "@/lib/server/malik-model-router") return { runStrictMalikModel: async () => { throw Error("Live source smoke must not generate with an LLM") } }
    if (name === "@/lib/server/context-fusion") return { requestedFusionConnectors: () => [], collectMalikConnectedContext: async () => { throw Error("No private connectors in live source smoke") } }
    if (name === "@/lib/server/science-context") return { collectMalikScienceContext: async () => { throw Error("No model/science generations in source smoke") } }
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(absolute), name)
      return load(target.endsWith(".ts") ? target : target + ".ts")
    }
    return require(name)
  }, module, module.exports)
  return module.exports
}
// This smoke never bills configured search providers; paid-key validation is a separate opt-in.
for (const name of ["SERPER_API_KEY", "TAVILY_API_KEY", "BRAVE_SEARCH_API_KEY"]) delete process.env[name]
const { gatherSourcesForPrompt } = load("lib/malik-god-router.ts")
const { currentEvidenceAvailable } = load("lib/live-intelligence/evidence.ts")
const { classifyFreshness } = load("lib/ai/freshness-intent.ts")
const records = []
const prompts = { A: "Какие новые ИИ-модели официально вышли за последние семь дней?", B: "Какая самая новая официально представленная модель Google DeepMind на сегодняшний день?", C: "Какие технологические новости Казахстана за 24 часа?", D: "Какая актуальная стабильная версия Next.js?" }
const selected = process.argv.find(value => /^--case=[ABCD]$/u.test(value))?.slice(-1)
for (const prompt of selected ? [prompts[selected]] : Object.values(prompts)) {
  const started = performance.now(), sources = await gatherSourcesForPrompt(prompt)
  records.push({ prompt, ms: Math.round(performance.now() - started), qualified: currentEvidenceAvailable(sources, classifyFreshness(prompt)), sources: sources.map(({ title, url, provider, publishedAt, checkedAt, readAt, authority, freshness }) => ({ title, url, provider, publishedAt, checkedAt, readAt, authority, freshness })) })
}
console.log("LIVE_SEARCH_SMOKE " + JSON.stringify(records))
