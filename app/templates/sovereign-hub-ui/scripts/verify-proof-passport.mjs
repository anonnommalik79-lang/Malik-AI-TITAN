// Malik Proof Passport: the status comes only from checks that ran; a stored
// «PASS» is recomputed; a game's passport is built from its real isolated run.
//
//   npm run test:proof-passport
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { workTestLoader } from "./work-test-loader.mjs"

const load = workTestLoader({})
const { buildPassport, passportStatus, readPassport, passportMarkdown } = load("lib/proof/passport.ts")
const { buildGame } = load("lib/games/studio.ts")
const { smokeRunGame } = load("lib/games/smoke.ts")
const { readGamePage } = load("lib/games/page.ts")
const { gameChatMessage, lastGame } = load("lib/games/chat.ts")
const { LOGIC_START, LOGIC_END } = load("lib/games/author.ts")

const SHOOTER = fs.readFileSync("scripts/fixtures/game-space-shooter.js", "utf8").replace(/\r\n/g, "\n")
const check = (id, status, required = true, kind = "unit") => ({ id, kind, label: id, status, required, details: [] })

test("the status is derived from the checks that ran", () => {
  assert.equal(passportStatus([]), "NOT_TESTED")
  assert.equal(passportStatus([check("a", "not_run"), check("b", "not_run", false)]), "NOT_TESTED")
  assert.equal(passportStatus([check("a", "pass"), check("b", "pass")]), "PASS")
  assert.equal(passportStatus([check("a", "pass"), check("b", "fail")]), "FAIL")
  assert.equal(passportStatus([check("a", "pass"), check("b", "not_run")]), "PARTIAL", "something required did not run")
  assert.equal(passportStatus([check("a", "pass"), check("b", "fail", false)]), "PARTIAL", "an optional check failed")
  assert.equal(passportStatus([check("a", "pass", false)]), "PARTIAL", "only optional checks ran: nothing required was proven")
  assert.equal(passportStatus([check("a", "pass"), check("b", "not_run", false)]), "PASS", "an optional check that did not run is listed, not counted")
})

test("a passport lists what nobody verified and never dates a test that did not run", () => {
  const none = buildPassport({ projectId: "p", kind: "project", title: "T", checks: [check("build", "not_run")], blindSpots: ["visual design"] })
  assert.equal(none.status, "NOT_TESTED")
  assert.equal(none.testedAt, null)
  assert.deepEqual(none.commands, [])
  assert.deepEqual(none.untested, ["build", "visual design"])
  const ran = buildPassport({ projectId: "p", kind: "project", title: "T", checks: [{ ...check("unit", "pass"), command: "node --test" }, check("browser", "not_run")], now: new Date("2026-10-24T10:00:00Z") })
  assert.equal(ran.status, "PARTIAL")
  assert.equal(ran.testedAt, "2026-10-24T10:00:00.000Z")
  assert.deepEqual(ran.commands, ["node --test"])
  assert.equal(ran.checks[1].ranAt, undefined, "a check that did not run has no run time")
})

test("a stored passport cannot claim PASS its checks do not support", () => {
  const passport = buildPassport({ projectId: "p", kind: "project", title: "T", checks: [check("unit", "fail")] })
  const tampered = JSON.stringify({ ...passport, status: "PASS" })
  assert.equal(readPassport(tampered).status, "FAIL")
  assert.equal(readPassport("{not json"), null)
  assert.equal(readPassport({ version: "other", checks: [] }), null)
})

test("the chat section says the status, the checks and what was not verified", () => {
  const passport = buildPassport({ projectId: "game-x-1", kind: "game", title: "X", checks: [{ ...check("Синтаксис", "pass"), kind: "static" }, { ...check("Браузер", "not_run"), kind: "browser" }], now: new Date("2026-10-24T10:00:00Z") })
  const text = passportMarkdown(passport, "ru")
  assert.match(text, /^\*\*Паспорт проверок\*\* · `PARTIAL`/)
  assert.match(text, /Проверки запускались: 2026-10-24 10:00 UTC/)
  assert.match(text, /\| Синтаксис \| статическая \| ✅ пройдена/)
  assert.match(text, /\| Браузер \| браузер \| ⏸ не запускалась/)
  assert.match(text, /\*\*Не проверено:\*\* Браузер\./)
  assert.match(passportMarkdown(buildPassport({ projectId: "p", kind: "site", title: "S", checks: [] }), "en"), /`NOT_TESTED`/)
})

const wrap = (code) => `${LOGIC_START}\n${code}\n${LOGIC_END}`
const fakeModel = (reply) => async (input) => (/lead game designer/.test(input.system) ? "{}" : reply)

test("a game's passport comes from its real isolated run and travels inside the page", async () => {
  const result = await buildGame({ prompt: "сделай игру про космос", model: fakeModel(wrap(SHOOTER)), smoke: (plan, logic) => smokeRunGame(plan, logic) })
  const p = result.passport
  assert.equal(p.kind, "game")
  assert.match(p.projectId, /^game-/)
  assert.equal(p.projectVersion, 1)
  const byId = Object.fromEntries(p.checks.map((c) => [c.id, c]))
  for (const id of ["syntax", "policy", "contract", "run-idle-active", "controls"]) assert.equal(byId[id].status, "pass", id)
  assert.equal(byId.browser.status, "not_run")
  assert.equal(p.status, "PARTIAL", "the server cannot run a real browser, so the game is not PASS")
  assert.ok(p.commands.some((command) => /--permission/.test(command)), "the real command is recorded")
  assert.ok(byId["run-idle-active"].durationMs > 0)
  const back = readGamePage(result.html)
  assert.equal(back.passport.projectId, p.projectId)
  assert.equal(back.passport.status, "PARTIAL")
  const text = gameChatMessage(result, "new")
  assert.match(text, /\*\*Паспорт проверок\*\* · `PARTIAL`/)
  assert.match(text, /Запуск в настоящем браузере/)
  // A change to it is version 2.
  const history = [{ role: "user", content: "сделай игру" }, { role: "assistant", content: text }]
  assert.equal(lastGame(history).version, 1)
  const edited = await buildGame({ prompt: "сделай врагов быстрее", model: fakeModel(wrap(SHOOTER)), smoke: (plan, logic) => smokeRunGame(plan, logic), base: { ...lastGame(history) } })
  assert.equal(edited.passport.projectVersion, 2)
})

test("a game that crashes gets FAIL, with the crash as a known issue", async () => {
  const broken = SHOOTER.replace("S.cool -= dt;", "S.cool -= dt; if (api.time > 0.5) S.nothing.go();")
  const result = await buildGame({ prompt: "сделай игру про космос", model: fakeModel(wrap(broken)), smoke: (plan, logic) => smokeRunGame(plan, logic) })
  assert.equal(result.passport.status, "FAIL")
  assert.ok(result.passport.knownIssues.some((line) => /crashes in update/.test(line)))
  assert.match(gameChatMessage(result, "new"), /`FAIL`/)
})

test("a game whose run did not happen is never PASS", async () => {
  const result = await buildGame({ prompt: "сделай игру про космос", model: fakeModel(wrap(SHOOTER)), smoke: async () => ({ ok: false, notRun: true, stage: "disabled" }) })
  assert.notEqual(result.passport.status, "PASS")
  assert.equal(result.passport.checks.find((c) => c.id === "run-idle-active").status, "not_run")
})
