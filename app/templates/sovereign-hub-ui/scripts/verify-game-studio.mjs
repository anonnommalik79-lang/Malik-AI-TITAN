// Malik Game Studio: which chat requests become games, the plan checks, a cut
// model reply continued to its end marker, the static checks and the safety
// policy, the isolated test run (crashes, freezes, dead controls, escapes),
// repairs, the page, the chat answer, history and the real chat route.
//
//   npm run test:game-studio
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { workTestLoader } from "./work-test-loader.mjs"

const after = []
const modelCalls = []
let modelAnswer = () => null
const forbidden = () => { throw new Error("Forbidden provider/tool invoked") }
class RouteError extends Error {}
const owner = { userId: "fixture-account", authenticated: true, plan: "pro" }
const chatModelCalls = []
const load = workTestLoader({
  "./oil-report.css": {}, "./malik-tex.css": {},
  "next/server": { after: (fn) => after.push(fn) },
  "@/lib/malik-god-router": { asPlainText: (answer) => answer.content, malikGodAnswer: async (body, selection, _p, onToken) => { chatModelCalls.push(body); const content = "Обычный ответ."; onToken?.(content); return { content, provider: "mock-model", model: "mock", selectedModelId: selection?.modelId, usedWeb: false, sources: [], attempts: [] } }, gatherSourcesForPrompt: forbidden, sourceContext: () => "" },
  "@/lib/server/plugin-runtime": { parsePluginCommand: () => null },
  "@/lib/server/plugin-model-answer": { runPluginModelAnswer: forbidden },
  "@/lib/ai/project-builder": { generateProjectWithBrain: forbidden },
  "@/lib/limits/rate-limit": { checkUsageLimit: async () => ({ ok: true }), recordChatUsage: async () => {} },
  "@/lib/server/malik-model-router": {
    resolveStrictMalikSelection: async (_request, body) => ({ modelId: body?.model || "malik-max", entitlement: owner }),
    runStrictMalikModel: async (input) => { modelCalls.push(input); const content = modelAnswer(input); if (content === null) throw new Error("provider down"); return { content, provider: "mock", model: "mock", selectedModelId: input.modelId, latencyMs: 1 } },
    MalikModelRouteError: RouteError, malikModelErrorPayload: (error) => ({ error: error.message }),
  },
  "@/lib/server/presentation-photos": { findPhoto: async () => null },
  "@/lib/server/malik-coder-orchestrator": { runMalikCoderOrchestrator: forbidden },
  "@/lib/server/malik-agent-runtime": { prepareMalikAgentRuntime: async () => null },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => owner },
  "@/lib/server/work-quota": { reserveWorkQuota: async () => ({ ok: true, receipt: { id: "fixture" } }), refundWorkQuota: async () => {}, WorkQuotaError: RouteError },
  "@/lib/server/malik-owner-context": { malikIdentityAnswer: () => null, withVerifiedOwnerChatContext: (body) => body },
  "@/lib/server/project-artifact-store": { putProjectArtifact: forbidden },
  "@/lib/server/multimodal-router": { estimateMultimodalTokens: () => 0, hasMalikAttachments: (items) => Array.isArray(items) && items.length > 0, routeMalikAttachments: forbidden },
  "@/lib/server/daily-multimodal-quota": { DAILY_MULTIMODAL_TOKEN_LIMIT: 10000, getDailyMultimodalQuota: () => ({ remaining: 10000 }), recordDailyMultimodalTokens: () => {} },
  "@/lib/server/daily-text-token-quota": { getDailyTextTokenQuota: () => ({ unlimited: true }) },
  "@/lib/server/scheduled-tasks": { createScheduledTask: forbidden, scheduledTasksStatus: () => ({ ready: false }) },
  "@/lib/malik-compute/runtime": { withCompute: (handler) => handler, observeComputeResult: () => {} },
})

const { gameStudioTurn, isGameCreationRequest, gameChatMessage, compactGameHistory, lastGame } = load("lib/games/chat.ts")
const { fallbackGamePlan, mergeGamePlan, pickGenre, gameLocale, parseJsonObject } = load("lib/games/plan.ts")
const { extractLogic, joinContinuation, wholeLines, LOGIC_START, LOGIC_END, GAME_API_REFERENCE } = load("lib/games/author.ts")
const { staticGameReport, checkPolicy, checkSyntax } = load("lib/games/qa.ts")
const { smokeRunGame } = load("lib/games/smoke.ts")
const { smokeProblems } = load("lib/games/smoke-harness.ts")
const { buildGame } = load("lib/games/studio.ts")
const { buildGameHtml, readGamePage } = load("lib/games/page.ts")
const { GAME_RUNTIME_JS } = load("lib/games/runtime-script.ts")
const { isChatArtifactCreationRequest, detectChatArtifactSkills } = load("lib/ai/chat-artifact-skills.ts")

