import assert from "node:assert/strict"
import fs from "node:fs"

const chat = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
const home = fs.readFileSync("components/sovereign/hybrid/MalikHybridHome.tsx", "utf8")
const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
const homeCss = fs.readFileSync("app/titan-home.css", "utf8")
const attachmentCss = fs.readFileSync("app/malik-attachment-tools-final.css", "utf8")
const stream = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
const multimodal = fs.readFileSync("lib/server/multimodal-router.ts", "utf8")
const models = fs.readFileSync("lib/ai/malik-models.ts", "utf8")
const router = fs.readFileSync("lib/server/malik-model-router.ts", "utf8")
const hiddenGemini = fs.readFileSync("lib/server/hidden-gemini-multimodal.ts", "utf8")
const manifest = fs.readFileSync("app/manifest.ts", "utf8")
const importUrl = fs.readFileSync("app/api/attachments/import-url/route.ts", "utf8")
const shareTarget = fs.readFileSync("app/share-target/route.ts", "utf8")
const drawingPad = fs.readFileSync("components/sovereign/ChatDrawingPad.tsx", "utf8")
const libraryPicker = fs.readFileSync("components/sovereign/ChatLibraryPicker.tsx", "utf8")
const pluginRegistry = fs.readFileSync("components/sovereign/features/plugin-registry.ts", "utf8")

const requestedLabels = [
  "Добавить фото и файлы",
  "Добавить файл из библиотеки",
  "Создать изображение",
  "Поиск в сети",
  "Глубокое исследование",
  "Нарисовать",
  "GitHub",
  "Gmail",
  "OpenAI Platform",
]

function extractBlock(source, startText, endText) {
  const start = source.indexOf(startText)
  const end = source.indexOf(endText, start)
  assert.ok(start >= 0 && end > start, `Missing block: ${startText}`)
  return source.slice(start, end)
}

const chatMenu = extractBlock(chat, "const attachItems: Array<", "\n\n  return (")
const homeMenu = extractBlock(home, "const tools: Array<", "  const transferUrl")

for (const menu of [chatMenu, homeMenu]) {
  let previous = -1
  for (const label of requestedLabels) {
    const position = menu.indexOf(`label: "${label}"`)
    assert.ok(position > previous, `${label} must exist in the requested order`)
    previous = position
  }

  for (const removed of ["Загрузить изображения", "Загрузить видео", "Загрузить файлы", "Камера", "Код", "Плагины", "Память"]) {
    assert.equal(menu.includes(`label: "${removed}"`), false, `Old menu action must be gone: ${removed}`)
  }
}

assert.match(homeMenu, /description: "Загрузить с компьютера"/, "Home menu must show ChatGPT-style descriptions")
assert.match(chatMenu, /description: "Загрузить с компьютера"/, "Chat menu must show ChatGPT-style descriptions")

assert.match(home, /ref={allInputRef}[\s\S]*accept={`image\/\*,video\/\*,\$\{HOME_FILE_ACCEPT\}`}/, "Home unified picker must accept images, videos and documents")
assert.match(home, /homeFileToAttachment/, "Home files must be converted into chat attachments")
assert.match(home, /URL\.createObjectURL\(file\)/, "Home media must receive a lightweight visual preview URL")
assert.match(home, /MAX_HOME_ATTACHMENTS = 8/, "Home upload count must align with the chat/router maximum")
assert.match(home, /Максимум 10 MB/, "Home binary payload must stay below the JSON/base64 request safety ceiling")

