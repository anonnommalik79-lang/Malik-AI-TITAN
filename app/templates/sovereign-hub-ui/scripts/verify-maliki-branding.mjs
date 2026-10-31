import assert from "node:assert/strict"
import fs from "node:fs"

const read = (file) => fs.readFileSync(file, "utf8")
const icon = read("public/brand/malik-mark.svg")
const photo = read("lib/media/malik-watermark.ts")
const pipeline = read("lib/media/image-postprocess.ts")
const photoRoute = read("lib/media/generate-photo-route.ts")
const work = read("lib/os/runtime.ts")
const worker = read("../../../services/malikvideo-worker/app.py")
const studio = read("components/sovereign/video-generation/VideoGenerationStudio.tsx")
const exportClient = read("lib/media/browser-video-branding.ts")
const sourceRoute = read("app/api/media/video/brand-source/route.ts")

for (const path of ["M4 53 46 11v42H4Z", "M55 11h41L55 53V11Z"]) {
  assert(icon.includes(path), "official logo path changed: " + path)
  assert(studio.includes(path), "video preview mark must use the official geometry")
  assert(exportClient.includes(path), "video encoded frames must use the official geometry")
}
// Generated photos use the explicitly requested uppercase wordmark. Video
// geometry and encoding contracts above/below remain unchanged.
assert.match(photo, /<title>MALIK AI<\/title>/, "photo mark must be the exact MALIK AI wordmark")
assert.match(photo, /fill-opacity="0\.60"/, "photo opacity must be 60 percent")
assert.match(photo, /left: width - marginX - markWidth/, "photo wordmark must be bottom-right")
assert.match(pipeline, /await applyMalikImageWatermark\(pipeline, bytes\.buffer, metadata, finalWidth, finalHeight\)/)
assert.doesNotMatch(photoRoute, /if \(directDelivery && \^https:/, "direct-provider photos must not bypass logo stamping")
assert.match(work, /return persistBrandedWorkImage\(/, "Work photo results must be branded")
assert.match(worker, /stamp_official_malik_icon\(source,/)
assert.match(worker, /stamp_official_malik_icon\(restored, final, audio_source=source\)/)
assert.match(worker, /libx264/, "worker must permanently encode the watermark")
assert.match(sourceRoute, /getVideoJob\(taskId, user\.userId\)/, "source stream must enforce ownership")
assert.match(sourceRoute, /redirect: "manual"/, "re-check provider redirects")
assert.match(exportClient, /canvas\.captureStream\(30\)/)
assert.match(exportClient, /new MediaRecorder\(mediaStream/)
assert.match(studio, /await exportBrandedMalikVideo\(readyTaskId\)/)
assert.match(studio, /Never silently download an unwatermarked original/)
console.log("Official Malik photo/video branding contract: OK")
