// Malik AI OS core: the task graph, the failure model, auto mode and the
// planner. Pure functions only — no network, no storage.
//
//   npm run test:os-core

import assert from "node:assert/strict"

const root = new URL("..", import.meta.url).pathname
const graph = await import(`${root}lib/os/task-graph.ts`)
const failures = await import(`${root}lib/os/failures.ts`)
const caps = await import(`${root}lib/os/capabilities.ts`)
const planner = await import(`${root}lib/os/planner.ts`)

let failed = 0
let count = 0
async function check(name, fn) {
  count += 1
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${String(error?.stack || error).split("\n").slice(0, 4).join("\n       ")}`)
  }
}

function task(id, dependencies = [], extra = {}) {
  return {
    id,
    type: "document.write",
    label: id,
    status: "planned",
    progress: 0,
    dependencies,
    input: {},
    artifactIds: [],
    retry: { attempts: 0, maxAttempts: 3 },
    idempotencyKey: `k:${id}`,
    ...extra,
  }
}

const SHOWCASE = "Создай казахстанский технологический стартап и подготовь его к презентации инвесторам."

console.log("task graph")

await check("valid graph passes; duplicates, missing and self dependencies are reported", () => {
  assert.equal(graph.validateGraph([task("a"), task("b", ["a"])]).ok, true)
  const bad = graph.validateGraph([task("a"), task("a"), task("b", ["zzz"]), task("c", ["c"])])
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.some((e) => e.includes("duplicate")))
  assert.ok(bad.errors.some((e) => e.includes("missing zzz")))
  assert.ok(bad.errors.some((e) => e.includes("depends on itself")))
})

await check("cycles are found and topologicalOrder refuses them", () => {
  const cyclic = [task("a", ["c"]), task("b", ["a"]), task("c", ["b"])]
  const result = graph.validateGraph(cyclic)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.startsWith("cycle")))
  assert.throws(() => graph.topologicalOrder(cyclic))
})

await check("topological order puts dependencies first", () => {
  const order = graph.topologicalOrder([task("c", ["b"]), task("b", ["a"]), task("a")]).map((t) => t.id)
  assert.deepEqual(order, ["a", "b", "c"])
})

await check("transitions follow the state machine", () => {
  const t = task("a")
  const queued = graph.transition(t, "queued", {}, 1)
  const running = graph.transition(queued, "running", {}, 5)
  assert.equal(running.startedAt, 5)
  const done = graph.transition(running, "completed", {}, 9)
  assert.equal(done.progress, 1)
  assert.equal(done.finishedAt, 9)
  assert.throws(() => graph.transition(done, "running"), graph.TaskTransitionError)
  assert.throws(() => graph.transition(t, "completed"), graph.TaskTransitionError)
  const failedTask = graph.transition(running, "failed", { error: { code: "X", message: "m", retryable: true } }, 7)
  const again = graph.transition(failedTask, "queued", {}, 8)
  assert.equal(again.error, undefined)
  assert.equal(again.finishedAt, undefined)
  assert.equal(again.progress, 0)
})

await check("readyTasks waits for required dependencies and honours retry time", () => {
  const tasks = [task("a", [], { status: "completed" }), task("b", ["a"]), task("c", ["b"])]
  assert.deepEqual(graph.readyTasks(tasks).map((t) => t.id), ["b"])
  const retrying = [task("a", [], { status: "retrying", retry: { attempts: 1, maxAttempts: 3, nextRetryAt: 2_000 } })]
  assert.equal(graph.readyTasks(retrying, 1_000).length, 0)
  assert.equal(graph.readyTasks(retrying, 2_500).length, 1)
})

await check("optional and soft dependencies only need to be finished", () => {
  const optional = [task("logo", [], { status: "failed", optional: true }), task("site", ["logo"])]
  assert.deepEqual(graph.readyTasks(optional).map((t) => t.id), ["site"])
  const soft = [task("research", [], { status: "failed" }), task("brand", ["research"], { softDependencies: ["research"] })]
  assert.deepEqual(graph.readyTasks(soft).map((t) => t.id), ["brand"])
  assert.equal(graph.blockedTasks(soft).length, 0)
  const hard = [task("research", [], { status: "failed", label: "Исследую рынок" }), task("brand", ["research"])]
  assert.equal(graph.readyTasks(hard).length, 0)
  const blocked = graph.blockedTasks(hard)
  assert.equal(blocked.length, 1)
  assert.equal(blocked[0].error.code, "DEPENDENCY_FAILED")
  assert.match(blocked[0].error.message, /Исследую рынок/)
})

await check("flow status: running, completed, partial, failed, cancelled", () => {
  assert.equal(graph.flowStatusOf([task("a")]), "planned")
  assert.equal(graph.flowStatusOf([task("a", [], { status: "completed" }), task("b", [], { status: "running" })]), "running")
  assert.equal(graph.flowStatusOf([task("a", [], { status: "completed" }), task("b", [], { status: "completed" })]), "completed")
  assert.equal(graph.flowStatusOf([task("a", [], { status: "completed" }), task("b", [], { status: "failed", optional: true })]), "partial")
  assert.equal(graph.flowStatusOf([task("a", [], { status: "completed" }), task("b", [], { status: "failed" })]), "partial")
  assert.equal(graph.flowStatusOf([task("a", [], { status: "failed" }), task("b", [], { status: "cancelled" })]), "failed")
  assert.equal(graph.flowStatusOf([task("a", [], { status: "cancelled" })]), "cancelled")
})

await check("flow progress counts finished tasks and partial progress", () => {
  const p = graph.flowProgress([task("a", [], { status: "completed" }), task("b", [], { status: "running", progress: 0.5 })])
  assert.equal(p, 0.75)
  assert.deepEqual(graph.dependentsOf([task("a"), task("b", ["a"]), task("c", ["b"]), task("d")], "a").sort(), ["b", "c"])
})

console.log("failures")

await check("raw browser errors become human messages with a retry verdict", () => {
  for (const raw of ["Load failed", "Failed to fetch", "TypeError: NetworkError when attempting to fetch resource."]) {
    const error = failures.classifyFailure(new TypeError(raw))
    assert.equal(error.code, "NETWORK", raw)
    assert.equal(error.retryable, true)
    assert.doesNotMatch(error.message, /load failed|failed to fetch/i)
  }
  const human = failures.humanizeError("Load failed", "image")
  assert.match(human.message, /^Изображение не пришло/)
  assert.doesNotMatch(human.message, /load failed/i)
  assert.match(failures.humanizeError("Load failed", "presentation").message, /^Презентация не пришла/)
  assert.match(failures.humanizeError(new Error("The operation was aborted due to timeout"), "chat").message, /^Ответ готовился слишком долго/)
})

await check("status codes and engine codes classify correctly", () => {
  assert.equal(failures.classifyFailure({ status: 429, message: "x" }).code, "RATE_LIMITED")
  assert.equal(failures.classifyFailure({ status: 402 }).action, "upgrade")
  assert.equal(failures.classifyFailure({ status: 401 }).code, "SIGN_IN_REQUIRED")
  assert.equal(failures.classifyFailure({ status: 503, message: "upstream" }).code, "PROVIDER_UNAVAILABLE")
  assert.equal(failures.classifyFailure({ status: 400, message: "bad" }).retryable, false)
  assert.equal(failures.classifyFailure(Object.assign(new Error("all busy"), { code: "MAX_ALL_LANES_BUSY" })).code, "MODELS_BUSY")
  const tool = failures.classifyFailure(new failures.OsToolError("NO_WEB", "Поиск недоступен", { retryable: false }))
  assert.equal(tool.code, "NO_WEB")
  assert.equal(tool.message, "Поиск недоступен")
  const unknown = failures.classifyFailure(new Error("weird internal thing at line 5"))
  assert.doesNotMatch(unknown.message, /line 5/)
})

await check("retry delay grows, is bounded and respects rate-limit hints", () => {
  const mid = () => 0.5
  assert.equal(failures.retryDelayMs(1, undefined, 0, mid), 1_500)
  assert.equal(failures.retryDelayMs(2, undefined, 0, mid), 3_000)
  assert.equal(failures.retryDelayMs(10, undefined, 0, mid), 20_000)
  assert.equal(failures.retryDelayMs(1, { code: "RATE_LIMITED", message: "", retryable: true }, 0, mid), 5_000)
  assert.equal(failures.retryDelayMs(1, undefined, 9_000, mid), 9_000)
  assert.equal(failures.shouldRetry({ code: "X", message: "", retryable: true }, 1, 3), true)
  assert.equal(failures.shouldRetry({ code: "X", message: "", retryable: true }, 3, 3), false)
  assert.equal(failures.shouldRetry({ code: "X", message: "", retryable: false }, 1, 3), false)
})

console.log("auto mode")

await check("the Digital Bridge showcase command starts a full Superflow", () => {
  const decision = caps.decideSuperflow(SHOWCASE)
  assert.equal(decision.run, true)
  for (const capability of ["research", "brand", "image", "website", "business-plan", "presentation", "video-script"]) {
    assert.ok(decision.capabilities.includes(capability), capability)
  }
  assert.equal(caps.qualityTier(SHOWCASE, decision.capabilities.length), "deep")
})

await check("questions, greetings and single deliverables stay normal chat", () => {
  for (const text of [
    "привет",
    "Как написать бизнес-план для кофейни и что туда включить?",
    "Что такое юнит-экономика стартапа и почему она важна?",
    "Нарисуй кота в космосе в стиле аниме пожалуйста",
    "Напиши функцию на Python для сортировки списка",
    "/image красивый закат над горами Алматы",
    "Сделай презентацию про историю Казахстана на 10 слайдов",
  ]) {
    assert.equal(caps.decideSuperflow(text).run, false, text)
  }
  assert.equal(caps.qualityTier("привет"), "fast")
  assert.equal(caps.qualityTier("Подробно объясни стратегию выхода на рынок Центральной Азии"), "deep")
})

await check("an explicit multi-deliverable request runs; data needs a file", () => {
  const decision = caps.decideSuperflow("Сделай бренд, логотип и лендинг для моей кофейни в Астане")
  assert.equal(decision.run, true)
  assert.ok(decision.capabilities.includes("website"))
  assert.equal(caps.detectCapabilities("проанализируй csv с продажами").includes("data"), false)
  assert.equal(caps.detectCapabilities("проанализируй csv с продажами", ["file"]).includes("data"), true)
})

await check("capability routes use MAX with budgets that follow quality", () => {
  const fast = caps.routeCapability("code", "fast")
  const deep = caps.routeCapability("code", "deep")
  assert.equal(fast.model, "malik-max")
  assert.equal(fast.tool, "code.project")
  assert.ok(deep.maxTokens > fast.maxTokens)
  assert.equal(caps.routeCapability("research", "balanced").requires.web, true)
  assert.equal(caps.routeCapability("image", "balanced").tool, "image.generate")
})

console.log("planner")

await check("the showcase plan is a valid graph with the expected order", () => {
  const decision = caps.decideSuperflow(SHOWCASE)
  const tasks = planner.planFlow({ flowId: "flow_t", goal: SHOWCASE, capabilities: decision.capabilities, quality: "deep" })
  assert.equal(graph.validateGraph(tasks).ok, true)
  const ids = tasks.map((t) => planner.stepIdOf(t))
  assert.deepEqual(ids, ["understand", "research", "brand", "logo", "plan", "site", "deck", "video", "result"])
  const labels = tasks.map((t) => t.label)
  assert.ok(labels.includes("Готовлю Investor Deck"))
  assert.ok(labels.includes("Рисую логотип"))
  const byStep = Object.fromEntries(tasks.map((t) => [planner.stepIdOf(t), t]))
  assert.deepEqual(byStep.research.dependencies, ["flow_t.understand"])
  assert.ok(byStep.site.softDependencies.includes("flow_t.logo"))
  assert.equal(byStep.logo.optional, true)
  assert.equal(byStep.result.dependencies.length, tasks.length - 1)
  // Idempotency keys are unique and stable.
  assert.equal(new Set(tasks.map((t) => t.idempotencyKey)).size, tasks.length)
  assert.equal(planner.planFlow({ flowId: "flow_t", goal: SHOWCASE, capabilities: decision.capabilities, quality: "deep" })[3].idempotencyKey, byStep.logo.idempotencyKey)
})

await check("after understanding, research runs alone; then brand and plan run in parallel", () => {
  const decision = caps.decideSuperflow(SHOWCASE)
  let tasks = planner.planFlow({ flowId: "f", goal: SHOWCASE, capabilities: decision.capabilities, quality: "deep" })
  const step = (id) => tasks.find((t) => planner.stepIdOf(t) === id)
  const complete = (id) => { tasks = tasks.map((t) => (planner.stepIdOf(t) === id ? { ...t, status: "completed" } : t)) }
  assert.deepEqual(graph.readyTasks(tasks).map(planner.stepIdOf), ["understand"])
  complete("understand")
  assert.deepEqual(graph.readyTasks(tasks).map(planner.stepIdOf), ["research"])
  complete("research")
  assert.deepEqual(graph.readyTasks(tasks).map(planner.stepIdOf), ["brand"])
  complete("brand")
  assert.deepEqual(graph.readyTasks(tasks).map(planner.stepIdOf).sort(), ["logo", "plan", "video"].sort())
  // The logo fails: the site still runs.
  tasks = tasks.map((t) => (planner.stepIdOf(t) === "logo" ? { ...t, status: "failed" } : t))
  complete("plan")
  assert.ok(graph.readyTasks(tasks).map(planner.stepIdOf).includes("site"))
  assert.ok(step("result"))
})

await check("a plan without a capability omits its task and its edges", () => {
  const tasks = planner.planFlow({ flowId: "g", goal: "Сделай бренд и сайт для кофейни", capabilities: ["brand", "website"], quality: "balanced" })
  assert.deepEqual(tasks.map(planner.stepIdOf), ["understand", "brand", "site", "result"])
  const site = tasks.find((t) => planner.stepIdOf(t) === "site")
  assert.deepEqual(site.dependencies, ["g.understand", "g.brand"])
})

console.log(`\n${count - failed}/${count} passed`)
if (failed) process.exit(1)
