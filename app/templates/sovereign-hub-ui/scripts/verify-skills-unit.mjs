import test from "node:test"
import assert from "node:assert/strict"
import { load, memorySkillStore, skillHash, skillOwnerKey, project, sources } from "./fixtures/skills-fixture.mjs"
const { SKILL_REGISTRY, skillDefinition, skillInvocation } = load("lib/skills/registry.ts")
const { skillChatRequest } = load("lib/skills/chat-intent.ts")
const { verifySkillResult, inspectSkillProject, boundedSources } = load("lib/skills/verification.ts")

test("four immutable skill graphs with a terminal verification step", () => {
  assert.equal(Object.keys(SKILL_REGISTRY).length, 4)
  for (const skill of Object.values(SKILL_REGISTRY)) {
    assert.equal(skill.steps.at(-1).tool, "verify")
    const seen = new Set()
    for (const step of skill.steps) { assert.ok(step.dependencies.every(d => seen.has(d))); assert.ok(skill.tools.includes(step.tool)); seen.add(step.id) }
    assert.throws(() => skill.tools.push("shell"))
  }
  for (const id of ["__proto__", "constructor", "shell.exec", null]) assert.equal(skillDefinition(id), null)
})
for (const [prefix, skill] of [["/forge", "forge.autopilot"], ["FORGE AUTOPILOT:", "forge.autopilot"], ["/research", "deep.research"], ["Проведи глубокое исследование:", "deep.research"], ["/team", "agent.team"], ["Команда агентов:", "agent.team"], ["/verify", "malik.verify"], ["MALIK VERIFY:", "malik.verify"]]) test(`explicit invocation ${prefix}`, () => assert.equal(skillInvocation(`${prefix} task`).skill, skill))
for (const prompt of ["Что такое FORGE AUTOPILOT?", "Explain deep research", 'Translate: "/team task"', "Привет", "Напиши React-компонент", "Что сказал Claude?", "```\n/forge task\n```", "Сравни режимы AGENT TEAM и обычный чат"]) test(`ordinary chat stays in established routing: ${prompt}`, () => assert.equal(skillInvocation(prompt), null))
test("verify targets only the last assistant message; explicit text overrides history", () => {
  const history = [{ role: "assistant", content: "old" }, { role: "user", content: "user secret" }, { role: "assistant", content: "17 * 23 = 392" }]
  assert.equal(skillChatRequest({ prompt: "/verify", history }).target, "17 * 23 = 392")
  assert.equal(skillChatRequest({ prompt: "/verify explicit", history }).target, "explicit")
  assert.equal(skillChatRequest({ prompt: "Привет", selectedSkillId: "petroleum.analyze" }), null)
})
test("resume syntax is anchored and cannot be injected inside a quoted example", () => {
  const id = "skill_" + "a".repeat(32)
  assert.equal(skillChatRequest({ prompt: `Продолжи задачу ${id}` }).resumeId, id)
  assert.equal(skillChatRequest({ prompt: `Explain 'Resume task ${id}'` }), null)
})
test("file inspection accepts valid modules and detects actual parse errors", () => {
  assert.deepEqual(inspectSkillProject(project()).errors, [])
  const broken = project(); broken.files[1].content = "export const = ;"
  assert.ok(inspectSkillProject(broken).errors.length)
})
for (const badPath of ["../escape.mjs", "/abs.mjs", "a/../../b.mjs", ".env", "CON.mjs"]) test(`reject unsafe project path ${badPath}`, () => {
  const value = project(); value.files.push({ path: badPath, content: "x", language: "text" })
  assert.throws(() => inspectSkillProject(value))
})
test("source gate rejects private URLs and deduplicates before handoff", () => {
  const found = [...sources(), sources()[0], { ...sources()[0], url: "http://127.0.0.1/secret" }, { ...sources()[0], url: "https://user:pass@example.org/secret" }]
  assert.equal(boundedSources("fixture evidence", found).length, 3)
})
test("stale sources cannot prove fresh news", () => {
  assert.equal(boundedSources("Latest news today", sources().map(s => ({ ...s, publishedAt: "2020-01-01" }))).length, 0)
})
test("arithmetic is corrected by the real exact engine before delivery", () => {
  const result = verifySkillResult({ skill: "malik.verify", prompt: "Проверь 17 * 23", content: "17 * 23 = 392", sources: [] })
  assert.match(result.content, /391/); assert.doesNotMatch(result.content, /= 392/)
  assert.ok(result.verification.checks.find(c => c.id === "arithmetic").details.length)
})
test("unknown citations and invented source URLs fail rather than becoming fake citations", () => {
  const result = verifySkillResult({ skill: "deep.research", prompt: "fixture", content: "Fixture [99]. https://invented.example.org/not-read", sources: sources() })
  assert.equal(result.verification.status, "fail")
})
test("review omission cannot promote the original unverified fact into PASS", () => {
  const result = verifySkillResult({ skill: "malik.verify", prompt: "Проверь без интернета", target: "The company had 987654 users in the current year.", content: "A compact review with no original claims.", sources: [] })
  assert.equal(result.verification.checks.find(c => c.id === "original-target").status, "not_run")
  assert.equal(result.verification.status, "partial")
})
for (const content of ["Я отправил сообщение.", "We deployed the website.", "Я запустил тесты.", "I ran the build."]) test(`reject unsupported external action: ${content}`, () => {
  assert.equal(verifySkillResult({ skill: "agent.team", prompt: "fixture", content, sources: [] }).verification.status, "fail")
})
test("runtime not_run cannot turn into full PASS", () => {
  const value = project()
  const result = verifySkillResult({ skill: "forge.autopilot", prompt: "Build CLI", content: "Source files created.", sources: [], project: value, execution: { sourceHash: load("lib/website/engine/workspace.ts").sourceHash(value.files), status: "not_run", details: ["No sandbox"] } })
  assert.equal(result.verification.status, "partial")
})
test("memory checkpoint store enforces immutable snapshots and compare-and-set", async () => {
  const store = memorySkillStore(), owner = skillOwnerKey("owner"), id = "skill_" + "a".repeat(32)
  const value = { version: "malik-skills/1", owner, id, steps: [], budget: { tokens: 0 }, expiresAt: Date.now() + 60000 }
  assert.equal(await store.write(owner, id, value, null), true)
  value.budget.tokens = 999
  const read = await store.read(owner, id); assert.equal(read.value.budget.tokens, 0)
  assert.equal(await store.write(owner, id, value, null), false)
  assert.equal(await store.write(owner, id, value, read.revision), true)
  assert.equal((await store.read(skillOwnerKey("stranger"), id)).value, null)
})
test("tampered completed output fails checkpoint validation", async () => {
  const store = memorySkillStore(), owner = skillOwnerKey("owner"), id = "skill_" + "b".repeat(32)
  await assert.rejects(store.write(owner, id, { version: "malik-skills/1", owner, id, steps: [{ status: "completed", output: { content: "tampered" }, outputHash: skillHash({ content: "original" }) }], budget: { tokens: 0 }, expiresAt: Date.now() + 60000 }, null), /CORRUPT_CHECKPOINT/)
})
