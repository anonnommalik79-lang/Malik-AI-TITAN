import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { explicitlyRequestsPackagedProject } from "../lib/chat-code-routing.ts"

for (const request of [
  "сделай мне сайт крутой",
  "напиши index.html для портфолио",
  "создай React компонент кнопки",
  "напиши Python код для распаковки zip",
  "объясни что такое архив",
]) {
  assert.equal(explicitlyRequestsPackagedProject(request), false, request)
}

for (const request of [
  "собери проект в ZIP",
  "создай сайт и отправь архив",
  "дай скачать проект с файлами",
]) {
  assert.equal(explicitlyRequestsPackagedProject(request), true, request)
}

const dashboard = readFileSync("components/sovereign/dashboard.tsx", "utf8")
const markdown = readFileSync("components/sovereign/MalikMarkdown.tsx", "utf8")
const colorGuard = readFileSync("components/sovereign/NoBlueUiGuard.tsx", "utf8")
const chatSurface = readFileSync("app/chat-black-surface-final.css", "utf8")

assert.match(dashboard, /if \(mode !== "canvas"\) return \{ text: text \|\| "", code: "", lang: "" \}/)
assert.match(dashboard, /isProjectRequest = explicitProjectBuild/)
assert.match(markdown, /highlightedCode\(code, language\)/)
assert.match(markdown, /malik-md-code-line-number/)
assert.match(markdown, /downloadProjectZip\("malik-ai-files\.zip"/)
assert.match(markdown, /downloadTextArtifact\(filename, code\)/)
assert.match(markdown, /buildCanvasSrcDoc\(code\)/)
assert.match(markdown, /Предпросмотр/)
assert.match(markdown, /sandbox="allow-scripts allow-forms allow-modals allow-popups"/)
assert.match(chatSurface, /\.malik-md-live-preview\s*\{[\s\S]*?border:\s*2px solid #fff/)
assert.match(chatSurface, /\.malik-md-live-preview__report/)
assert.match(colorGuard, /"\.malik-md-codeblock"/)

console.log("Chat code routing and rendering: PASS")
