import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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
// Regression: the two surfaces must never show each other's chats, and a
// completed page must open below its own answer without a manual Preview click.
const dashboard = readFileSync(new URL("../components/sovereign/dashboard.tsx", import.meta.url), "utf8")
const chatView = readFileSync(new URL("../components/sovereign/chat-view.tsx", import.meta.url), "utf8")
const markdown = readFileSync(new URL("../components/sovereign/MalikMarkdown.tsx", import.meta.url), "utf8")
const skills = readFileSync(new URL("../lib/ai/chat-artifact-skills.ts", import.meta.url), "utf8")
assert.match(dashboard, /workspaceMode:\s*resolveWorkspaceMode\(chat\?\.workspaceMode\)/, "Legacy chats stay in Chat")
assert.match(dashboard, /const modeChats = chats\.filter\(\(chat\) => resolveWorkspaceMode\(chat\.workspaceMode\) === workspaceMode\)/, "Filter independent histories")
assert.match(dashboard, /const handleWorkspaceModeChange = useCallback/, "Mode-switch state handoff")
assert.match(dashboard, /chats=\{modeChats\}/, "Sidebar sees only the current mode")
assert.match(dashboard, /workspaceModeRef\.current === turnWorkspaceMode/, "Old streams cannot replace new-mode answers")
assert.match(chatView, /autoPreview=\{!streaming && !olderVersion/, "Completed code automatically opens its preview")
assert.match(chatView, /message\.generatedCode \? <InlineGeneratedPreview/, "Packaged project preview appears within answer")
assert.match(markdown, /if \(autoPreview && previewable && previewSrcDoc\) setPreviewOpen\(true\)/, "Only ready previewable code opens")
assert.match(skills, /polished responsive interface/, "Both modes get the improved website quality contract")
console.log("PASS: Work mode, task guidance and deterministic identity in RU/EN/KK")
