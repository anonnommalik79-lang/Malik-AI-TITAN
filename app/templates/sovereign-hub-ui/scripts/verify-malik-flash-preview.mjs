import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")
const models = read("lib/ai/malik-models.ts")
const stream = read("app/api/stream/route-impl.ts")
const dashboard = read("components/sovereign/dashboard.tsx")
const bridge = read("lib/server/malik-flash-browser-bridge.ts")
const selector = read("components/sovereign/MalikModelSelector.tsx")

test("Flash preview disabled unless explicitly enabled", () => {
  assert.match(models, /MALIK_FLASH_PREVIEW_ENABLED = process\.env\.NEXT_PUBLIC_MALIK_FLASH_PREVIEW === "1"/)
  assert.match(models, /MALIK_FLASH_PREVIEW_ENABLED \? \[MALIK_FLASH_MODEL\] : \[\]/)
})
test("Flash is free, MAX becomes PRO only in the gated preview", () => {
  assert.match(models, /id: "malik-flash"[\s\S]*?tier: "free"/)
  assert.match(models, /tier: MALIK_FLASH_PREVIEW_ENABLED \? "pro" : "free"/)
  assert.match(models, /MALIK_FLASH_PREVIEW_ENABLED \? "malik-flash" : "malik-max"/)
})
test("Flash uses original Malik icon and MAX uses existing PRO badge", () => {
  assert.match(models, /id: "malik-flash"[\s\S]*?brand: "malik"/)
  assert.match(selector, /malik: \{ label: "MalikLLM MAX", urls: \[MALIK_MAX_ICON\]/)
  assert.match(selector, /malik-model-selector__pro-badge/)
})
test("Each chat sends a stable chat ID, not a fresh ID per turn", () => {
  assert.match(dashboard, /const chatId = branchChatId \|\| activeChatId \|\| crypto\.randomUUID\(\)/)
  assert.match(dashboard, /model: selectedModelId,\s*chatId,/)
})
test("Code selected in Flash routes into MAX", () => {
  assert.match(stream, /const flashUsesMax = requestedSelection\?\.modelId === "malik-flash"/)
  assert.match(stream, /isCodeRequest\(flashPrompt\)/)
  assert.match(stream, /"malik-max"\s*:\s*requestedModelId/)
})
test("Worker requires per-user isolation and HTTPS", () => {
  assert.match(bridge, /MALIK_FLASH_ISOLATED_WORKER !== "1"/)
  assert.match(bridge, /url\.protocol !== "https:"/)
  assert.match(bridge, /flashScopedId\(secret, "user", input\.userId\)/)
  assert.match(bridge, /flashScopedId\(secret, "chat:" \+ input\.userId, input\.chatId\)/)
})
test("No answer invented after partial text or unprocessed photo", () => {
  assert.match(bridge, /body\.complete !== true/)
  assert.match(bridge, /hasImages && body\.imagesProcessed !== true/)
  assert.match(bridge, /images\.length > 4/)
})
test("Full text and cited sources enter the standard MALIKII chat response pipeline", () => {
  assert.match(stream, /const answer = await runMalikFlashBrowser/)
  assert.match(stream, /onToken\?\.\(answer\.content\)/)
  assert.match(bridge, /return \{\s*content: verified\.answer/)
  assert.match(bridge, /provider: "malik-flash"/)
})

const imageRoute = read("lib/media/generate-photo-route.ts")
test("Flash preview can answer without an undeployed Chrome worker", () => {
  assert.match(stream, /selection\?\.modelId === "malik-flash" && isMalikFlashBrowserReady\(\)/)
  assert.match(stream, /requestedModelId === "malik-flash"[\s\S]*?\? "malik-max"/)
  assert.match(stream, /requestedModelId === "malik-flash" && !isMalikFlashBrowserReady\(\)/)
  assert.match(imageRoute, /flashRequested = flashSelected && isMalikFlashBrowserReady\(\)/)
  assert.match(imageRoute, /flashSelected \? "MalikLLM Flash"/)
  assert.match(models, /Бесплатно · быстрые ответы, анализ фото и изображения/)
  assert.doesNotMatch(models, /Бесплатно · Google AI Mode через персональный браузер/)
})
