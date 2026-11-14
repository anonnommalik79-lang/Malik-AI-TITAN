import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(path,"utf8");
const route = read("lib/media/generate-photo-route.ts");
const ui = read("components/sovereign/dashboard.tsx");
const bridge = read("lib/server/malik-flash-image-worker.ts");
const stream = read("app/api/stream/route-impl.ts");
const models = read("lib/ai/malik-models.ts");
const types = read("lib/media/types.ts");
const worker = read("../../../tools/malik-flash-worker/browser.mjs");
const image = read("../../../tools/malik-flash-worker/image-result.mjs");

test("Flash is free but feature-gated, MAX keeps a paid selector option",()=>{
  assert.match(models,/MALIK_FLASH_PREVIEW_ENABLED = process\.env\.NEXT_PUBLIC_MALIK_FLASH_PREVIEW === "1"/);
  assert.match(models,/id: "malik-flash"[\s\S]*?tier: "free"/);
  assert.match(models,/tier: MALIK_FLASH_PREVIEW_ENABLED \? "pro" : "free"/);
});
test("selected Flash sends image tasks into the existing MALIKII image UI and server",()=>{
  assert.match(ui,/chatModelId: inlineMediaKind === "image" \? selectedModelId : undefined/);
  assert.match(ui,/chatId,/);
  assert.match(ui,/patchInlineMedia\(\{ status: "generating", progress: 36 \}\)/);
  assert.match(ui,/finalizeInlineMedia/);
  assert.match(route,/body\?\.chatModelId === "malik-flash"/);
  assert.match(route,/runMalikFlashImage\(\{/);
  assert.match(route,/postProcessGeneratedImage\(\{ imageUrl: result\.imageUrl/);
  assert.match(route,/uploadMediaAsset\(\{/);
});
test("image generation and editing both require authentic Chrome image output",()=>{
  assert.match(route,/task: editing \? "image_edit" : "image_generate"/);
  assert.match(worker,/waitForGeneratedImage\(page, imagesBefore\)/);
  assert.match(worker,/uploadPhotosToChrome\(page, photos\)/);
  assert.match(worker,/await submitQuestion\(page, imagePrompt\)/);
  assert.match(image,/newImageCandidates\(before, await readVisibleImages\(page\)\)/);
  assert.match(image,/verifyImageDataUrl\(dataUrl\)/);
  assert.match(bridge,/response\.complete !== true \|\| response\.kind !== task/);
  assert.match(bridge,/task === "image_edit" && response\.imagesProcessed !== true/);
});
test("account isolation and resource caps remain intact",()=>{
  assert.match(bridge,/input\.userId\.startsWith\("guest:"\)/);
  assert.match(bridge,/flashScopedId\(secret, "user", input\.userId\)/);
  assert.match(bridge,/flashScopedId\(secret, "chat:" \+ input\.userId, input\.chatId\)/);
  assert.match(bridge,/MALIK_FLASH_ISOLATED_WORKER !== "1"/);
  assert.match(route,/checkImageCreditLimit\(\{/);
  assert.match(route,/recordImageCreditUsage\(user\.userId, imageSize\)/);
  assert.match(route,/acquireImageGenerationLock\(user\.userId\)/);
});
test("no technical Chrome/Google labels appear in new client-side image path",()=>{
  assert.doesNotMatch(ui.match(/chatModelId: inlineMediaKind[\s\S]{0,1100}/)?.[0]||"",/Google AI Mode|Chrome/);
  assert.match(route,/engine: flashSelected \? "MalikLLM Flash"/);
  assert.match(types,/ImageProviderId = [^\n]*"malik-flash"/);
});
test("coding, websites, games, deeper reasoning use MAX on Flash",()=>{
  assert.match(stream,/flashUsesMax/);
  assert.match(stream,/isCodeRequest\(flashPrompt\)/);
  assert.match(stream,/websiteIntent\(flashPrompt\)/);
  assert.match(stream,/briefNeedsDeep\(flashPrompt\)/);
  assert.match(stream,/modelId: "malik-max"/);
});
