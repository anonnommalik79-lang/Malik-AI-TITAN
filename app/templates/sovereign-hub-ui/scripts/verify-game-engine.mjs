// Malik Game Studio as a game development system: any request reaches the
// right engine and skills, and three different games — a 3D battle royale, a
// 3D endless runner and a 2D platformer — go through the real pipeline
// (plan → write → static checks → isolated run → page) and really play.
import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { workTestLoader } from "./work-test-loader.mjs"
import { BATTLE_ROYALE, PLATFORMER_2D, PROMPT_A, PROMPT_B, PROMPT_C, RUNNER_3D } from "./game-acceptance-fixtures.mjs"

const require = createRequire(import.meta.url)
const THREE = require("three")
const load = workTestLoader()
const { gameProfile } = load("lib/games/engine.ts")
const { GAME_SKILLS, skillsFor, skillGuides } = load("lib/games/skills.ts")
const { isGameCreationRequest } = load("lib/games/chat.ts")
const { buildGame } = load("lib/games/studio.ts")
const { smokeRunGame } = load("lib/games/smoke.ts")
const { LOGIC_START, LOGIC_END } = load("lib/games/author.ts")
const { GAME_RUNTIME_3D_JS, THREE_CDN } = load("lib/games/runtime-3d.ts")
const { GAME_RUNTIME_JS } = load("lib/games/runtime-script.ts")
const { GAME_API_3D_REFERENCE, game3dAuthorPrompt, audit3dLogic } = load("lib/games/author-3d.ts")
const { readGamePage } = load("lib/games/page.ts")
const { staticGameReport } = load("lib/games/qa.ts")
const { fallbackGamePlan } = load("lib/games/plan.ts")

const wrap = (code) => `${LOGIC_START}\n${code}\n${LOGIC_END}`

test("every kind of request reaches the studio with the right engine, camera and systems", () => {
  const cases = [
    ["Создай 3D Battle Royale как PUBG", "3d", "battle-royale"],
    ["Создай игру с открытым миром как GTA", "3d", "open-world"],
    ["Создай бесконечный раннер как Subway Surfers", "3d", "runner"],
    ["Создай игру с блоками и строительством как Minecraft", "3d", "voxel"],
    ["Создай футбольную игру", "3d", "football"],
    ["Создай хоррор с преследующим монстром", "3d", "horror"],
    ["Создай гоночный симулятор", "3d", "racing"],
    ["Создай игру от первого лица про спецназ", "3d", "shooter"],
    ["Создай 2D платформер", "2d", null],
    ["Создай космический шутер", "2d", null],
    ["Сделай пиксельный хоррор", "2d", null],
    ["Создай игру змейка", "2d", null],
  ]
  for (const [prompt, engine, genre] of cases) {
    assert.equal(isGameCreationRequest(prompt), true, prompt)
    const profile = gameProfile(prompt)
    assert.equal(profile.engine, engine, prompt)
    if (genre) assert.equal(profile.genre, genre, prompt)
  }
  assert.equal(isGameCreationRequest("Напиши сценарий хоррора"), false, "a story is not a game")
  assert.equal(gameProfile("Создай 3D Minecraft на three.js").engine, "3d")
  assert.equal(gameProfile("Создай Battle Royale от первого лица").camera, "first")
})

test("the fourteen skills are real and each game gets the ones its design needs", () => {
  assert.equal(GAME_SKILLS.length, 14)
  const ids = (plan) => skillsFor(plan).map((skill) => skill.id)
  const royale = fallbackGamePlan(PROMPT_A)
  assert.equal(royale.engine, "3d")
  for (const id of ["game-architect", "game-3d", "controller", "combat", "npc", "world", "animation", "game-ui", "game-audio", "performance", "game-qa", "game-repair"]) assert.ok(ids(royale).includes(id), `battle royale needs ${id}`)
  assert.ok(!ids(royale).includes("game-2d"))
  const runner = fallbackGamePlan(PROMPT_B)
  assert.ok(ids(runner).includes("physics") && !ids(runner).includes("combat"), "no weapons in a runner")
  const platformer = fallbackGamePlan(PROMPT_C)
  assert.equal(platformer.engine, "2d")
  assert.ok(ids(platformer).includes("game-2d") && !ids(platformer).includes("game-3d"))
  const prompt = game3dAuthorPrompt(PROMPT_A, royale)
  for (const title of ["Combat Systems", "NPC Intelligence", "Character Controller", "World Builder", "Game QA Engineer"]) assert.ok(prompt.includes(title), title)
  assert.match(skillGuides(royale, "repair"), /Game Repair Agent/)
})

