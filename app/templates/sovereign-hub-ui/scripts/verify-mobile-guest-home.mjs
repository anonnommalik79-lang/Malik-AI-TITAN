import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const root = process.cwd()
const asset = path.join(root, "public/images/malik-mobile-cinematic-portrait.png")
const css = await readFile(path.join(root, "app/mobile-unicorn-home-final.css"), "utf8")
const topBar = await readFile(path.join(root, "components/sovereign/TitanTopBar.tsx"), "utf8")
const dashboard = await readFile(path.join(root, "components/sovereign/dashboard.tsx"), "utf8")
const home = await readFile(path.join(root, "components/sovereign/hybrid/MalikHybridHome.tsx"), "utf8")

await access(asset)
const metadata = await sharp(asset).metadata()

assert.equal(metadata.format, "png", "mobile portrait must preserve the supplied lossless PNG")
assert.equal(metadata.width, 941, "mobile portrait width changed")
assert.equal(metadata.height, 1672, "mobile portrait height changed")
assert.match(css, /@import "\.\/mobile-unicorn-home-v5\.css"/)
assert.match(css, /malik-mobile-cinematic-portrait\.png\?v=1/)
assert.match(css, /background-size:\s*100% 100%, cover\s*!important/)
assert.match(css, /\.titan-mobile-signin/)
assert.match(css, /\.thome-mobile-exact-layer/)
assert.match(topBar, /data-testid="mobile-guest-signin"/)
assert.match(dashboard, /guestMode=\{guestMode\}/)
assert.match(home, /data-testid="mobile-exact-interactive-layer"/)
assert.match(home, /Создай изображение уровня мирового продукта/)
assert.match(home, /Проведи глубокое исследование/)

console.log("PASS mobile guest home: original live V5 layout + lossless portrait + hidden exact layer/sign-in")
