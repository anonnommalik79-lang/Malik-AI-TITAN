import assert from "node:assert/strict"
import fs from "node:fs"

const route = fs.readFileSync("lib/media/generate-photo-route.ts", "utf8")
const history = fs.readFileSync("lib/media/image-history.ts", "utf8")
const post = fs.readFileSync("lib/media/image-postprocess.ts", "utf8")
const preview = fs.readFileSync("lib/media/image-display-preview.ts", "utf8")
const capacity = fs.readFileSync("lib/media/image-processing-capacity.ts", "utf8")
const quality = fs.readFileSync("lib/media/image-quality-presets.ts", "utf8")
const resultExperience = fs.readFileSync("components/sovereign/ImageResultExperience.tsx", "utf8")
const studio = fs.readFileSync("components/sovereign/photo-generation/PhotoGenerationStudio.tsx", "utf8")
const resultCss = fs.readFileSync("app/image-result-experience.css", "utf8")
const quotaGuard = fs.readFileSync("components/sovereign/ChatHistoryQuotaGuard.tsx", "utf8")
const motion = fs.readFileSync("components/sovereign/image-generation-motion.tsx", "utf8")
const layout = fs.readFileSync("app/layout.tsx", "utf8")

// A durable high-resolution result must not be duplicated as a base64 fallback in response JSON.
assert.equal(/inlineImageUrl\s*:/.test(route), false, "photo route must not return duplicate inlineImageUrl")
assert.match(route, /durable\s*=\s*Boolean\(storageUrl \|\| assetUrl\)/, "route must expose durable state")

