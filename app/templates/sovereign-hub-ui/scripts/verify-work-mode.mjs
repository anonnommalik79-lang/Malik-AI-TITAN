import assert from "node:assert/strict"
import { malikIdentityAnswer } from "../lib/server/malik-owner-context.ts"
import { resolveWorkspaceMode, workModeInstruction } from "../lib/ai/work-mode.ts"

for (const text of ["Кто ты?", "ты кто?", "Как тебя зовут?"]) {
  assert.match(malikIdentityAnswer({ prompt: text, workspaceMode: "work" }, false), /Я — Malik Work/)
  assert.match(malikIdentityAnswer({ prompt: text, workspaceMode: "chat" }, false), /MALIK AI V6\.5 TITAN/)
}
assert.match(malikIdentityAnswer({ prompt: "Who are you?", workspaceMode: "work" }, false), /I am Malik Work/)
assert.match(malikIdentityAnswer({ prompt: "Сен кімсің?", workspaceMode: "work" }, false), /Men|Malik Work/)
assert.match(malikIdentityAnswer({ prompt: "Кто ты?" }, false), /MALIK AI/)
assert.equal(resolveWorkspaceMode("work"), "work")
assert.equal(resolveWorkspaceMode("anything else"), "chat")
assert.equal(workModeInstruction("Привет", "chat"), "")
const instruction = workModeInstruction("Сделай проект", "work")
assert.match(instruction, /Malik Work/)
assert.match(instruction, /Never make up a numeric completion percentage/)
assert.match(instruction, /Never fabricate commit hashes/)
console.log("PASS: Malik Work identity (RU/EN/KZ), chat isolation, mode resolution and truthful work contract")
