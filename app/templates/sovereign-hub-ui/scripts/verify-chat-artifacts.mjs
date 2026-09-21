import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  CHAT_ARTIFACT_SKILLS,
  buildChatArtifactSkillPrompt,
  detectChatArtifactSkills,
  isChatArtifactCreationRequest,
} from "../lib/ai/chat-artifact-skills.ts"

assert.ok(CHAT_ARTIFACT_SKILLS.length >= 12, "at least twelve chat-native artifact skills must exist")
assert.equal(isChatArtifactCreationRequest("что такое презентация"), false)
assert.equal(isChatArtifactCreationRequest("создай презентацию стартапа"), true)
assert.equal(isChatArtifactCreationRequest("напиши рабочий Python бот"), true)
assert.equal(detectChatArtifactSkills("подготовь OpenAPI и SQL схему").length, 2)

const deckPrompt = buildChatArtifactSkillPrompt("создай презентацию стартапа")
assert.match(deckPrompt, /selected model is the author/i)
assert.match(deckPrompt, /filename=relative\/path\.ext/i)
assert.match(deckPrompt, /presentation\.html/i)
assert.match(deckPrompt, /do not substitute a fixed MALIK template/i)

const markdown = readFileSync("components/sovereign/MalikMarkdown.tsx", "utf8")
const responseIntelligence = readFileSync("lib/ai/response-intelligence.ts", "utf8")
const streamRoute = readFileSync("app/api/stream/route-impl.ts", "utf8")
const dashboard = readFileSync("components/sovereign/dashboard.tsx", "utf8")

assert.match(markdown, /parseFenceInfo/)
assert.match(markdown, /sanitizeArtifactFilename/)
assert.match(markdown, /downloadTextArtifact/)
assert.match(markdown, /downloadProjectZip/)
assert.match(markdown, /Скачать все ZIP/)
assert.match(responseIntelligence, /buildChatArtifactSkillPrompt\(input\.prompt\)/)
assert.match(streamRoute, /buildChatArtifactSkillPrompt\(coderPrompt\(executionBody\)\)/)
assert.match(dashboard, /isChatArtifactCreationRequest\(prompt\)/)

console.log("Chat-native artifact skills and downloads: PASS")