// Quality is not the performance tradeoff. The default master stays Ultra 8K;
// the browser gets a separate 1600px display derivative and download resolves
// back to the untouched master.
assert.match(quality, /DEFAULT_MALIK_IMAGE_QUALITY:\s*MalikImageQuality\s*=\s*["']ultra8k["']/, "default image master must remain Ultra 8K")
assert.match(preview, /MALIK_IMAGE_DISPLAY_PREVIEW_LONG_EDGE\s*=\s*1600/, "chat preview must stay bounded")
assert.match(preview, /sourceUrl/, "preview should prefer the provider-native render instead of re-decoding the 8K master")
assert.match(preview, /withoutEnlargement:\s*true/, "preview must never upscale small originals")
assert.match(route, /sourceUrl:\s*result\.imageUrl/, "photo route must feed the native render into preview creation")
assert.match(route, /masterUrl:\s*imageUrl/, "API must expose the untouched master")
assert.match(route, /url:\s*displayUrl/, "chat must receive the lightweight display URL")
assert.match(route, /previewUrl,/, "API must expose the display derivative")
assert.match(route, /#malik-master=/, "display URL must carry a master download reference")
assert.match(resultExperience, /function masterImageUrl/, "result tools must resolve the master URL")
assert.match(resultExperience, /fullQualitySrc\s*=\s*masterImageUrl\(src\)/, "downloads must use full quality")
assert.match(studio, /const displayUrl = data\.url \|\| data\.previewUrl \|\| data\.imageUrl/, "photo studio must paint the display derivative")
assert.match(studio, /const masterUrl = data\.masterUrl \|\| data\.imageUrl \|\| displayUrl/, "photo studio must preserve the full-resolution master")
assert.match(studio, /results\[0\]\?\.masterUrl \?\? results\[0\]\?\.url/, "explicit Canvas export should use the master")

// Full-quality post-processing is gated by host capacity instead of lowering
// resolution. Small machines queue heavy Sharp work; large machines may overlap
// a few jobs and an environment override can tune known hardware.
assert.match(route, /withMalikImageProcessingSlot/, "8K delivery must use the capacity gate")
assert.match(capacity, /IMAGE_POSTPROCESS_CONCURRENCY/, "capacity should be operator-tunable")
assert.match(capacity, /HOST_MEMORY_GIB\s*>=\s*24[\s\S]*return 3/, "large hosts should be allowed more delivery concurrency")
assert.match(capacity, /const next = state\.waiters\.shift\(\)[\s\S]*if \(next\)[\s\S]*queueMicrotask\(next\)[\s\S]*return/, "queued work must receive a slot directly without an oversubscription race")

// Sharp must keep the high-resolution master as bytes until persistence; eagerly creating a
// data URI adds ~33% and creates huge JS strings before the browser even sees it.
assert.equal(/data\.toString\(["']base64["']\)/.test(post), false, "post-process must not eagerly base64 encode output")
assert.match(post, /buffer:\s*data/, "post-process must hand the processed buffer to persistence")

// Browser image history is metadata only. Old data:/blob: entries are migrated out.
assert.match(history, /\^\(\?:data\|blob\):/i, "history must reject data/blob references")
assert.match(history, /raw\.length\s*>\s*750_000/, "history must self-heal oversized legacy snapshots")
assert.match(history, /slice\(0, 16\)/, "history should shrink itself before competing with chat storage")
assert.match(history, /Identical memories are now a true no-op/, "re-inspecting a ready card must not rewrite localStorage")

// If the origin quota is still full, protect the last complete chat snapshot
// instead of allowing dashboard.tsx to enter its legacy drop-old-chats loop.
assert.match(quotaGuard, /DASHBOARD_STORAGE_KEY\s*=\s*["']malik_dashboard_state_v3["']/, "quota guard must target dashboard storage only")
assert.match(quotaGuard, /DISPOSABLE_MEDIA_KEYS/, "quota guard should reclaim disposable media first")
assert.match(quotaGuard, /preserved previous complete snapshot/, "quota guard must preserve the previous full snapshot on hard quota exhaustion")
assert.match(layout, /<ChatHistoryQuotaGuard\s*\/>/, "quota guard must mount before dashboard persistence effects")

// Image generation should not show the white assistant avatar or expensive fog blur.
assert.match(resultCss, /:has\(\.malik-photo-motion\)[\s\S]*\.malik-ai-avatar\.is-working[\s\S]*display:\s*none/i, "image streaming avatar must be hidden")
assert.match(resultCss, /\.malik-photo-motion \.malik-art-result[\s\S]*filter:\s*none\s*!important/i, "high-quality reveal must be crisp")

// The in-chat waiting UI stays bounded and becomes completely idle when finished.
assert.equal(/CYCLE_MS|MAX_CYCLES|setCycle\(/.test(motion), false, "photo waiting UI must not run remount cycles")
assert.equal(/<svg|malik-coded-hand|malik-spray-rig|blur\(/i.test(motion), false, "photo waiting UI must not render the old heavy SVG/fog stack")
assert.match(motion, /if\s*\(imageLoaded\s*\|\|\s*actuallyFailed\)\s*return[\s\S]*setInterval\(tick,\s*1000\)/, "finished cards must stop timers and active cards must update at 1 Hz")
assert.match(motion, /now\s*-\s*lastFrameAt\s*<\s*32/, "canvas waiting scene must be capped near 30fps")
assert.match(motion, /loadImage\(resolvedResultUrl\)[\s\S]*setImageLoaded\(true\)/, "final display image should decode once and hand off immediately")
assert.equal(/finalImage|lastFinalUrl|finalUrlRef/.test(motion), false, "finished image must not be redrawn through the canvas reveal")
assert.match(motion, /data-malik-image-ready=\{imageLoaded \? "1" : "0"\}/, "ready state must remain compatible with result tools")

// Result enhancement must not rescan every photo whenever an unrelated class changes.
assert.equal(/new MutationObserver\(\(\)\s*=>\s*enhanceAll\(\)\)/.test(resultExperience), false, "result observer must be mutation-targeted")
assert.match(resultExperience, /const pending = new Set<HTMLElement>\(\)/, "result work must be frame-batched")
assert.match(resultExperience, /malikRememberedSrc/, "ready cards must not re-read history repeatedly")

console.log("Malik image quality + capacity + memory + main-thread safety: OK")
