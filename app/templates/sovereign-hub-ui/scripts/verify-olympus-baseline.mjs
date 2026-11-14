import test from "node:test"
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"

const load = workTestLoader()
const { validateUi } = load("lib/generative-ui/validate.ts")
const { trustedLink } = load("lib/ai/citation-names.ts")
const { gateAttributionAnswer } = load("lib/ai/attribution-evidence.ts")
const { clockReply, evidenceDigest } = load("lib/ai/premise-check.ts")
const chart = (values, extra = {}) => validateUi({ blocks: [{ type: "chart", kind: "line", labels: ["Jan", "Feb", "Mar"], series: [{ name: "Sales", values }], ...extra }] })

test("missing chart observations stay missing rather than becoming zero", () => {
  assert.deepEqual(chart([12, null, 16]).doc.blocks[0].series[0].values, [12, null, 16])
})
test("short chart series are padded with gaps", () => {
  assert.deepEqual(chart([12]).doc.blocks[0].series[0].values, [12, null, null])
})
test("real zero-only observations are drawable", () => {
  assert.ok(chart([0, 0, 0]).doc)
})
test("non-finite and overflowing numeric strings are not measurements", () => {
  const values = chart([12, "9".repeat(400), NaN]).doc.blocks[0].series[0].values
  assert.deepEqual(values, [12, null, null])
})
test("model cannot invent a deep link on a real source's domain", () => {
  assert.equal(trustedLink("https://example.org/invented", [{ url: "https://example.org/report" }]), "")
})
test("source path prefixes are not evidence for another URL", () => {
  const checked = validateUi({ blocks: [{ type: "citation", url: "https://example.org/repor" }] }, { sources: [{ url: "https://example.org/report" }] })
  assert.ok(checked.doc === null || checked.doc.blocks[0].unverified === true)
})
test("fractional citation indices never pass validation", () => {
  const checked = validateUi({ blocks: [{ type: "citation", ref: 1.5 }] }, { sources: [{ url: "https://example.org/a" }, { url: "https://example.org/b" }] })
  assert.equal(checked.doc, null)
})
test("a claimed source-backed chart needs source evidence", () => {
  const checked = chart([10, 20, 30], { origin: "sources" })
  assert.ok(!checked.doc || checked.doc.blocks[0].type !== "chart" || checked.doc.blocks[0].origin !== "sources")
})
test("prototype keys cannot become UI state", () => {
  const checked = validateUi(JSON.parse('{"state":{"__proto__":"x","constructor":7,"safe":2},"blocks":[{"type":"text","text":"ok"}]}'))
  assert.deepEqual(Object.keys(checked.doc.state), ["safe"])
})
test("no evidence is not proof a presumed event never happened", () => {
  const result = gateAttributionAnswer({ question: "Когда Acme создала летающую машину?", answer: "Acme не создала летающую машину. Это невозможно.", sources: [], searchEnabled: true })
  assert.equal(result.withheld, true)
  assert.doesNotMatch(result.content, /Это невозможно/)
})
test("negation late in an answer does not validate its unsupported opening", () => {
  const result = gateAttributionAnswer({ question: "Когда Acme создала летающую машину?", answer: "Acme создала её в 2026 году. Но не выпускала серийно.", sources: [], searchEnabled: true })
  assert.equal(result.withheld, true)
})
test("invalid source URLs do not crash the evidence fallback", () => {
  assert.doesNotThrow(() => evidenceDigest([{ url: "https://", snippet: "A lead with no title" }]))
})
test("invalid client timezone falls back safely", () => {
  assert.doesNotThrow(() => clockReply("Какое сегодня число?", new Date("2026-12-31T23:30:00Z"), "Invalid/Zone"))
})
test("Kazakh clock questions use the same deterministic clock", () => {
  assert.match(clockReply("Қазір қай жыл?", new Date("2026-12-31T23:30:00Z")), /2027/)
})
