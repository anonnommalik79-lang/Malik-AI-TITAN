import assert from "node:assert/strict"
import { classifyWorkTask, resolveWorkspaceMode, workModeInstruction } from "../lib/ai/work-mode.ts"
import { malikIdentityAnswer } from "../lib/server/malik-owner-context.ts"

assert.equal(resolveWorkspaceMode("work"), "work")
assert.equal(resolveWorkspaceMode("chat"), "chat")
assert.equal(resolveWorkspaceMode({ mode: "work" }), "chat")
assert.equal(workModeInstruction("Напиши код", "chat"), "")
for (const [prompt, kind] of [
  ["Исправь баг TypeScript", "code"],
  ["Проведи исследование с источниками", "research"],
  ["Сделай презентацию", "presentation"],
  ["Подготовь бюджет в Excel", "table"],
  ["Напиши документ", "document"],
  ["Привет", "general"],
]) assert.equal(classifyWorkTask(prompt), kind)
const instructions = workModeInstruction("Напиши код сайта", "work")
for (const required of ["Malik Work", "Never invent a SHA", "Not run"]) assert(instructions.includes(required), required)
for (const [prompt, lang] of [["Кто ты?", "ru"], ["Who are you?", "en"], ["Сен кімсің?", "kk"]]) {
  const answer = malikIdentityAnswer({ originalQuestion: prompt, workspaceMode: "work" }, false)
  assert(answer.includes("Malik Work"), `Work identity missing: ${lang}`)
  const normal = malikIdentityAnswer({ originalQuestion: prompt, workspaceMode: "chat" }, false)
  assert(normal.includes("MALIK AI V6.5 TITAN"), `Chat identity changed: ${lang}`)
}
assert.equal(malikIdentityAnswer({ originalQuestion: "Кто я?", workspaceMode: "work" }, false), "")
assert(malikIdentityAnswer({ originalQuestion: "Кто создал Malik AI?", workspaceMode: "work" }, false).includes("Абдумалик"))
console.log("PASS: Work mode, task guidance and deterministic identity in RU/EN/KK")
