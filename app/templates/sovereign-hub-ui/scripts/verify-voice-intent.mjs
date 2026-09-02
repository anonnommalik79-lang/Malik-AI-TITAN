import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const root = path.resolve(import.meta.dirname, "..")
function load(file, stubs = {}, extra = "", env = {}) {
  const full = path.resolve(root, file)
  const code = ts.transpileModule(fs.readFileSync(full, "utf8") + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  const require = (id) => {
    if (id in stubs) return stubs[id]
    if (id.startsWith("@/lib/voice/") || id === "@/lib/translator/languages") return load(id.slice(2) + ".ts", stubs)
    throw new Error(`Unstubbed dependency: ${id}`)
  }
  new Function("require", "module", "exports", "process", code)(require, module, module.exports, { env })
  return module.exports
}

const intent = load("lib/voice/spoken-intent.ts")
for (const said of ["калайсын", "Қалайсың?", "Салем, калайсын!", "Sola, qalaysyn?", "калайсыз", "қалайсың Сола"]) {
  assert.ok(intent.kazakhGreeting(said), said)
}
for (const said of ["Что означает калайсын?", "калайсын деген не", "Клисн", "калайсын поищи погоду", "«калайсын»", "калайсын Мария"]) {
  assert.equal(intent.kazakhGreeting(said), null, `Do not reinterpret a task/name: ${said}`)
}
assert.equal(intent.kazakhGreeting("қалайсыз?"), "polite")
assert.equal(intent.answersKazakhGreeting("Клисн — ол әйелдің есімі."), false)
assert.equal(intent.answersKazakhGreeting("Жақсымын, рақмет! Өзің қалайсың?"), true)

let lastCall, modelReply = "Клисн — ол әйелдің есімі.", calls = 0
const turn = load("app/api/voice/turn/route.ts", {
  "@/lib/malik-compute/runtime": { withCompute: (handler) => handler },
  "@/lib/voice/voice-llm-router": { voiceLlmAnswer: async (input) => {
    lastCall = input; calls++
    return { content: modelReply, provider: "test", model: "test-model" }
  } },
  "@/lib/voice/web-search": { voiceSearchContext: async () => ({ context: "", requested: false, reason: "off", sources: [] }) },
})
async function request(text, history = []) {
  return (await turn.POST(new Request("http://localhost/api/voice/turn", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, history, language: "kk" }),
  }))).json()
}
let result = await request("калайсын")
assert.equal(result.content, "Жақсымын, рақмет! Өзің қалайсың?")
assert.equal(result.transcript, "калайсын", "Do not falsify what ASR heard")
assert.equal(result.languageLocale, "kk-KZ")
assert.equal(result.correctedGreeting, true)
assert.equal(calls, 1, "Do not waste retries on the exact greeting")
assert.match(lastCall.instruction, /хал сұрау/)
modelReply = "Жақсымын! Сен қалайсың?"
result = await request("қалайсың?")
assert.equal(result.content, modelReply, "Keep a good model answer")
assert.equal(result.correctedGreeting, false)
modelReply = "Бұл сөз қазақша хал сұрау үшін қолданылады."
result = await request("калайсын деген не")
assert.equal(result.content, modelReply, "A real definition request is not a greeting")
modelReply = "Привет! Всё хорошо, спасибо."
result = await request("привет как дела")
assert.equal(result.languageLocale, "ru-RU")
assert.equal(result.content, modelReply)

// Run the actual router normalization, with no real API/credentials or usage writes.
const router = load("lib/ai/router.ts", {
  "./persona": {}, "./task-prompts": {}, "./detect-task": { detectTask: () => ({ task: "chat" }) },
  "./fallback": {}, "./providers": {}, "@/lib/limits/rate-limit": {}, "./usage": {},
  "./identity": { MALIK_STRICT_SYSTEM_PROMPT: "Default identity" },
  "@/lib/auth/admin-policy": { isOwnerEmail: () => false },
}, "\nexport { normalize };", { CHAT_HISTORY_WINDOW: "12" })
const system = "LANGUAGE: answer only in Kazakh. Understand калайсын as қалайсың."
const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `turn ${i}` }))
const normalized = router.normalize({ prompt: "калайсын", messages: [{ role: "system", content: system }, ...history, { role: "user", content: "калайсын" }] })
assert.equal(normalized.messages[0].content, system)
assert.equal(normalized.messages.length, 13)
assert.equal(normalized.messages.at(-1).content, "калайсын")

for (const [file, name] of [["gemini", "geminiProvider"], ["openrouter", "openRouterProvider"], ["deepseek", "deepSeekProvider"]]) {
  let sent
  const provider = load(`lib/ai/providers/${file}.ts`, {
    "../models": { modelFor: () => "test-model" },
    "../response-intelligence": { buildMalikResponseSystemPrompt: () => "text chat default" },
    "./base": { hasEnv: () => true, health: () => ({}), responseType: () => "chat", providerFetch: async (_url, init) => {
      sent = JSON.parse(init.body)
      return Response.json({ candidates: [{ content: { parts: [{ text: "Жақсымын!" }] } }], choices: [{ message: { content: "Жақсымын!" } }] })
    } },
  }, "", { GEMINI_API_KEY: "test-not-a-key", OPENROUTER_API_KEY: "test-not-a-key", DEEPSEEK_API_KEY: "test-not-a-key" })[name]
  await provider.sendMessage({ ...normalized, model: "test-model", metadata: { lane: "voice" } })
  if (file === "gemini") {
    assert.equal(sent.systemInstruction.parts[0].text, system)
    assert.equal(sent.contents.at(-1).parts[0].text, "калайсын")
    assert.equal(sent.contents.length, 12)
  } else {
    assert.equal(sent.messages[0].content, system, `${file} must keep Voice instructions`)
    assert.equal(sent.messages.at(-1).content, "калайсын")
  }
}
console.log("PASS voice meaning: Kazakh greeting, no invented name, preserved transcript, Russian, long conversation, three provider payloads")
