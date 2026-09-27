import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")

const guard = read("lib/server/render-bandwidth.ts")
const musicFile = read("app/api/media/music/file/route.ts")
const musicDownload = read("app/api/media/music/download/route.ts")
const h3 = read("app/api/media/video/h3-content/route.ts")
const veo = read("app/api/ai/video/file/route.ts")
const nova = read("app/api/generate/video/status/route.ts")

assert.match(guard, /MALIK_RENDER_BANDWIDTH_GUARD/)
assert.match(guard, /MALIK_RENDER_MAX_RESPONSE_BYTES/)
assert.match(guard, /900_000/)
assert.doesNotMatch(musicFile, /new Response\(upstream\.body/)
assert.doesNotMatch(musicDownload, /new Response\(upstream\.body/)
assert.match(musicFile, /Response\.redirect/)
assert.match(musicDownload, /Response\.redirect/)
assert.match(h3, /renderVideoBandwidthGuard|MALIK_VIDEO_RENDER_BANDWIDTH_GUARD/)
assert.match(veo, /renderVideoBandwidthGuard|MALIK_VIDEO_RENDER_BANDWIDTH_GUARD/)
assert.match(nova, /renderVideoBytes:\s*0|provider-direct-browser|direct/i)

console.log("✓ Render heavy-media bandwidth guard verified")
