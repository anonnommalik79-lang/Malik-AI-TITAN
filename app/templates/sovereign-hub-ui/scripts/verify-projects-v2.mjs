import assert from "node:assert/strict"
import fs from "node:fs"

const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
const projects = fs.readFileSync("components/sovereign/projects/ProjectsWorkspace.tsx", "utf8")
const sidebar = fs.readFileSync("components/sovereign/sidebar.tsx", "utf8")

assert.match(dashboard, /projectId\?: string/, "chat records need a lightweight project link")
assert.match(dashboard, /const firstThread: Chat = \{[\s\S]*?projectId,/, "new projects must create a child chat without copying project messages")
assert.match(dashboard, /handleCreateProjectThread/, "projects need multiple chats")
assert.match(dashboard, /handleSelectProjectThread/, "project chats must reopen independently")
assert.match(dashboard, /handleDeleteProjectThread/, "project chats must be removable")
assert.match(dashboard, /chat\.id !== projectId && chat\.projectId !== projectId/, "deleting a project must remove its child chats")
assert.match(dashboard, /activeConversation\?\.projectId[\s\S]*?projectInstructions/, "child chats must inherit project instructions from the container")
assert.match(dashboard, /const projectThreads = modeChats\.filter\(\(chat\) => Boolean\(chat\.projectId\)\)/, "project UI must reuse existing chat state")
assert.doesNotMatch(projects, /fetch\(|\/api\/os\/projects|localStorage|sessionStorage/, "Projects UI must not add a second server or browser project store")
assert.match(projects, /Чаты проекта/)
assert.match(projects, /Новый чат/)
assert.match(projects, /threads: MalikProjectRecord\[\]/)
assert.match(sidebar, /chat\.kind !== "project" && !chat\.projectId/, "project chats belong inside Projects, not duplicated in global chat history")

console.log("Projects v2: multi-chat containers + shared instructions + zero duplicate store: OK")