// Model replies arrive with LF; a Windows checkout may hold the fixture with CRLF.
const SHOOTER = fs.readFileSync("scripts/fixtures/game-space-shooter.js", "utf8").replace(/\r\n/g, "\n")
const PLAN = fallbackGamePlan("сгенерируй мне игру про космические корабли с врагами и уровнями")
const wrap = (code) => `${LOGIC_START}\n${code}\n${LOGIC_END}`

/* ---------------------------------------------------------------- intent */

test("game requests are recognised in Russian, Kazakh and English — and look-alikes are not", () => {
  for (const prompt of [
    "сгенерируй мне игру про космос",
    "Создай полноценную HTML5-игру про космические корабли, с врагами, очками, управлением и уровнями",
    "сделай змейку",
    "хочу платформер про ниндзя",
    "напиши тетрис",
    "make a tower defense game about robots",
    "build me a snake game",
    "ғарыш туралы ойын жаса",
    "сделай игру «Стальной рой»",
  ]) assert.ok(gameStudioTurn(prompt), prompt)
  for (const prompt of [
    "как сделать игру на Unity?",
    "сделай игру на python pygame",
    "напиши игру на C# для Unity",
    "создай сайт для игрового клуба",
    "сделай лендинг для мобильной игры",
    "давай сыграем в игру в слова",
    "кто лучший игрок в шахматы",
    "объясни код игры змейка",
    "сделай игровой магазин с корзиной",
    "сделай игру на react",
    "```js\nconst game = 1\n```\nсделай игру лучше",
  ]) assert.equal(gameStudioTurn(prompt), null, prompt)
  assert.equal(gameStudioTurn("сделай игру про космос", { attachments: [{ kind: "image" }] }), null, "a request with files is the coder's")
  assert.equal(isGameCreationRequest("сделай мне игру про динозавров"), true)
})

test("a game request opens its preview by itself in the chat", () => {
  assert.equal(isChatArtifactCreationRequest("сгенерируй мне игру про космос"), true)
  assert.equal(detectChatArtifactSkills("сгенерируй мне игру про космос")[0].id, "game")
  assert.equal(detectChatArtifactSkills("сделай игру на pygame про змейку")[0].id, "game", "other stacks still get the game contract")
})

/* ------------------------------------------------------------------ plan */

test("the fallback plan follows the genre, the language and a quoted title", () => {
  assert.equal(pickGenre("гонки на машинах по ночному городу").id, "racing")
  assert.equal(pickGenre("сделай тетрис").id, "falling-blocks")
  assert.equal(pickGenre("майнкрафт в 2D").id, "sandbox")
  assert.equal(pickGenre("игра про что-то совсем новое — сбор мёда пчёлами").id, "arcade")
  const space = fallbackGamePlan("сделай игру про космос")
  assert.equal(space.theme.backdrop, "space")
  assert.equal(space.locale, "ru")
  assert.match(space.controls.map((c) => c.action).join(" "), /огонь/)
  assert.ok(space.controls.some((c) => c.keys === "P / Esc"), "pause is always listed")
  assert.equal(fallbackGamePlan("make a snake game").locale, "en")
  assert.equal(gameLocale("ғарыш туралы ойын жаса"), "kk")
  assert.equal(fallbackGamePlan("сделай игру «Стальной рой» про роботов").title, "Стальной рой")
  assert.equal(fallbackGamePlan("сделай тетрис").height, 960, "falling blocks are portrait")
})

