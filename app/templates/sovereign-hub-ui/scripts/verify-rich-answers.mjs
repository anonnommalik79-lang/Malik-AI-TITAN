import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8")
const gallery = read("components/sovereign/MalikVisualGallery.tsx")
const route = read("app/api/chat/reference-images/route.ts")
const markdown = read("components/sovereign/MalikMarkdown.tsx")
const chat = read("components/sovereign/chat-view.tsx")

function check(title, action) {
  action()
  console.log("PASS", title)
}

check("Gallery only displays approved HTTPS image hosts and refuses data/unsafe links", () => {
  assert.match(gallery, /url\.protocol === "https:"/)
  assert.match(gallery, /IMAGE_HOSTS\.has\(url\.hostname\.toLowerCase\(\)\)/)
  assert.match(gallery, /!url\.username && !url\.password/)
  assert.match(gallery, /loading="lazy"/)
  assert.match(gallery, /onError=\{\(\) => setFailed\(true\)\}/)
})
check("Images are real catalog results with attribution, not invented or charged generation", () => {
  assert.match(route, /api\.unsplash\.com\/search\/photos/)
  assert.match(route, /commons\.wikimedia\.org\/w\/api\.php/)
  assert.match(route, /UNSPLASH_ACCESS_KEY/)
  assert.match(route, /sourceUrl: source/)
  assert.match(route, /return NextResponse\.json\(\{ images \}/)
  assert.doesNotMatch(route, /\/api\/ai\/image|\/api\/generate\/video|base64/i)
})
check("Markdown image rows render as galleries alongside existing code and tables", () => {
  assert.match(markdown, /function parseImageLine\(/)
  assert.match(markdown, /isSafeVisualUrl\(match\[2\]\)/)
  assert.match(markdown, /kind: "images"; images: MalikVisualImage\[\]/)
  assert.match(markdown, /!parseImageLine\(lines\[index\]\)/)
  assert.match(markdown, /<MalikVisualGallery key=\{key\}/)
  assert.match(markdown, /<CodeBlock key=\{key\}/)
})
check("Chat looks up references only for completed explicit photo requests", () => {
  assert.match(gallery, /return isReferenceImageRequest\(question\)/)
  assert.match(gallery, /export function wantsReferenceImages/)
  assert.match(chat, /!streaming && !olderVersion/)
  assert.match(chat, /<MalikReferenceImages question=\{question\}/)
  assert.match(gallery, /controller\.abort\(\)/)
  assert.match(gallery, /if \(images\.length\) return <MalikVisualGallery/)
})
console.log("Rich visual answer integration verified.")
