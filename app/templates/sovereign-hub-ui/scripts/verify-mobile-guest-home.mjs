import assert from "node:assert/strict"
import { access, readFile, stat } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const root = process.cwd()
const asset = path.join(root, "public/images/malik-mobile-cinematic-v2.webp")
const css = await readFile(path.join(root, "app/mobile-unicorn-home-final.css"), "utf8")
const topBar = await readFile(path.join(root, "components/sovereign/TitanTopBar.tsx"), "utf8")
const dashboard = await readFile(path.join(root, "components/sovereign/dashboard.tsx"), "utf8")
const home = await readFile(path.join(root, "components/sovereign/hybrid/MalikHybridHome.tsx"), "utf8")

await access(asset)
const metadata = await sharp(asset).metadata()

assert.equal(metadata.format, "webp", "mobile uses the optimized portrait")
assert.ok((await stat(asset)).size < 500_000, "mobile hero should fit the transfer budget")
await access(path.join(root, "public/images/malik-mobile-cinematic-portrait.png"))
assert.equal(metadata.width, 941, "mobile portrait width changed")
assert.equal(metadata.height, 1672, "mobile portrait height changed")
assert.match(css, /@import "\.\/mobile-unicorn-home-v5\.css"/)
assert.match(css, /malik-mobile-cinematic-v2\.webp/)
assert.match(css, /background-size:\s*100% 100%, cover\s*!important/)
assert.match(css, /\.titan-mobile-signin/)
assert.match(css, /\.thome-mobile-exact-layer/)
assert.match(topBar, /data-testid="mobile-guest-signin"/)
assert.match(dashboard, /guestMode=\{guestMode\}/)
assert.match(home, /data-testid="mobile-exact-interactive-layer"/)
assert.match(home, /Создай изображение уровня мирового продукта/)
assert.match(home, /Проведи глубокое исследование/)

console.log("PASS mobile guest home: optimized full-resolution portrait; original PNG retained; no bitmap UI overlay")