test("a model plan is checked field by field; anything unsafe falls back", () => {
  const merged = mergeGamePlan({
    title: "<img src=x onerror=alert(1)>Метеор", genre: "аркада", input: "telepathy", lives: 99, levels: -3, orientation: "portrait",
    controls: [{ keys: "← →", action: "полёт" }, { keys: "", action: "пусто" }],
    touch: { joystick: false, buttons: [{ id: "action", label: "Огонь" }, { label: "Щит" }, { label: "Лишняя" }] },
    theme: { palette: { bg: "#000000", accent: "red; background:url(x)", fg: "#FFFFFF" }, backdrop: "volcano", font: "comic", mood: "epic" },
    mechanics: ["shoot meteors", 42, ""],
  }, PLAN)
  assert.doesNotMatch(merged.title, /[<>]/)
  assert.equal(merged.input, PLAN.input, "unknown input mode falls back")
  assert.equal(merged.lives, 9)
  assert.equal(merged.levels, 0)
  assert.deepEqual([merged.width, merged.height], [540, 960])
  assert.equal(merged.theme.palette.bg, "#000000")
  assert.equal(merged.theme.palette.fg, "#ffffff")
  assert.equal(merged.theme.palette.accent, PLAN.theme.palette.accent, "a non-hex colour is refused")
  assert.equal(merged.theme.backdrop, PLAN.theme.backdrop)
  assert.equal(merged.theme.font, PLAN.theme.font)
  assert.equal(merged.theme.mood, "epic")
  assert.deepEqual(merged.touch.buttons.map((b) => b.id), ["action", "action2"])
  assert.ok(merged.controls.some((c) => c.keys === "P / Esc"), "system keys stay listed")
  assert.deepEqual(merged.mechanics, ["shoot meteors", "42"])
  assert.equal(parseJsonObject("Вот план:\n```json\n{\"title\":\"X\"}\n```"). title, "X")
})

/* --------------------------------------------------- a cut reply, finished */

test("a reply without its end marker is known to be cut and is continued from whole lines", () => {
  const lines = SHOOTER.split("\n")
  const firstPart = lines.slice(0, 60).join("\n") + "\n  update(dt, ap"
  const cut = extractLogic(`${LOGIC_START}\n${firstPart}`)
  assert.equal(cut.complete, false)
  const kept = wholeLines(cut.code)
  assert.equal(kept, lines.slice(0, 60).join("\n") + "\n", "the partial line is dropped")
  // The continuation re-sends its last two lines and wraps itself in a fence.
  const resend = lines.slice(58, 60).join("\n")
  const reply = "```javascript\n" + resend + "\n" + lines.slice(60).join("\n") + "\n" + LOGIC_END
  const joined = joinContinuation(kept, reply)
  assert.equal(joined.complete, true)
  assert.equal(joined.code.trim(), SHOOTER.trim(), "the file is exactly whole again")
  assert.equal(checkSyntax(joined.code).status, "pass")
  // A complete reply in a fence with prose around it.
  const fenced = extractLogic(`Вот игра:\n${LOGIC_START}\n\`\`\`js\n${SHOOTER}\n\`\`\`\n${LOGIC_END}\nУдачи!`)
  assert.equal(fenced.complete, true)
  assert.equal(fenced.code.trim(), SHOOTER.trim())
})

/* ------------------------------------------------------- static checks */

test("the fixture game passes syntax, policy and contract", () => {
  const report = staticGameReport(SHOOTER)
  assert.deepEqual(report.problems, [])
  assert.equal(report.syntax.status, "pass")
})

test("the policy stops network, storage, DOM, timers, code generation and prototype climbing — by AST", () => {
  const base = "MalikGame.define({ update(dt, api) {}, draw(ctx, api) {} });\n"
  const cases = {
    "fetch(\"/api/x\")": /fetch/,
    "document.cookie": /document/,
    "window.parent.postMessage(1, '*')": /window/,
    "localStorage.setItem('a', 1)": /localStorage/,
    "setTimeout(() => {}, 10)": /setTimeout/,
    "eval('1')": /eval/,
    "new Function('return 1')": /Function/,
    "const p = this.constructor.constructor('return process')()": /constructor/,
    "const p = ({})['__proto__']": /__proto__/,
    "const img = 'https://evil.example/x.png'": /external URL/,
    "import('x')": /import/,
    "const r = Reflect.ownKeys({})": /Reflect/,
    "const g = globalThis": /globalThis/,
  }
  for (const [code, label] of Object.entries(cases)) {
    const result = checkPolicy(base + code)
    assert.equal(result.status, "fail", code)
    assert.match(result.details.join(" "), label, code)
    assert.match(result.details[0], /game\.js:2 /, "the line is named")
  }
  // Names of the same spelling that are the game's own are fine.
  assert.equal(checkPolicy(base + "const top = 10; function open(door) { return door.open; } const s = { window: 1, document: 2 }; s.window += top; // fetch() in a comment\nconst label = 'eval is a word'").status, "pass")
  assert.equal(checkPolicy(base + "class Enemy { constructor(x) { this.x = x } }").status, "pass", "a class constructor is not prototype climbing")
  assert.equal(checkPolicy(base + "const s = `\n```\n`").status, "fail", "a Markdown fence would break the chat block")
  const syntax = staticGameReport(base + "function broken( {")
  assert.equal(syntax.syntax.status, "fail")
  assert.match(syntax.problems[0], /^game\.js:2 syntax error/)
  assert.match(staticGameReport("MalikGame.define({ draw(ctx, api) {} });" + "\n//".repeat(800)).problems.join(" "), /missing update/)
})

