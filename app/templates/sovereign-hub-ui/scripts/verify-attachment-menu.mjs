import assert from "node:assert/strict"
import fs from "node:fs"

const chat = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
const models = fs.readFileSync("lib/ai/malik-models.ts", "utf8")
const router = fs.readFileSync("lib/server/malik-model-router.ts", "utf8")
const hiddenGemini = fs.readFileSync("lib/server/hidden-gemini-multimodal.ts", "utf8")

const menuStart = chat.indexOf("const attachItems = useMemo")
const menuEnd = chat.indexOf("return (", menuStart)
assert.ok(menuStart >= 0 && menuEnd > menuStart, "Attachment menu definition must exist")
const menu = chat.slice(menuStart, menuEnd)
const labels = ["Камера", "Фото", "Видео", "Файлы", "Плагины"]
let previous = -1
for (const label of labels) {
  const position = menu.indexOf(`label: "${label}"`)
  assert.ok(position > previous, `${label} must exist in the requested order`)
  previous = position
}
assert.equal(menu.includes("Добавить аудио"), false, "Legacy long attachment menu must be gone")
assert.match(chat, /capture="environment"/, "Camera picker must request the rear camera")
assert.match(chat, /accept="image\/\*"/, "Photo picker must accept images")
assert.match(chat, /accept="video\/\*"/, "Video picker must accept videos")
assert.match(chat, /aria-controls="malik-attachment-menu"/, "Plus button must own the menu")
assert.match(chat, /onOpenPlugins\?\.\(\)/, "Plugins action must invoke the dashboard callback")
assert.ok((dashboard.match(/onOpenPlugins=/g) || []).length >= 2, "Plugins callback must be wired in normal and project chats")
assert.match(models, /qwen\/qwen3\.8-27b/, "Qwen 3.8 27B must remain the default live text model")
assert.match(models, /gpt-oss-120b/, "Cerebras GPT-OSS 120B fallback must remain")
assert.equal(models.includes("zai-glm-4.7"), false, "Deprecated GLM 4.7 must not be exposed")
assert.equal(router.includes("malik-glm-355b"), false, "Deprecated GLM route must not remain in fallback logic")
assert.match(hiddenGemini, /gemini-3\.7-flash/, "Hidden multimodal engine must target Gemini 3.7 Flash")
assert.equal(models.includes("gemini-3.7-flash"), false, "Gemini must stay hidden from the model selector")
console.log("Attachment menu, Plugins navigation, live text fallbacks, and hidden Gemini routing verified.")
