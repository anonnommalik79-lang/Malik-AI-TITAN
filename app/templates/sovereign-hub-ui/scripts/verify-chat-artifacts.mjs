import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  CHAT_ARTIFACT_SKILLS,
  buildChatArtifactSkillPrompt,
  detectChatArtifactSkills,
  isChatArtifactCreationRequest,
} from "../lib/ai/chat-artifact-skills.ts"
import { buildCanvasProjectSrcDoc } from "../lib/canvas-preview.ts"

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
assert.match(streamRoute, /const artifactSkillPrompt = buildChatArtifactSkillPrompt\(coderInput\)/)
assert.match(streamRoute, /systemPrompt:\s*\[[\s\S]*?artifactSkillPrompt/)
assert.match(dashboard, /isChatArtifactCreationRequest\(prompt\)/)

const preview = buildCanvasProjectSrcDoc([
  { name: "index.html", content: '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Работает</h1><script src="script.js"></script></body></html>' },
  { name: "styles.css", content: "h1 { color: white; }" },
  { name: "script.js", content: "document.querySelector('h1').dataset.ready = 'yes';" },
], "index.html")
assert.match(preview, /<style>h1 \{ color: white; \}<\/style>/)
assert.match(preview, /<script>document\.querySelector/)
assert.doesNotMatch(preview, /href="styles\.css"|src="script\.js"/)
const nestedPreview = buildCanvasProjectSrcDoc([
  { name: "site/index.html", content: '<html><head><link href="./styles.css" rel="stylesheet"></head><body><script src="./script.js"></script></body></html>' },
  { name: "site/styles.css", content: "body { color: white; }" },
  { name: "site/script.js", content: "window.previewReady = true;" },
], "site/index.html")
assert.match(nestedPreview, /body \{ color: white; \}/)
assert.match(nestedPreview, /window\.previewReady = true/)
assert.match(markdown, /buildCanvasProjectSrcDoc\(previewFiles, filename\)/)

console.log("Chat-native artifact skills and downloads: PASS")
