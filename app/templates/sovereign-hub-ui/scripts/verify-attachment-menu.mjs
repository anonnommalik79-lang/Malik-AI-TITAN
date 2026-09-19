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

const requestedLabels = ["Загрузить изображения", "Загрузить видео", "Загрузить файлы"]

function extractBlock(source, startText, endText) {
  const start = source.indexOf(startText)
  const end = source.indexOf(endText, start)
  assert.ok(start >= 0 && end > start, `Missing block: ${startText}`)
  return source.slice(start, end)
}

const chatMenu = extractBlock(chat, "const attachItems = useMemo", "  return (\n    <div data-malik-chat-fullwidth")
const homeMenu = extractBlock(home, "const tools: Array<", "const hasSendableContent")

for (const menu of [chatMenu, homeMenu]) {
  let previous = -1
  for (const label of requestedLabels) {
    const position = menu.indexOf(`label: "${label}"`)
    assert.ok(position > previous, `${label} must exist in the requested order`)
    previous = position
  }

  for (const removed of ["Камера", "Фото", "Изображение", "Видео", "Код", "Плагины", "Веб-поиск", "Память"]) {
    assert.equal(menu.includes(`label: "${removed}"`), false, `Old menu action must be gone: ${removed}`)
  }
}

assert.match(home, /ref={imageInputRef}[\s\S]*accept="image\/\*"/, "Home image upload must use an image-only picker")
assert.match(home, /ref={videoInputRef}[\s\S]*accept="video\/\*"/, "Home video upload must use a video-only picker")
assert.match(home, /ref={fileInputRef}[\s\S]*accept={HOME_FILE_ACCEPT}/, "Home file row must open a real document/code picker")
assert.match(home, /homeFileToAttachment/, "Home files must be converted into chat attachments")
assert.match(home, /URL\.createObjectURL\(file\)/, "Home media must receive a lightweight visual preview URL")
assert.match(home, /MAX_HOME_ATTACHMENTS = 8/, "Home upload count must align with the chat/router maximum")
assert.match(home, /Максимум 10 MB/, "Home binary payload must stay below the JSON/base64 request safety ceiling")

assert.match(chat, /ref={imageInputRef} type="file" accept="image\/\*"/, "Chat image row must open an image picker")
assert.match(chat, /ref={videoInputRef} type="file" accept="video\/\*"/, "Chat video row must open a video picker")
assert.match(chat, /ref={fileInputRef}[\s\S]*\.pdf,\.docx,\.xlsx,\.pptx/, "Chat file row must accept documents")
assert.equal(chat.includes('capture="environment"'), false, "The old separate camera row/input must be gone")
assert.match(chat, /UserAttachmentGallery/, "Sent attachments must render inside the user chat turn")
assert.match(chat, /malik-user-attachment--image/, "Sent photos must render as actual image previews")
assert.match(chat, /malik-user-attachment--video/, "Sent videos must render as actual video previews")
assert.match(chat, /URL\.createObjectURL\(file\)/, "Chat media must receive a lightweight visual preview URL")
assert.match(chat, /createPortal\([\s\S]*malik-attachment-menu/, "Chat plus menu must render through a body portal so the composer cannot clip it")
assert.match(chat, /className="fixed z-\[10000\]/, "Chat plus menu must use viewport positioning")
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
assert.match(dashboard, /attachments,\s*media_b64:/, "The full attachment payload must still be sent to /api/stream")
assert.match(stream, /routeMalikAttachments/, "The main stream route must send attachments through the multimodal router")
assert.match(multimodal, /runHiddenGeminiMultimodal/, "Binary attachments must reach the hidden Gemini multimodal path")

assert.match(homeCss, /\.thome-tools-menu[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/, "Desktop Home upload menu must be one clean column")
assert.match(attachmentCss, /\.thome-tools-menu[\s\S]*width:\s*292px\s*!important[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/, "Final desktop override must keep one clean column")
assert.match(attachmentCss, /@media \(max-width: 767px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/, "Mobile upload menu must use the same single-column layout")
assert.match(attachmentCss, /@media \(max-width: 767px\)[\s\S]*height:\s*48px\s*!important/, "Mobile rows must keep full touch height without clipping")

assert.match(models, /qwen\/qwen3\.8-27b/, "Qwen 3.8 27B must remain available")
assert.match(models, /gpt-oss-120b/, "Cerebras GPT-OSS 120B fallback must remain")
assert.equal(models.includes("zai-glm-4.7"), false, "Deprecated GLM 4.7 must not be exposed")
assert.equal(router.includes("malik-glm-355b"), false, "Deprecated GLM route must not remain in fallback logic")
assert.match(hiddenGemini, /gemini-3\.5-flash-lite/, "Hidden multimodal engine must default to Gemini 3.5 Flash-Lite")
assert.match(hiddenGemini, /GEMINI_FALLBACK_MODEL/, "Hidden multimodal engine must support the configured Gemini fallback")
assert.match(hiddenGemini, /application\/pdf/, "Hidden multimodal engine must accept PDF documents")
assert.equal(models.includes("gemini-3.5-flash-lite"), false, "Gemini must stay hidden from the model selector")

console.log("Upload menu, desktop/mobile layout, sent previews, and multimodal transport verified.")