assert.match(chat, /ref={imageInputRef} type="file" accept="image\/\*"/, "Chat image creator must keep its image picker")
assert.match(chat, /ref={allInputRef}[\s\S]*accept="image\/\*,video\/\*,audio\/\*,\.pdf,\.docx,\.xlsx,\.pptx/, "Chat unified picker must accept media and documents")
assert.equal(chat.includes("videoInputRef"), false, "Separate video-only picker must be replaced by the unified picker")
assert.equal(chat.includes("fileInputRef"), false, "Separate document-only picker must be replaced by the unified picker")
assert.equal(chat.includes('capture="environment"'), false, "The old separate camera row/input must be gone")

assert.match(home, /\/api\/plugins\/connect\?id=/, "Home GitHub/Gmail actions must use the real plugin connection route")
assert.match(chat, /\/api\/plugins\/connect\?id=/, "Chat GitHub/Gmail actions must use the real plugin connection route")
assert.match(pluginRegistry, /id: "github"[\s\S]*providerSlug: "github"/, "GitHub must remain a real WorkOS Pipes plugin")
assert.match(pluginRegistry, /id: "gmail"[\s\S]*providerSlug: "gmail"/, "Gmail must remain a real WorkOS Pipes plugin")
assert.match(chat, /research:\s*researchMode !== "off"/, "Search menu actions must route a real research request")
assert.match(chat, /researchMode === "deep" \? "deep" : responseDepth/, "Deep research must request deep response depth")
assert.match(home, /responseDepth:\s*deepResearch \? "deep" : undefined/, "Home deep research must request deep response depth")
assert.match(chat, /https:\/\/platform\.openai\.com\//, "OpenAI Platform row must open the official platform")
assert.match(home, /https:\/\/platform\.openai\.com\//, "Home OpenAI Platform row must open the official platform")

assert.match(libraryPicker, /\/api\/media\/library\?limit=120/, "Library picker must load the authenticated Malik media library")
assert.match(libraryPicker, /onSelect\(item\.src/, "Library picker must return the selected saved asset")
assert.match(drawingPad, /<canvas/, "Draw action must open a real canvas")
assert.match(drawingPad, /canvas\.toBlob/, "Draw action must turn the canvas into an attachable PNG file")

assert.match(chat, /UserAttachmentGallery/, "Sent attachments must render inside the user chat turn")
assert.match(chat, /malik-user-attachment--image/, "Sent photos must render as actual image previews")
assert.match(chat, /malik-user-attachment--video/, "Sent videos must render as actual video previews")
assert.match(chat, /URL\.createObjectURL\(file\)/, "Chat media must receive a lightweight visual preview URL")
assert.match(chat, /createPortal\([\s\S]*malik-attachment-menu/, "Chat plus menu must render through a body portal so the composer cannot clip it")
assert.match(chat, /className="fixed z-\[10000\][\s\S]*max-h-\[72dvh\]/, "Chat plus menu must use viewport positioning and remain scrollable")
assert.match(chat, /onPaste={handleComposerPaste}/, "Chat composer must accept pasted media")
assert.match(chat, /onDrop={handleComposerDrop}/, "Chat composer must accept dragged media")
assert.match(chat, /malik-composer-attachment-preview/, "Pending media must render as a square preview before send")
assert.match(chat, /h-\[152px\] w-\[152px\]/, "Sent media must remain visible as square previews after send")
assert.match(home, /thome-attachment-preview/, "Home composer must show square media previews")
assert.match(home, /onPaste={handlePaste}/, "Home composer must accept pasted media")
assert.match(home, /onDrop={handleDrop}/, "Home composer must accept dragged media")
assert.match(importUrl, /assertPublicUrl/, "Remote social-media import must protect against private-network SSRF")
assert.match(importUrl, /MAX_REMOTE_BYTES = 10 \* 1024 \* 1024/, "Remote media import must stay inside the 10MB request budget")
assert.match(manifest, /share_target/, "Installed Malik AI must register as an OS share target")
assert.match(shareTarget, /form\.getAll\("files"\)/, "PWA share target must accept shared files")

const userMessageBlock = extractBlock(dashboard, "const userMessage: Message = {", "  const assistantMessage: Message = {")
assert.match(userMessageBlock, /attachments:\s*attachments\.map\(\(item\) => \(\{[\s\S]*url:\s*item\.url/, "User messages must keep lightweight attachment metadata")
assert.equal(userMessageBlock.includes("base64: item.base64"), false, "Chat history must not duplicate base64 uploads")
assert.match(dashboard, /attachments:?\s*[A-Za-z]*,\s*media_b64:/, "The full attachment payload must still be sent to /api/stream")
assert.match(stream, /routeMalikAttachments/, "The main stream route must send attachments through the multimodal router")
assert.match(multimodal, /runHiddenGeminiMultimodal/, "Binary attachments must reach the hidden Gemini multimodal path")

assert.match(homeCss, /\.thome-tools-menu[\s\S]*width:\s*420px[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/, "Desktop Home tools menu must be wide enough for two-line actions")
assert.match(homeCss, /\.thome-tools-copy[\s\S]*\.thome-tools-copy small/, "Home menu must style action descriptions")
assert.match(attachmentCss, /\.thome-tools-menu[\s\S]*width:\s*420px\s*!important[\s\S]*max-height:\s*min\(72dvh, 620px\)\s*!important/, "Final desktop override must fit the full tools list and scroll when needed")
assert.match(attachmentCss, /@media \(max-width: 767px\)[\s\S]*width:\s*min\(360px, calc\(100vw - 24px\)\)\s*!important/, "Mobile tools menu must stay inside the viewport")
assert.match(attachmentCss, /@media \(max-width: 767px\)[\s\S]*min-height:\s*50px\s*!important[\s\S]*height:\s*auto\s*!important/, "Mobile rows must keep readable two-line touch targets")

assert.match(models, /qwen\/qwen3\.8-27b/, "Qwen 3.8 27B must remain available")
assert.match(models, /gpt-oss-120b/, "Cerebras GPT-OSS 120B fallback must remain")
assert.equal(models.includes("zai-glm-4.7"), false, "Deprecated GLM 4.7 must not be exposed")
assert.equal(router.includes("malik-glm-355b"), false, "Deprecated GLM route must not remain in fallback logic")
assert.match(hiddenGemini, /gemini-3\.5-flash-lite/, "Hidden multimodal engine must default to Gemini 3.5 Flash-Lite")
assert.match(hiddenGemini, /GEMINI_FALLBACK_MODEL/, "Hidden multimodal engine must support the configured Gemini fallback")
assert.match(hiddenGemini, /application\/pdf/, "Hidden multimodal engine must accept PDF documents")
assert.equal(models.includes("gemini-3.5-flash-lite"), false, "Gemini must stay hidden from the model selector")

console.log("Full ChatGPT-style tools menu, uploads, library, research, drawing, plugins, desktop/mobile layout, and multimodal transport verified.")
