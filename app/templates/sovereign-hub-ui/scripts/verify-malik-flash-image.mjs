import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import { workTestLoader } from "./work-test-loader.mjs"

const require = createRequire(import.meta.url)
const sharp = require("sharp")
const load = workTestLoader()
const { validateFlashImage, verifyMalikFlashImagePayload } = load("lib/server/malik-flash-image-worker.ts")
const base = { origin: "google-ai-mode-browser", imageOrigin: "confirmed-generated-output", kind: "image_edit", complete: true, imagesProcessed: true }

test("original PNG, JPEG and WebP bytes survive upload validation", async () => {
  for (const format of ["png", "jpeg", "webp"]) {
    const input = await sharp({ create: { width: 80, height: 60, channels: 3, background: "red" } }).toFormat(format).toBuffer()
    const mime = "image/" + format
    const verified = await validateFlashImage({ mime, base64: input.toString("base64") })
    assert.deepEqual(verified.bytes, input)
    assert.equal(verified.width, 80)
    assert.equal(verified.height, 60)
    await assert.rejects(validateFlashImage({ mime, base64: input.subarray(0, 14).toString("base64") }), { code: "FLASH_IMAGE_INVALID" })
  }
})

test("a successful edit needs a completed real image receipt and accepted source", async () => {
  const png = await sharp({ create: { width: 80, height: 60, channels: 3, background: "blue" } }).png().toBuffer()
  const success = { ...base, image: { mime: "image/png", base64: png.toString("base64") } }
  assert.deepEqual((await verifyMalikFlashImagePayload(success, "image_edit")).bytes, png)
  await assert.rejects(verifyMalikFlashImagePayload({ ...success, imagesProcessed: false }, "image_edit"), { code: "FLASH_SOURCE_NOT_PROCESSED" })
  await assert.rejects(verifyMalikFlashImagePayload({ ...success, imageOrigin: "search-thumbnail" }, "image_edit"), { code: "FLASH_IMAGE_INCOMPLETE" })
  await assert.rejects(verifyMalikFlashImagePayload({ ...success, kind: "image_generate" }, "image_edit"), { code: "FLASH_IMAGE_INCOMPLETE" })
})

test("Flash image uses the native card without preflight providers or native fallback", () => {
  const route = readFileSync("lib/media/generate-photo-route.ts", "utf8")
  const dashboard = readFileSync("components/sovereign/dashboard.tsx", "utf8")
  const implementation = readFileSync("lib/server/malik-flash-media.ts", "utf8")
  assert.match(route, /flashRequested = body\?\.chatModelId === "malik-flash"/u)
  assert.match(route, /if \(flashRequested\) \{[\s\S]*?return Response.json\([\s\S]*?catch \(error\) \{[\s\S]*?return Response.json\(/u)
  assert.match(route, /await recordImageCreditUsage\(user.userId, imageSize\)/)
  assert.match(dashboard, /else if \(inlineMediaKind === "image" && !flashImageRequest\)/)
  assert.match(dashboard, /finalizeInlineMedia\(readyMedia\)/)
  assert.match(implementation, /canReadFlashAsset\(account.userId, turn.chatId, requested\)/)
  assert.match(implementation, /operation: editing \? "edit" : "generate", parentId/)
  assert.match(implementation, /generatorProvider: provider/)
})
