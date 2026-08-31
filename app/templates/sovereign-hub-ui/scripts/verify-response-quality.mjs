import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

function loadTypeScriptModule(file) {
  const source = fs.readFileSync(file, "utf8")
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const box = { exports: {} }
  new Function("require", "module", "exports", js)(
    (name) => { throw new Error(`unexpected require(${name})`) }, box, box.exports,
  )
  return box.exports
}

const intelligence = loadTypeScriptModule("lib/ai/response-intelligence.ts")
const {
  MALIK_RESPONSE_FEATURES,
  analyzeResponseRequest,
  buildMalikResponseSystemPrompt,
  cleanModelText,
  selectedResponseFeatures,
} = intelligence

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

console.log("\nMALIK Answer DNA")

check("contains exactly 50 independently named response modules", () => {
  assert.equal(MALIK_RESPONSE_FEATURES.length, 50)
  assert.equal(new Set(MALIK_RESPONSE_FEATURES.map((feature) => feature.id)).size, 50)
})

check("calibrates short and complex requests differently", () => {
  const simple = analyzeResponseRequest("Что такое рендер?")
  const complex = analyzeResponseRequest("Дай подробный пошаговый план запуска, сравни варианты, риски и бюджет для нового продукта")
  assert.equal(simple.complexity, "simple")
  assert.match(simple.targetLength, /2-4/)
  assert.equal(complex.complexity, "complex")
})

check("activates comparison intelligence only when it is useful", () => {
  const profile = analyzeResponseRequest("Сравни три модели по скорости, цене и качеству")
  const names = selectedResponseFeatures(profile).map((feature) => feature.name)
  assert.ok(names.includes("Comparison Matrix"))
  assert.ok(names.includes("Decision Matrix"))
})

check("activates runnable and copy-ready code intelligence", () => {
  const profile = analyzeResponseRequest("Исправь ошибку TypeScript и дай готовый код")
  const names = selectedResponseFeatures(profile).map((feature) => feature.name)
  assert.ok(names.includes("Executable Code"))
  assert.ok(names.includes("Copy Ready"))
  assert.ok(names.includes("Verification Loop"))
})

check("web answers require inline evidence and forbid invented links", () => {
  const prompt = buildMalikResponseSystemPrompt({ prompt: "Какие новости сегодня?", usedWeb: true, currentDate: "2026-09-01" })
  assert.match(prompt, /inline as \[n\]/)
  assert.match(prompt, /Never invent a citation/)
  assert.match(prompt, /Current date: 2026-09-01/)
})

check("cleanup removes hidden thought without flattening Markdown", () => {
  const raw = "<think>private</think>\n# Заголовок\n\n- пункт\n\n```ts\n  const value = 1\n```"
  const clean = cleanModelText(raw)
  assert.ok(!clean.includes("private"))
  assert.match(clean, /^# Заголовок/m)
  assert.match(clean, /^- пункт/m)
  assert.match(clean, /```ts\n  const value = 1\n```/)
})

console.log("\nwiring")

check("the primary router uses the adaptive response contract", () => {
  const router = fs.readFileSync("lib/malik-god-router.ts", "utf8")
  const cleanTextBody = router.match(/function cleanText\(value: unknown\) \{[\s\S]*?\n\}/)?.[0] || ""
  assert.match(router, /buildMalikResponseSystemPrompt/)
  assert.match(router, /cleanModelText/)
  assert.ok(!/replace\(\/\\s\+\/g/.test(cleanTextBody), "main answer whitespace must not be flattened")
})

check("the UI supports tables, code copy and bounded word-safe reveal", () => {
  const markdown = fs.readFileSync("components/sovereign/MalikMarkdown.tsx", "utf8")
  const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
  assert.match(markdown, /malik-md-table/)
  assert.match(markdown, /navigator\.clipboard\.writeText/)
  assert.match(dashboard, /answer\.match\(\/\\S\+\\s\*\|\\s\+\/g\)/)
  assert.match(dashboard, /Math\.min\(24/)
})

console.log(failures ? `\n${failures} failing\n` : "\nall response-quality checks passed\n")
process.exit(failures ? 1 : 0)
