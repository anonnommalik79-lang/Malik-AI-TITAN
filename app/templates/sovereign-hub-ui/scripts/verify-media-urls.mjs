import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

/**
 * Regression guard for the endless photo-generation animation.
 *
 * The chat card used to reject every URL containing "/api/". Production photos
 * come back from the Flask backend as "/api/storage/photos/<file>", so a
 * finished generation was never recognised as an image: the card kept looping
 * its sketch animation, and a reload replayed that same template drawing
 * instead of the result.
 */

async function loadModule(file) {
  const source = fs.readFileSync(file, "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import(`data:text/javascript,${encodeURIComponent(outputText)}`)
}

const { isImageLikeUrl, isRealVideoUrl, isJobStatusUrl, isMediaFileRoute } = await loadModule("lib/media/media-url.ts")

// A finished file must render.
for (const url of [
  "/api/storage/photos/pollinations_1770000000_ab12cd34.jpg",
  "/api/storage/photos/cloudflare_1770000000_ab12cd34.png",
  "/api/storage/photos/openai_1770000000_abcdef.webp",
  "/api/media/asset/7d94742a-103c-4b69-b9de-24f0ca518c4e",
  "https://malik.ai/api/media/asset/7d94742a-103c-4b69-b9de-24f0ca518c4e",
  "https://cdn.example.com/generated/result.png",
  "data:image/png;base64,AAAA",
  "malik-image://8f0c",
]) {
  assert.equal(isImageLikeUrl(url), true, `Finished image must render: ${url}`)
}

// A progress endpoint must never be mistaken for the picture.
for (const url of [
  "/api/ai/job/9f1c2f0e",
  "/api/generate/video/status?jobId=abc",
  "/api/media/status",
  "/api/ai/image",
  "/api/generate/photo",
  "",
  "not-a-url",
]) {
  assert.equal(isImageLikeUrl(url), false, `Status endpoint must not render as an image: ${url}`)
}

assert.equal(isJobStatusUrl("/api/ai/job/abc"), true, "Flask job route is a status URL")
assert.equal(isMediaFileRoute("/api/storage/photos/a.png"), true, "Flask photo route serves one file")
assert.equal(isMediaFileRoute("/api/storage/photos/"), false, "A bare directory is not a file")

assert.equal(isRealVideoUrl("https://s3.example.com/out/output.mp4"), true, "Rendered mp4 must play")
assert.equal(isRealVideoUrl("blob:https://app/abc"), true, "Blob video must play")
assert.equal(isRealVideoUrl("/api/ai/video/status?jobId=x"), false, "Video status is not a video")
assert.equal(isRealVideoUrl("/api/storage/photos/a.png"), false, "A photo is not a video")

// The card must always be able to reach a terminal state.
const motion = fs.readFileSync("components/sovereign/image-generation-motion.tsx", "utf8")
assert.match(motion, /GENERATION_WATCHDOG_MS/, "Photo card must keep a hard watchdog")
assert.equal(motion.includes("setCycle"), false, "Photo animation must not remount a heavy scene in a loop")
assert.match(motion, /will-change:\s*transform/, "Photo animation should stay on the compositor")
assert.equal(motion.includes("malik-coded-hand"), false, "Heavy hand SVG animation must stay removed")
assert.match(motion, /status === "ready" && !resultUrl/, "A finished job with no file must end as an error")

// Raw image bytes must never reach localStorage.
const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
assert.match(dashboard, /function stripInlineMediaBytes/, "Inline bytes must be stripped before saving state")
assert.match(dashboard, /function persistDashboardState/, "State save must survive a full storage quota")
assert.match(dashboard, /function settleStaleInlineMedia/, "A restored card must never resume a dead generation")
assert.equal(
  dashboard.includes("safeSetStorage(DASHBOARD_STORAGE_KEY, JSON.stringify("),
  false,
  "Dashboard state must go through the quota-aware writer",
)

// The image route must hand back one short durable URL whenever persistence works.
// It must not duplicate the same 2K bytes into an inlineImageUrl response field.
const photoRoute = fs.readFileSync("lib/media/generate-photo-route.ts", "utf8")
assert.match(photoRoute, /saveMediaAsset/, "Generated photos must be stored durably server-side")
assert.match(photoRoute, /storageUrl \|\| assetUrl \|\| finalInlineUrl/, "Durable URLs must win over the last-resort inline result")
assert.equal(/inlineImageUrl\s*:/.test(photoRoute), false, "A durable image must not carry a duplicate base64 fallback")

const assetStore = fs.readFileSync("lib/media/asset-store.ts", "utf8")
assert.match(assetStore, /\(\?:;\[\^,\]\*\)\*/, "Data URL parser must accept provider parameters such as charset")
assert.match(assetStore, /isBase64/, "Parameterized base64 data URLs must still decode as bytes")
assert.equal(
  fs.readFileSync("lib/media/providers/cloudflare-image-prepared.ts", "utf8").includes("charset=utf-8;base64"),
  false,
  "Cloudflare image bytes should use a canonical data URL",
)

console.log("✅ media URL + photo card regression checks passed")