/* --------------------------------------------------- the isolated run */

test("the fixture game runs in the isolated process: 600 frames, no crash, controls matter", async () => {
  const outcome = await smokeRunGame(PLAN, SHOOTER)
  assert.equal(outcome.ok, true, JSON.stringify(outcome).slice(0, 600))
  assert.equal(outcome.reacts, true)
  assert.ok(outcome.idle.frames >= 60, `idle frames ${outcome.idle.frames}`)
  assert.ok(outcome.active.gameOpsPerFrame >= 10, `draws ${outcome.active.gameOpsPerFrame}`)
  assert.deepEqual(smokeProblems(outcome), [])
})

test("a crash is reported with its game.js line; a freeze and dead controls are reported too", async () => {
  const crash = SHOOTER.replace("p.vx = api.approach(", "if (api.time > 0.5) S.missing.x = 1;\n    p.vx = api.approach(")
  const crashLine = crash.split("\n").findIndex((line) => line.includes("S.missing.x")) + 1
  const crashed = await smokeRunGame(PLAN, crash)
  assert.equal(crashed.ok, false)
  const problems = smokeProblems(crashed)
  assert.match(problems[0], new RegExp(`^game\\.js:${crashLine} crashes in update\\(\\)`))
  const frozen = await smokeRunGame(PLAN, SHOOTER.replace("S.cool -= dt;", "while (api.time > 0.2) {}\n    S.cool -= dt;"))
  assert.equal(frozen.ok, false)
  assert.match(smokeProblems(frozen).join(" "), /froze/)
  const deaf = "const S = { t: 0 };\nMalikGame.define({ update(dt, api) { S.t += dt; }, draw(ctx, api) { api.draw.circle(api.W / 2 + Math.sin(S.t) * 100, api.H / 2, 30, api.colors.accent); api.draw.rect(10, 10, 40, 40, api.colors.fg); api.draw.text('x', 50, 50); } });\n" + "// padding\n".repeat(150)
  const deafRun = await smokeRunGame(PLAN, deaf)
  assert.equal(deafRun.ok, true)
  assert.equal(deafRun.reacts, false)
  assert.match(smokeProblems(deafRun).join(" "), /controls change nothing/)
})

test("code that tries to leave the sandbox gets nothing — even past the static policy", async () => {
  const attempts = [
    "const p = this.constructor.constructor('return process')(); api_out = p.env;",
    "const F = (function(){}).constructor; F('return 1')();",
    "const r = (async function(){}).constructor('return 1');",
    "require('fs').readFileSync('/etc/passwd');",
    "process.exit(0);",
  ]
  for (const attempt of attempts) {
    const code = `${attempt}\nMalikGame.define({ update(dt, api) {}, draw(ctx, api) { api.draw.rect(0, 0, 10, 10); } });`
    const outcome = await smokeRunGame(PLAN, code)
    assert.equal(outcome.ok, false, attempt)
    assert.equal(outcome.stage, "load", attempt)
    assert.match(outcome.error, /Code generation from strings disallowed|is not defined|Cannot read|not a function/i, `${attempt} → ${outcome.error}`)
  }
})

/* --------------------------------------------- the whole studio, end to end */

function fakeModel(script) {
  const calls = []
  return { calls, model: async (input) => { calls.push(input); return script(input, calls.length) } }
}

