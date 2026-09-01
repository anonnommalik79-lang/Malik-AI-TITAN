import assert from "node:assert/strict"
import fs from "node:fs"

const route = fs.readFileSync("lib/media/generate-photo-route.ts", "utf8")
const history = fs.readFileSync("lib/media/image-history.ts", "utf8")
const post = fs.readFileSync("lib/media/image-postprocess.ts", "utf8")
const resultCss = fs.readFileSync("app/image-result-experience.css", "utf8")
const quotaGuard = fs.readFileSync("components/sovereign/ChatHistoryQuotaGuard.tsx", "utf8")
const motion = fs.readFileSync("components/sovereign/image-generation-motion.tsx", "utf8")
const layout = fs.readFileSync("app/layout.tsx", "utf8")

// A durable 2K result must not be duplicated as a base64 fallback in response JSON.
assert.equal(/inlineImageUrl\s*:/.test(route), false, "photo route must not return duplicate inlineImageUrl")
assert.match(route, /durable\s*=\s*Boolean\(storageUrl \|\| assetUrl\)/, "route must expose durable state")

// Sharp must keep the 2K master as bytes until persistence; eagerly creating a
// data URI adds ~33% and creates huge JS strings before the browser even sees it.
assert.equal(/data\.toString\(["']base64["']\)/.test(post), false, "post-process must not eagerly base64 encode 2K output")
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
assert.match(resultCss, /\.malik-photo-motion \.malik-art-result[\s\S]*filter:\s*none\s*!important/i, "2K reveal must be crisp")

// The in-chat waiting UI must stay tiny. The old component remounted a large SVG
// scene every 7.2 seconds; after several cycles Chromium could stop responding.
assert.equal(/CYCLE_MS|MAX_CYCLES|setCycle\(/.test(motion), false, "photo waiting UI must not run remount cycles")
assert.equal(/<svg|malik-coded-hand|malik-spray-rig|blur\(/i.test(motion), false, "photo waiting UI must not render the old heavy SVG/fog stack")
assert.match(motion, /setInterval\([\s\S]*1000\)/, "photo progress updates should be capped to one tick per second")
assert.match(motion, /data-malik-image-ready=\{imageLoaded \? "1" : "0"\}/, "ready state must remain compatible with result tools")

console.log("Malik image memory + chat history + main-thread safety: OK")