test("every 3D API name the model reads exists in the runtime", () => {
  assert.doesNotThrow(() => new Function(GAME_RUNTIME_3D_JS))
  assert.ok(!GAME_RUNTIME_3D_JS.includes("`"), "no backticks in the runtime")
  const names = new Set([...GAME_API_3D_REFERENCE.matchAll(/api\.([a-zA-Z]+)\(/g)].map((m) => m[1]))
  assert.ok(names.size > 40, `${names.size} API calls documented`)
  for (const name of names) assert.ok(GAME_RUNTIME_3D_JS.includes(`api.${name} = function`), `api.${name}`)
  assert.match(THREE_CDN, /^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/build\/three\.min\.js$/)
  assert.equal(THREE.REVISION, "160", "the server's three.js is the page's version")
})

async function pipeline(prompt, fixture) {
  const stages = []
  let calls = 0
  const result = await buildGame({
    prompt, onStage: (stage) => stages.push(stage),
    model: async () => { calls += 1; return calls === 1 ? "{}" : wrap(fixture) },
    smoke: (plan, logic) => smokeRunGame(plan, logic, { budgetMs: 6000 }),
  })
  return { result, stages }
}

for (const [label, prompt, fixture, engine] of [
  ["A — 3D battle royale", PROMPT_A, BATTLE_ROYALE, "3d"],
  ["B — 3D endless runner", PROMPT_B, RUNNER_3D, "3d"],
  ["C — 2D platformer", PROMPT_C, PLATFORMER_2D, "2d"],
]) {
  test(`acceptance ${label}: plan → write → checks → isolated run → playable page`, async () => {
    const { result, stages } = await pipeline(prompt, fixture)
    assert.equal(result.plan.engine, engine)
    assert.equal(result.qa.syntax.status, "pass", JSON.stringify(result.qa.syntax))
    assert.equal(result.qa.policy.status, "pass", JSON.stringify(result.qa.policy))
    assert.equal(result.qa.contract.status, "pass", JSON.stringify(result.qa.contract))
    assert.equal(result.qa.run.status, "pass", JSON.stringify(result.qa.run))
    assert.equal(result.qa.run.reactsToInput, true, "the controls change the game")
    assert.ok(result.qa.run.frames >= 60, `ran ${result.qa.run.frames} frames`)
    assert.equal(result.ok, true)
    assert.ok(stages.includes("run"), stages.join(","))
    assert.equal(readGamePage(result.html).logic.trim(), fixture.trim(), "the page reads back for the next change")
    if (engine === "3d") {
      assert.ok(result.html.includes(`<script src="${THREE_CDN}"`), "the page loads three.js")
      assert.match(result.html, /<div id="view"><\/div>/)
      assert.match(result.html, /malik-game-runtime-3d\/1/)
    } else assert.match(result.html, /<canvas id="game"/)
  })
}

function core3d(fixture, plan) {
  const sandbox = { THREE, MalikGame: { plan } }
  new Function(GAME_RUNTIME_3D_JS).call(sandbox)
  new Function("MalikGame", "THREE", fixture)(sandbox.MalikGame, THREE)
  const core = sandbox.MalikGame.createCore3D({ THREE, plan, game: sandbox.MalikGame.definition })
  core.setup(); core.play()
  return core
}

test("A plays as a battle royale: bots hunt and fight, the hero shoots, the zone closes, the last one standing wins", () => {
  const plan = fallbackGamePlan(PROMPT_A)
  const core = core3d(BATTLE_ROYALE, plan)
  const api = core.api
  assert.equal(api.bots().length, 12)
  assert.equal(api.alive(), 13)
  const startRadius = api.zoneInfo().radius
  for (let i = 0; i < 2400 && api.state === "playing"; i++) {
    core.input.key("action", i % 30 < 12)
    core.input.look(i % 200 < 100 ? 4 : -4, 0)
    core.input.key("up", i % 240 < 120)
    core.step(1 / 20)
  }
  const s = core.stats()
  assert.ok(s.shots > 20, `the hero fired ${s.shots} shots`)
  assert.ok(api.zoneInfo().radius < startRadius, "the zone shrank")
  assert.ok(api.alive() < 13 || api.state !== "playing", `fighters left: ${api.alive()} — bots fight and the zone hurts`)
  assert.equal(core.error, null)
  if (api.state === "playing" && !api.me.target.dead) {
    for (const bot of api.bots()) api.damage(bot.target, 9999, { owner: api.me.target })
    core.step(1 / 60)
    assert.equal(api.state, "won", "the last one standing wins")
    assert.ok(api.score >= 100, "kills score points")
  }
})

test("B plays as an endless runner: three lanes, jumps, coins, rising speed, a crash ends the run", () => {
  const plan = fallbackGamePlan(PROMPT_B)
  const core = core3d(RUNNER_3D, plan)
  const api = core.api
  const xs = new Set()
  let jumped = 0
  // All before the first obstacle row (about two seconds ahead).
  for (let i = 0; i < 120; i++) {
    core.input.key("left", i === 5); core.input.key("right", i === 35 || i === 65)
    core.input.key("up", i === 95)
    core.step(1 / 60)
    const hero = api.scene.children.find((o) => o.userData && o.userData.limbs)
    if (hero) { xs.add(Math.round(hero.position.x)); jumped = Math.max(jumped, hero.position.y) }
    if (api.state !== "playing") break
  }
  assert.ok(xs.has(-3) && xs.has(3), `the hero changed lanes: ${[...xs]}`)
  assert.ok(jumped > 1, `the hero jumped ${jumped.toFixed(2)} m`)
  assert.ok(api.score > 20, `distance scores: ${api.score}`)
  for (let i = 0; i < 6000 && api.state === "playing"; i++) core.step(1 / 30)
  assert.equal(api.state, "over", "standing still in one lane, an obstacle ends the run")
  assert.equal(core.error, null)
})

test("C plays as a platformer: run, jump onto platforms, collect coins, stomp enemies", () => {
  const plan = fallbackGamePlan(PROMPT_C)
  const sandbox = { MalikGame: { plan } }
  new Function(GAME_RUNTIME_JS).call(sandbox)
  new Function("MalikGame", PLATFORMER_2D)(sandbox.MalikGame)
  const core = sandbox.MalikGame.createCore({ plan, game: sandbox.MalikGame.definition })
  const ctx = new Proxy({ canvas: { width: 960, height: 540 } }, {
    get(target, key) {
      if (key in target) return target[key]
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} })
      if (key === "measureText") return () => ({ width: 10 })
      return typeof key === "string" ? (target[key] = () => {}) : undefined
    },
    set(target, key, value) { target[key] = value; return true },
  })
  core.setup(); core.play()
  for (let i = 0; i < 900 && core.api.state === "playing"; i++) {
    core.input.key("right", true)
    core.input.key("up", i % 40 < 2)
    core.step(1 / 60); core.render(ctx)
  }
  assert.equal(core.error, null)
  assert.ok(core.api.camera.x > 300, `the level scrolls with the hero: camera x ${core.api.camera.x}`)
  assert.ok(core.api.score > 0, `coins and stomps score: ${core.api.score}`)
})

test("a thin 3D game is sent back for depth; static checks know a 3D game has no draw()", () => {
  const plan = fallbackGamePlan(PROMPT_A)
  const thin = "MalikGame.define({ start(api) { api.ground(50); }, update(dt, api) {} });\n" + "// padding\n".repeat(200)
  const codes = audit3dLogic(thin, plan).map((issue) => issue.code)
  for (const code of ["THIN_WORLD", "NO_COMBAT", "NO_BOTS", "NO_ZONE", "NO_HERO", "NO_GOAL"]) assert.ok(codes.includes(code), code)
  assert.deepEqual(audit3dLogic(BATTLE_ROYALE, plan).map((issue) => issue.code).filter((code) => code !== "SHORT" && code !== "FLAT_FEEL"), [])
  assert.equal(staticGameReport(BATTLE_ROYALE, "3d").contract.status, "pass")
  assert.equal(staticGameReport(BATTLE_ROYALE, "2d").contract.status, "fail", "a 2D game must draw")
})