test("plan → a reply cut by the length limit → continuation → checks → run → a playable page", async () => {
  const lines = SHOOTER.split("\n")
  const stages = []
  const { model, calls } = fakeModel((input, n) => {
    if (n === 1) return JSON.stringify({ title: "Звёздный рой", genre: "космический шутер", levels: 3, lives: 3, theme: { backdrop: "space", palette: { accent: "#38e8ff" } }, mechanics: ["waves", "boss"] })
    if (n === 2) return `${LOGIC_START}\n${lines.slice(0, 70).join("\n")}\n    const half = ` // cut mid-line
    return `${lines.slice(68).join("\n")}\n${LOGIC_END}`
  })
  const result = await buildGame({ prompt: "сгенерируй игру про космические корабли с врагами и уровнями", model, smoke: (plan, logic) => smokeRunGame(plan, logic), onStage: (stage) => stages.push(stage) })
  assert.equal(result.ok, true, JSON.stringify(result.qa))
  assert.equal(result.plan.title, "Звёздный рой")
  assert.equal(result.calls.continuations, 1)
  assert.equal(result.logic.trim(), SHOOTER.trim())
  assert.equal(result.qa.run.status, "pass")
  assert.equal(result.qa.run.reactsToInput, true)
  assert.deepEqual([...new Set(stages)], ["plan", "code", "continue", "check", "run", "polish", "page"])
  assert.equal(result.calls.polish, 1, "a small fixture game is held to the recipe once")
  assert.equal(result.plan.theme.style && typeof result.plan.theme.fx, "object", "the art style and its post-processing are on the plan")
  assert.match(calls[2].prompt, /THE FILE ENDS WITH/)
  assert.ok(calls.every((call) => call.taskPrompt && /game/.test(call.taskPrompt)), "the engine runs these as code tasks")
  // The page carries everything and reads back.
  assert.match(result.html, /^<!doctype html>/)
  assert.match(result.html, /<script id="malik-game-runtime">/)
  const back = readGamePage(result.html)
  assert.equal(back.plan.title, "Звёздный рой")
  assert.equal(back.logic.trim(), SHOOTER.trim())
})

test("a game that runs but is flat gets one polish pass, kept only when it still runs and is richer", async () => {
  const richer = SHOOTER + "\nfunction finish(api) { api.hitstop(0.05); api.punch(0.05); api.slowmo(0.4, 0.5); api.trail('shot', 0, 0); api.combo(); api.tween(S, { cool: 0 }, 0.2); api.boss('Матка роя', 1); return { type: 'shield' } }\n"
  const { model, calls } = fakeModel((input, n) => n === 1 ? "{}" : n === 2 ? wrap(SHOOTER) : wrap(richer))
  const stages = []
  const result = await buildGame({ prompt: "сделай космическую игру", model, smoke: (plan, logic) => smokeRunGame(plan, logic), onStage: (stage) => stages.push(stage) })
  assert.equal(result.ok, true)
  assert.equal(result.calls.polish, 1)
  assert.ok(stages.includes("polish"))
  assert.match(calls[2].prompt, /review against the recipe found it flat/)
  assert.match(calls[2].prompt, /GAME RECIPE/)
  assert.match(result.logic, /api\.boss\('Матка роя', 1\)/, "the richer version is delivered")

  const worse = "MalikGame.define({ update(dt, api) {}, draw(ctx, api) { api.draw.rect(0, 0, 10, 10) } })"
  const second = fakeModel((input, n) => n === 1 ? "{}" : n === 2 ? wrap(SHOOTER) : wrap(worse))
  const kept = await buildGame({ prompt: "сделай космическую игру", model: second.model, smoke: (plan, logic) => smokeRunGame(plan, logic) })
  assert.equal(kept.logic.trim(), SHOOTER.trim(), "a polish that is not better never replaces a working game")
  const edit = fakeModel((input, n) => wrap(SHOOTER))
  const edited = await buildGame({ prompt: "сделай быстрее", model: edit.model, smoke: (plan, logic) => smokeRunGame(plan, logic), base: { plan: result.plan, logic: SHOOTER } })
  assert.equal(edited.calls.polish, 0, "a change the person asked for is not rewritten by a polish pass")
  const late = fakeModel((input, n) => n === 1 ? "{}" : wrap(SHOOTER))
  const rushed = await buildGame({ prompt: "сделай космическую игру", model: late.model, smoke: (plan, logic) => smokeRunGame(plan, logic), polishUntil: Date.now() - 1 })
  assert.equal(rushed.calls.polish, 0, "no polish once the chat's time is spent")
})

