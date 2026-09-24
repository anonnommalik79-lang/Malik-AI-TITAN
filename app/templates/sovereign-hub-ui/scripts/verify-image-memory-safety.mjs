import assert from "node:assert/strict"
import fs from "node:fs"

const route = fs.readFileSync("lib/media/generate-photo-route.ts", "utf8")
const history = fs.readFileSync("lib/media/image-history.ts", "utf8")
const post = fs.readFileSync("lib/media/image-postprocess.ts", "utf8")
const effects = fs.readFileSync("lib/media/image-effects.ts", "utf8")
const watermark = fs.readFileSync("lib/media/malik-watermark.ts", "utf8")
const videoStudio = fs.readFileSync("components/sovereign/video-generation/VideoGenerationStudio.tsx", "utf8")
const preview = fs.readFileSync("lib/media/image-display-preview.ts", "utf8")
const capacity = fs.readFileSync("lib/media/image-processing-capacity.ts", "utf8")
const cloudUpload = fs.readFileSync("lib/storage/cloud-upload.ts", "utf8")
const quality = fs.readFileSync("lib/media/image-quality-presets.ts", "utf8")
const resultExperience = fs.readFileSync("components/sovereign/ImageResultExperience.tsx", "utf8")
const studio = fs.readFileSync("components/sovereign/photo-generation/PhotoGenerationStudio.tsx", "utf8")
const resultCss = fs.readFileSync("app/image-result-experience.css", "utf8")
const quotaGuard = fs.readFileSync("components/sovereign/ChatHistoryQuotaGuard.tsx", "utf8")
const motion = fs.readFileSync("components/sovereign/image-generation-motion.tsx", "utf8")
const layout = fs.readFileSync("app/layout.tsx", "utf8")

// A durable high-resolution result must not be duplicated as a base64 fallback in response JSON.
assert.equal(/inlineImageUrl\s*:/.test(route), false, "photo route must not return duplicate inlineImageUrl")
assert.match(route, /durable\s*=\s*Boolean\(storageUrl\)/, "route must expose cloud durable state")

