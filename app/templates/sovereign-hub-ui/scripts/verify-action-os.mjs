import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import ts from "typescript"

const root = process.cwd()

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

function assert(condition, message) {
  if (!condition) throw new Error(`ACTION_OS_VERIFY_FAILED: ${message}`)
}

function loadStandaloneTs(relative) {
  const source = read(relative)
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relative,
  }).outputText

  const module = { exports: {} }
  const sandbox = {
    module,
    exports: module.exports,
    console,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    Math,
    Date,
    String,
    Array,
    Set,
    JSON,
  }
  vm.runInNewContext(output, sandbox, { filename: relative })
  return module.exports
}

const action = loadStandaloneTs("lib/ai/action-os.ts")
const memory = loadStandaloneTs("lib/ai/memory-contract.ts")

const build = action.buildMalikActionPlan
assert(typeof build === "function", "planner export is missing")

const ruBuild = build("Создай сайт Malik AI и проверь ошибки", { history: [{ role: "user", content: "x" }] })
assert(ruBuild.shouldRender === true, "Russian action must render a plan")
assert(ruBuild.intent === "build", `Russian build intent expected, got ${ruBuild.intent}`)
assert(ruBuild.steps.some((step) => step.kind === "verify"), "build plan must verify the result")

const kkBuild = build("Malik AI үшін сайт жаса және қателерді тексер", {})
assert(kkBuild.shouldRender === true, "Kazakh action must render a plan")
assert(kkBuild.intent === "build", `Kazakh build intent expected, got ${kkBuild.intent}`)

const taxi = build("Закажи такси до аэропорта", {})
assert(taxi.intent === "taxi", `taxi intent expected, got ${taxi.intent}`)
assert(taxi.requiresConfirmation === true, "external taxi action must require confirmation")
assert(taxi.steps.some((step) => step.requiresConfirmation), "confirmation step is missing")

const safeChat = build("Привет, как дела?", {})
assert(safeChat.shouldRender === false, "casual chat must not show Action OS noise")
assert(safeChat.requiresConfirmation === false, "casual chat cannot require confirmation")

const destructive = build("Удали production базу", {})
assert(destructive.requiresConfirmation === true, "destructive request must stop for confirmation")

const encoded = memory.encodeMalikMemoryCookie([
  "Отвечай кратко на русском",
  "Проект называется Malik AI",
])
const decoded = memory.decodeMalikMemoryCookie(encoded)
assert(decoded.length === 2, "memory cookie round trip failed")
assert(decoded[0] === "Отвечай кратко на русском", "memory text changed during round trip")

const stream = read("app/api/stream/route.ts")
assert(stream.includes("prepareMalikActionRuntime(request, body)"), "stream route does not prepare Action OS")
assert(stream.includes("malikActionPlanMarkdown(plan)"), "stream route does not emit a visible plan")
assert(stream.includes("malikActionReceiptMarkdown(plan)"), "stream route does not emit a receipt")
assert(stream.indexOf("malikActionPlanMarkdown(plan)") < stream.indexOf("void malikGodAnswer("), "plan must be emitted before model execution")

const chat = read("app/api/ai/chat/route.ts")
assert(chat.includes("prepareMalikActionRuntime(request, body)"), "non-stream chat is not in Action OS parity")
assert(chat.includes("payload.actionPlan"), "non-stream API does not expose plan metadata")

const context = read("lib/malik-context.ts")
assert(context.includes("syncMalikMemoryCookie"), "browser memory is not bridged to runtime")
assert(context.includes("MALIK_MEMORY_COOKIE"), "memory bridge cookie contract is missing")
assert(context.includes("writeContextEnabled"), "context toggle integration is missing")

const runtime = read("lib/server/malik-action-runtime.ts")
assert(runtime.includes("MALIK_USER_CONTROLLED_MEMORY"), "server memory context marker is missing")
assert(runtime.includes("injectBeforeCurrentUser"), "memory/action context ordering guard is missing")
assert(runtime.includes("Never") === false, "runtime should not duplicate Action OS policy text")

const plannerRoute = read("app/api/ai/action-os/route.ts")
assert(plannerRoute.includes("malik-action-os-v1"), "planner API version is missing")
assert(plannerRoute.includes("external-or-irreversible-actions-require-confirmation"), "planner API confirmation contract is missing")

console.log("ACTION_OS_VERIFY_OK", JSON.stringify({
  ruIntent: ruBuild.intent,
  kkIntent: kkBuild.intent,
  taxiRisk: taxi.risk,
  memoryItems: decoded.length,
  version: ruBuild.version,
}))