test("a crash found in the run goes back to the model with its line; the fixed file is delivered", async () => {
  const broken = SHOOTER.replace("S.cool -= dt;", "S.cool -= dt; if (api.time > 1) S.nothing.go();")
  const { model, calls } = fakeModel((input, n) => n === 1 ? "{}" : n === 2 ? wrap(broken) : wrap(SHOOTER))
  const result = await buildGame({ prompt: "сделай игру про космос", model, smoke: (plan, logic) => smokeRunGame(plan, logic) })
  assert.equal(result.calls.repairs, 1)
  assert.equal(result.ok, true)
  assert.match(calls[2].prompt, /crashes in update\(\)/)
  assert.match(calls[2].prompt, /game\.js:\d+/)
  assert.equal(result.logic.trim(), SHOOTER.trim())
})

test("repairs are bounded: a model that cannot fix it is not looped, and the result says so", async () => {
  const broken = "MalikGame.define({ update(dt, api) { }, draw(ctx, api) { api.draw.rect(0,0,1,1) } }"
  const { model, calls } = fakeModel((input, n) => n === 1 ? "not json" : wrap(broken + "\n//".repeat(700)))
  const result = await buildGame({ prompt: "сделай игру про космос", model, smoke: (plan, logic) => smokeRunGame(plan, logic) })
  assert.equal(result.ok, false)
  assert.ok(result.calls.repairs <= 2)
  assert.ok(calls.length <= 1 + 1 + 2, `${calls.length} calls`)
  assert.equal(result.qa.syntax.status, "fail")
  assert.equal(result.calls.plan, false, "the genre plan stood in")
  const text = gameChatMessage(result, "new")
  assert.match(text, /Код не прошёл проверку/)
  assert.match(text, /исправь игру/)
})

test("no model answer means no game — never an empty page passed off as one", async () => {
  await assert.rejects(buildGame({ prompt: "сделай игру", model: async () => null }), (error) => error.code === "MODEL_UNAVAILABLE")
})

/* ------------------------------------------------------- page and chat */

test("the page keeps the logic inside its script and the plan inert", () => {
  const evil = SHOOTER + "\n// </script><script>alert(1)</script>\n"
  const html = buildGameHtml({ ...PLAN, title: "A & B" }, evil)
  assert.equal(html.match(/<\/script>/g).length, 4, "only the four real script ends")
  assert.match(html, /<title>A &amp; B<\/title>/)
  assert.equal(readGamePage(html).logic.trim(), evil.trim())
  assert.ok(!GAME_RUNTIME_JS.includes("`"), "the runtime has no backticks")
  // Every name the model is told about exists in the runtime.
  for (const name of ["addScore", "loseLife", "addLife", "nextLevel", "gameOver", "setStatus", "axis", "pressed", "rawKey", "particles", "shake", "flash", "floatText", "project", "screen"]) {
    assert.ok(GAME_API_REFERENCE.includes(`api.${name}`), name)
    assert.ok(GAME_RUNTIME_JS.includes(`api.${name} = function`), name)
  }
  for (const name of ["rect", "roundRect", "circle", "ring", "line", "poly", "text", "glow", "noGlow", "gradient", "radial", "pixels", "star", "bar"]) {
    assert.ok(GAME_API_REFERENCE.includes(`.${name}(`), name)
    assert.ok(GAME_RUNTIME_JS.includes(`${name}: function`), name)
  }
})

