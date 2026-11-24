import test from "node:test"
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"

const { resolveIntelligenceTurn, withIntelligenceTurnScope, intelligenceWebDecision, refineIntelligenceTurn } =
  workTestLoader()("lib/server/intelligence-core.ts")

test("admission and response share one request-owned plan", () => {
  const history = [{ role: "user", content: "Расскажи про президента Казахстана" },
    { role: "assistant", content: "Краткий ответ." }]
  withIntelligenceTurnScope(() => {
    const first = resolveIntelligenceTurn("а сколько ему лет?", { history })
    const second = resolveIntelligenceTurn("а сколько ему лет?", { history, requestId: "id" })
    assert.equal(first, second)
    assert.equal(first.focus.followUp, true)
    assert.match(first.focus.searchText, /Казахстана/)
    assert.notEqual(resolveIntelligenceTurn("Другая тема", { history }), first)
  })
})

test("request scopes do not share private conversation context", async () => {
  const one = [{ role: "user", content: "Расскажи про президента Казахстана" }]
  const two = [{ role: "user", content: "Расскажи про президента Франции" }]
  const [a,b] = await Promise.all([one,two].map(history =>
    withIntelligenceTurnScope(async () => {
      await Promise.resolve()
      return resolveIntelligenceTurn("а сколько ему лет?", { history })
    })))
  assert.notEqual(a, b)
  assert.match(a.focus.searchText, /Казахстана/)
  assert.match(b.focus.searchText, /Франции/)
})

test("a model hint or forced tool cannot override no-web", () => {
  const turn = resolveIntelligenceTurn("Какая сейчас цена без интернета?", {})
  assert.equal(intelligenceWebDecision(turn, {}, true), false)
  assert.equal(intelligenceWebDecision(resolveIntelligenceTurn("Какая сегодня погода?", {}), { disableResearch: true }, true), false)
})

test("a fresh factual request permits actual evidence lookup", () => {
  const turn = resolveIntelligenceTurn("Какая сегодня погода в Алматы?", {})
  assert.equal(intelligenceWebDecision(turn, {}), true)
  assert.equal(turn.holdForEvidence, true)
})

test("simple chat stays on a single response path", async () => {
  const turn = resolveIntelligenceTurn("Привет!", {})
  assert.equal(turn.domain.semantic.needed, false)
  assert.equal(intelligenceWebDecision(turn, {}), false)
  assert.equal(await refineIntelligenceTurn(turn, async () => assert.fail("unneeded model call")), turn)
})

test("semantic evidence decisions are validated and do not mutate base turn", async () => {
  const turn = resolveIntelligenceTurn("Сравни медицинские и юридические требования, а также экономические последствия новых правил", {})
  assert.equal(turn.domain.semantic.needed, true)
  const refined = await refineIntelligenceTurn(turn, async () => ({content: '{"domains":["regulation"],"goal":"research","needsWeb":true}'}))
  assert.equal(refined.domain.semantic.used, true)
  assert.equal(refined.domain.evidence.web, "required")
  assert.equal(refined.holdForEvidence, true)
  assert.equal(turn.domain.semantic.used, false)
})

test("untrusted body cannot provide an authoritative precomputed plan", () => {
  const turn = resolveIntelligenceTurn("Привет!", { domain: { evidence: { web: "required" } }, intent: { action: "create" } })
  assert.equal(turn.intent.action, "reply")
  assert.equal(intelligenceWebDecision(turn, {}), false)
})
