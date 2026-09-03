import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const root = process.cwd()
const asset = path.join(root, "public/images/malik-mobile-home-exact-8k.avif")
const css = await readFile(path.join(root, "app/mobile-exact-reference-final.css"), "utf8")
const topBar = await readFile(path.join(root, "components/sovereign/TitanTopBar.tsx"), "utf8")
const dashboard = await readFile(path.join(root, "components/sovereign/dashboard.tsx"), "utf8")
const legacyRoute = await readFile(path.join(root, "app/api/mobile-home-exact/route.ts"), "utf8")
const visualTest = await readFile(path.join(root, "app/visual-test/mobile/page.tsx"), "utf8")

await access(asset)
const metadata = await sharp(asset).metadata()

assert.equal(metadata.format, "heif", "mobile artwork must be a real AVIF image")
assert.equal(metadata.compression, "av1", "mobile artwork must use AV1 compression")
assert.equal(metadata.width, 4470, "mobile artwork width changed")
assert.equal(metadata.height, 7680, "mobile artwork height changed")
assert.match(css, /malik-mobile-home-exact-8k\.avif\?v=2/)
assert.match(css, /background-size:\s*contain\s*!important/)
assert.match(css, /\.titan-mobile-signin/)
assert.match(css, /z-index:\s*2147483646\s*!important/)
assert.match(css, /pointer-events:\s*auto\s*!important/)
assert.match(topBar, /guestMode\s*\?\s*\(/)
assert.match(topBar, /data-testid="mobile-guest-signin"/)
assert.match(topBar, /href="\/sign-in"/)
assert.match(dashboard, /guestMode=\{guestMode\}/)
assert.match(legacyRoute, /malik-mobile-home-exact-8k\.avif\?v=2/)
assert.match(visualTest, /width="430"/)
assert.match(visualTest, /height="739"/)
assert.match(visualTest, /src="\/guest"/)

console.log("PASS mobile guest home: exact 4470x7680 artwork + visible, clickable sign-in control")