test("runtime v2: hit-stop, slow motion, tweens, combos, light and post-processing work on the core", () => {
  const sandbox = {}
  new Function(GAME_RUNTIME_JS).call(sandbox)
  const M = sandbox.MalikGame
  const fakeCtx = () => new Proxy({ canvas: { width: 1920, height: 1080 } }, {
    get(target, key) {
      if (key in target) return target[key]
      if (key === "createRadialGradient" || key === "createLinearGradient") return () => ({ addColorStop() {} })
      if (key === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
      if (key === "measureText") return () => ({ width: 10 })
      return typeof key === "string" ? (target[key] = () => {}) : undefined
    },
    set(target, key, value) { target[key] = value; return true },
  })
  const seen = { updates: 0, dt: 0 }
  const obj = { x: 0 }
  const game = {
    start(api) { api.ambient("snow", 1); api.boss("Босс", 1); api.tween(obj, { x: 100 }, 0.5, { ease: "outBack" }) },
    update(dt, api) { seen.updates += 1; seen.dt = dt; api.trail("hero", api.time * 10, 0) },
    draw(ctx, api) { api.light(10, 10, 60, "#ff3355", 1) },
  }
  const fx = { darkness: 0.7, bloom: 0.5, vignette: 0.4, scanlines: 0.3, grain: 0.1 }
  for (const makeCanvas of [undefined, (w, h) => ({ width: w, height: h, getContext: () => fakeCtx() })]) {
    seen.updates = 0
    obj.x = 0
    const core = M.createCore({ plan: { levels: 3, theme: { fx } }, game, makeCanvas })
    const api = core.api
    core.setup(); core.play()
    assert.deepEqual({ ...api.fx }, fx, "the art style's preset is applied")
    const ctx = fakeCtx()
    for (let i = 0; i < 40; i++) { core.step(1 / 60); core.render(ctx) }
    assert.ok(Math.abs(obj.x - 100) < 0.001, `tween reached its target (${obj.x})`)
    const before = seen.updates
    api.hitstop(0.1)
    for (let i = 0; i < 3; i++) core.step(1 / 60)
    assert.equal(seen.updates, before, "a hit-stop freezes the game's update")
    for (let i = 0; i < 6; i++) core.step(1 / 60)
    assert.ok(seen.updates > before, "and the game resumes after it")
    api.slowmo(0.5, 0.3)
    core.step(1 / 60)
    assert.ok(Math.abs(seen.dt - 1 / 120) < 1e-9, "slow motion scales the game's dt")
    let multiplier = 1
    for (let i = 0; i < 5; i++) multiplier = api.combo()
    assert.equal(multiplier, 2, "five hits in a row double the score")
    for (let i = 0; i < 200; i++) core.step(1 / 60)
    assert.equal(api.combo(), 1, "the combo runs out when the hits stop")
    api.punch(0.08); api.boss(null)
    assert.doesNotThrow(() => { for (let i = 0; i < 5; i++) { core.step(1 / 60); core.render(ctx) } })
    assert.equal(core.error, null)
  }
  for (const name of ["hitstop", "slowmo", "punch", "tween", "trail", "light", "ambient", "boss", "combo", "comboReset", "anim", "follow"]) {
    assert.ok(GAME_API_REFERENCE.includes(`api.${name}(`), `the model is told about api.${name}`)
    assert.ok(GAME_RUNTIME_JS.includes(`api.${name} = function`), `api.${name} exists`)
  }
})

test("every game gets its own art style; the recipe holds it to depth and feel", () => {
  const { gameStyleFor, gameRecipeText, auditGameLogic, gameNeedsPolish } = load("lib/games/recipe.ts")
  assert.equal(gameStyleFor("Создай хоррор игру в подземелье").style, "dark")
  assert.equal(gameStyleFor("Сделай пиксельный платформер").style, "pixel")
  assert.match(gameStyleFor("Создай космический шутер").style, /neon|synthwave|pixel/)
  assert.match(gameStyleFor("Игра про котиков на ферме").style, /toon|painterly/)
  assert.equal(gameStyleFor("Создай хоррор игру").fx.darkness > 0, true)
  const styles = new Set(["игра про пиратов", "гонки по городу", "игра про рыцаря и дракона", "игра змейка", "игра для детей про животных", "танковый бой", "игра про ниндзя", "морской бой"].map((p) => gameStyleFor("Создай " + p).style))
  assert.ok(styles.size >= 3, [...styles].join(","))
  const plan = { ...PLAN, levels: 6, theme: { ...PLAN.theme, style: "dark", fx: gameStyleFor("хоррор").fx, ambient: "embers" } }
  const recipe = gameRecipeText("хоррор", plan)
  for (const piece of [/ART STYLE — Dark atmosphere/, /api\.light\(x, y, radius, color\)/, /api\.ambient\("embers", 1\)/, /at least 4 enemy or obstacle types/, /final boss/, /api\.hitstop/, /600–900 lines/]) assert.match(recipe, piece)
  const flat = auditGameLogic(SHOOTER, plan).map((issue) => issue.code)
  for (const code of ["NO_BOSS", "NO_LIGHTS"]) assert.ok(flat.includes(code), code)
  assert.equal(gameNeedsPolish(auditGameLogic(SHOOTER, plan)), true)
})

test("the chat answer says how to play and what was really checked; history keeps one line", async () => {
  const { model } = fakeModel((input, n) => n === 1 ? "{}" : wrap(SHOOTER))
  const result = await buildGame({ prompt: "сделай игру про космос", model, smoke: (plan, logic) => smokeRunGame(plan, logic) })
  const text = gameChatMessage(result, "new")
  assert.match(text, /^\*\*Игра «Звёздный патруль» готова\*\* — космический шутер, 5 уровней\./)
  assert.match(text, /```html filename=index\.html\n<!doctype html>/)
  assert.match(text, /изолированной песочнице — \d+ кадров без сбоев/)
  assert.match(text, /управление действительно меняет ход игры/)
  assert.match(text, /Графику, звук/)
  const history = [{ role: "user", content: "сделай игру про космос" }, { role: "assistant", content: text }]
  const compact = compactGameHistory(history)
  assert.ok(compact[1].content.length < 800, `${compact[1].content.length}`)
  assert.match(compact[1].content, /Malik Game Studio: игра «Звёздный патруль»/)
  assert.equal(lastGame(history).plan.title, "Звёздный патруль")
  // A change to it is an edit, a new game is new.
  const edit = gameStudioTurn("добавь босса и сделай врагов быстрее", { messages: history })
  assert.equal(edit.kind, "edit")
  assert.equal(edit.logic.trim(), SHOOTER.trim())
  assert.equal(gameStudioTurn("сделай новую игру — змейку", { messages: history }).kind, "new")
  assert.equal(gameStudioTurn("а можно добавить мультиплеер?", { messages: history }), null, "wondering aloud is not an edit")
})

/* ---------------------------------------------------- the real chat route */

const { POST } = load("app/api/stream/route-impl.ts")

async function stream(body) {
  const response = await POST(new Request("http://fixture/api/stream", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ stream: true, workspaceMode: "chat", ...body }) }))
  assert.equal(response.status, 200)
  const events = (await response.text()).split("\n\n").filter((frame) => frame.includes("data: ")).map((frame) => JSON.parse(frame.split("\ndata: ")[1]))
  for (const deferred of after.splice(0)) await deferred()
  const done = events.filter((event) => event.type === "done")
  return { events, done, answer: (done[0]?.finalContent ?? events.filter((event) => event.type === "content").map((event) => event.content).join("")).replace(/\r(?!\n)/g, "\n") }
}

test("chat: «сгенерируй мне игру» answers with a checked, playable game; a change edits it", async () => {
  modelCalls.length = 0
  modelAnswer = (input) => /lead game designer/.test(input.systemPrompt) ? JSON.stringify({ title: "Космо-рой", levels: 3 }) : wrap(SHOOTER)
  const { answer, done, events } = await stream({ originalQuestion: "сгенерируй мне игру про космические корабли" })
  assert.equal(done.length, 1)
  assert.equal(done[0].provider, "malik-game-studio")
  assert.equal(modelCalls[0].modelId, "malik-max")
  assert.match(answer, /\*\*Игра «Космо-рой» готова\*\*/)
  assert.match(answer, /```html filename=index\.html\n<!doctype html>/)
  assert.ok(events.some((event) => event.type === "progress" && /песочнице/.test(event.text || "")), "progress is reported")
  assert.doesNotMatch(answer, /Ответ не завершён/)
  // The next turn changes that game through its code.
  modelCalls.length = 0
  modelAnswer = () => wrap(SHOOTER.replace("speed: 60 + api.level * 18", "speed: 90 + api.level * 24"))
  const edited = await stream({ originalQuestion: "сделай врагов быстрее", messages: [{ role: "user", content: "сгенерируй мне игру про космические корабли" }, { role: "assistant", content: answer }, { role: "user", content: "сделай врагов быстрее" }] })
  assert.equal(edited.done[0].provider, "malik-game-studio")
  assert.match(edited.answer, /\*\*Игра «Космо-рой» обновлена\.\*\*/)
  assert.match(modelCalls[0].prompt, /CURRENT game\.js/)
  assert.match(edited.answer, /speed: 90 \+ api\.level \* 24/)
  // An unrelated question afterwards does not carry the game into the model's context.
  chatModelCalls.length = 0
  await stream({ originalQuestion: "Кто такой Абай?", messages: [{ role: "user", content: "сгенерируй игру" }, { role: "assistant", content: answer }, { role: "user", content: "Кто такой Абай?" }] })
  const sent = JSON.stringify(chatModelCalls[0].messages)
  assert.ok(sent.length < 3000, `${sent.length} chars of history`)
  assert.doesNotMatch(sent, /MalikGame\.define/)
})

test("chat: when the models are down the answer says so and shows no fake game", async () => {
  modelAnswer = () => null
  const { answer, done } = await stream({ originalQuestion: "сделай игру про динозавров" })
  assert.equal(done[0].provider, "malik-game-studio")
  assert.match(answer, /Не удалось создать игру/)
  assert.doesNotMatch(answer, /<!doctype html>/)
})