// Quality is not the performance tradeoff. The default master stays Ultra 8K;
// the browser gets a separate 1600px BRANDED display derivative and download
// resolves back to the branded master/fallback.
assert.match(quality, /DEFAULT_MALIK_IMAGE_QUALITY:\s*MalikImageQuality\s*=\s*["']ultra8k["']/, "default image master must remain Ultra 8K")
assert.match(preview, /MALIK_IMAGE_DISPLAY_PREVIEW_LONG_EDGE\s*=\s*1600/, "chat preview must stay bounded")
assert.match(preview, /sourceUrl/, "preview helper must still support provider-native fallback")
assert.match(preview, /withoutEnlargement:\s*true/, "preview must never upscale small originals")
assert.match(route, /buffer:\s*delivered\.buffer/, "photo route must feed final branded pixels into preview creation")
assert.match(route, /masterUrl:\s*publicMasterUrl/, "API must expose the branded master/fallback")
assert.match(route, /url:\s*displayUrl/, "chat must receive the lightweight display URL")
assert.match(route, /previewUrl,/, "API must expose the display derivative")
assert.match(route, /#malik-master=/, "display URL must carry a master download reference")
assert.match(resultExperience, /function masterImageUrl/, "result tools must resolve the master URL")
assert.match(resultExperience, /fullQualitySrc\s*=\s*masterImageUrl\(src\)/, "downloads must use full quality")
// The Photo Generation studio was replaced by the Voltframe teaser - the panel
// deliberately renders one picture and calls no API at all, so there is nothing
// left in it to paint a derivative. The contract it used to consume is still
// guarded above, on the route that produces it.
assert.match(studio, /data-view="photo-generation"/, "the photo-generation panel must still be the one the dashboard mounts")
assert.equal(/fetch\(|previewUrl/.test(studio), false, "the teaser must not call the generation API")
// Both of these described code inside the studio that no longer exists. The
// master/derivative contract itself is still guarded, on the route that hands
// the two URLs out and on the result tools that resolve the master for a
// download - see the assertions above.

// Full-quality post-processing is gated by host capacity instead of lowering resolution.
assert.match(route, /withMalikImageProcessingSlot/, "8K delivery must use the capacity gate")
assert.match(capacity, /IMAGE_POSTPROCESS_CONCURRENCY/, "capacity should be operator-tunable")
assert.match(capacity, /HOST_MEMORY_GIB\s*>=\s*24[\s\S]*return 3/, "large hosts should be allowed more delivery concurrency")
assert.match(capacity, /const next = state\.waiters\.shift\(\)[\s\S]*if \(next\)[\s\S]*queueMicrotask\(next\)[\s\S]*return/, "queued work must receive a slot directly without an oversubscription race")

// Generated account media must leave Render memory through object storage and never
// be persisted to the service's ephemeral local filesystem.
assert.match(route, /isCloudStorageConfigured, uploadMediaAsset/, "photo route must use object storage")
assert.match(route, /uploadMediaAsset\(\{[\s\S]*buffer:\s*delivered\.buffer[\s\S]*kind:\s*["']image["']/, "generated masters must upload directly to object storage")
assert.match(route, /uploadMediaAsset\(\{[\s\S]*buffer:\s*displayPreview\.buffer[\s\S]*kind:\s*["']image["']/, "generated previews must upload directly to object storage")
assert.equal(/saveMediaAssetAsync\(/.test(route), false, "photo route must not persist generated media on Render local disk")
assert.match(cloudUpload, /MAX_MEDIA_BYTES\s*=\s*64\s*\*\s*1024\s*\*\s*1024/, "cloud upload must accept large 16K masters")
assert.match(cloudUpload, /PutObjectCommand/, "cloud upload must persist media through S3-compatible storage")
assert.match(cloudUpload, /users\/\$\{owner\}\/\$\{kind\}\//, "cloud objects must be partitioned by account owner")
assert.match(cloudUpload, /publicBaseUrl/, "cloud upload must return short public CDN URLs")

// Sharp must keep the high-resolution master as bytes until persistence.
assert.equal(/data\.toString\(["']base64["']\)/.test(post), false, "post-process must not eagerly base64 encode output")
assert.match(post, /buffer:\s*data/, "post-process must hand the processed buffer to persistence")

// Signature finish: new generations default to Malik Aura X without spending a
// second model request. Edits stay neutral unless an effect is explicitly asked for.
assert.match(effects, /DEFAULT_MALIK_IMAGE_EFFECT:\s*MalikImageEffectId\s*=\s*["']malik-aura-x["']/, "Aura X must be the generated-image default")
assert.match(route, /editing\s*\?\s*["']off["']\s*:\s*defaultGeneratedEffect/, "image edits must preserve exact pixels by default")
assert.match(post, /pipeline\.modulate\(\{[\s\S]*brightness:\s*effect\.brightness[\s\S]*saturation:\s*effect\.saturation/, "Aura must run as real Sharp color grading")
assert.match(route, /effectApplied:\s*delivered\.effectApplied/, "API must report the applied image effect")
assert.match(route, /displayPreview\s*=\s*delivered\.buffer\?\.length[\s\S]*createMalikImageDisplayPreview\(\{[\s\S]*buffer:\s*delivered\.buffer/, "every chat preview must be rendered from final effected + watermarked pixels")

// Malik branding must survive downloads for generated photos and stay visible
// over generated video players without exposing provider branding in the result.
assert.match(watermark, /Malik AI/, "watermark must carry the Malik AI wordmark")
assert.match(watermark, /M0 68 60 8v60H0Z/, "watermark must use the approved two-triangle Malik mark")
assert.match(post, /pipeline\.composite\(\[\{[\s\S]*createMalikImageWatermarkSvg\(finalWidth\)[\s\S]*gravity:\s*"southeast"/, "generated image bytes must contain the Malik watermark")
assert.match(videoStudio, /function MalikMediaWatermark/, "video results must render the Malik watermark")
assert.match(videoStudio, /<svg viewBox="0 0 100 58"/, "video watermark must use an inline Malik logo so it cannot disappear")
assert.match(videoStudio, /className="mv2__result-frame"[\s\S]*<MalikMediaWatermark \/>/, "desktop video watermark must be inside the fitted video frame")
assert.match(videoStudio, /\.malik-media-watermark\{[^}]*left:18px;right:auto;bottom:16px/, "desktop video watermark must sit at the bottom-left of the video")
assert.match(videoStudio, /\.malik-media-watermark\.is-compact\{[^}]*left:10px;right:auto;bottom:10px/, "mobile video watermark must sit at the bottom-left of the video")
assert.match(videoStudio, /videoUrl \? "Malik Video" : selectedModel\.name/, "finished video metadata must show Malik branding instead of the provider")

// Browser image history is metadata only. Old data:/blob: entries are rejected,
// oversized snapshots are compacted, and duplicate cards are a no-op.
assert.match(history, /\^\(\?:data\|blob\):/i, "history must reject data/blob references")
assert.match(history, /raw\.length\s*>\s*1_500_000/, "history must self-heal oversized legacy snapshots")
assert.match(history, /safe\s*=\s*safe\.slice\(0,\s*80\)/, "history should shrink itself before competing with chat storage")
assert.match(history, /existing\s*&&[\s\S]*existing\.src\s*===\s*src[\s\S]*return existing/, "re-inspecting an identical ready card must not rewrite localStorage")

// If the origin quota is still full, protect the last complete chat snapshot.
assert.match(quotaGuard, /DASHBOARD_STORAGE_KEY\s*=\s*["']malik_dashboard_state_v3["']/, "quota guard must target dashboard storage only")
assert.match(quotaGuard, /DISPOSABLE_MEDIA_KEYS/, "quota guard should reclaim disposable media first")
assert.match(quotaGuard, /preserved previous complete snapshot/, "quota guard must preserve the previous full snapshot on hard quota exhaustion")
assert.match(layout, /<ChatHistoryQuotaGuard\s*\/>/, "quota guard must mount before dashboard persistence effects")

// Image generation should not show the white assistant avatar or expensive fog blur.
assert.match(resultCss, /:has\(\.malik-photo-motion\)[\s\S]*\.malik-ai-avatar\.is-working[\s\S]*display:\s*none/i, "image streaming avatar must be hidden")
assert.match(resultCss, /\.malik-photo-motion \.malik-art-result[\s\S]*filter:\s*none\s*!important/i, "high-quality reveal must be crisp")

// The in-chat waiting UI stays bounded and becomes completely idle when finished.
assert.equal(/CYCLE_MS|MAX_CYCLES|setCycle\(/.test(motion), false, "photo waiting UI must not run remount cycles")
// The heavy stack was an animated inline SVG scene plus a full-screen fog blur.
// A bare /<svg/ also matched the 44px Malik mark beside the card's title, and a
// bare /blur\(/ matched a 3px transition, neither of which costs anything. The
// scene itself stays banned: no named rig, no SVG filter, no SVG animation, no
// large blur, and no room for a scene to grow back unnoticed.
assert.equal(/malik-coded-hand|malik-spray-rig|feGaussianBlur|<animate/i.test(motion), false, "photo waiting UI must not render the old heavy SVG/fog stack")
for (const [, radius] of motion.matchAll(/blur\((\d+(?:\.\d+)?)px\)/gi)) {
  assert.ok(Number(radius) < 8, `photo waiting UI must not run a heavy blur: blur(${radius}px)`)
}
assert.ok((motion.match(/<svg/gi) || []).length <= 2, "photo waiting UI must stay free of an inline SVG scene")
assert.match(motion, /if\s*\(imageLoaded\s*\|\|\s*actuallyFailed\)\s*return[\s\S]*setInterval\(tick,\s*1000\)/, "finished cards must stop timers and active cards must update at 1 Hz")
// `\\.` inside a regex literal is a literal backslash, not an escaped dot, so
// both of these could never match the paths they were written for and failed
// against the very GIFs they were added to protect.
assert.match(motion, /malik-image-loading-mobile-final\.gif/, "mobile waiting scene must use the approved Malik GIF")
assert.match(motion, /malik-image-loading-pc-final\.gif/, "desktop waiting scene must use the approved Malik GIF")
assert.match(motion, /<source media="\(max-width: 640px\)"/, "waiting scene must switch between mobile and desktop GIFs")
assert.equal(/<canvas|requestAnimationFrame|ResizeObserver/.test(motion), false, "GIF waiting scene must stay browser-native and avoid canvas animation work")
assert.match(motion, /loadImage\(resolvedResultUrl\)[\s\S]*setImageLoaded\(true\)/, "final display image should decode once and hand off immediately")
assert.equal(/finalImage|lastFinalUrl|finalUrlRef/.test(motion), false, "finished image must not be redrawn through the canvas reveal")
assert.match(motion, /data-malik-image-ready=\{imageLoaded \? "1" : "0"\}/, "ready state must remain compatible with result tools")

// Result enhancement must not rescan every photo whenever an unrelated class changes.
assert.equal(/new MutationObserver\(\(\)\s*=>\s*enhanceAll\(\)\)/.test(resultExperience), false, "result observer must be mutation-targeted")
assert.match(resultExperience, /const pending = new Set<HTMLElement>\(\)/, "result work must be frame-batched")
assert.match(resultExperience, /malikRememberedSrc/, "ready cards must not re-read history repeatedly")

console.log("Malik image quality + cloud persistence + memory + main-thread safety: OK")
