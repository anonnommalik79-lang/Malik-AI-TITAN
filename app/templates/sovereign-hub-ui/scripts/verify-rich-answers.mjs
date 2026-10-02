import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8")
const gallery = read("components/sovereign/MalikVisualGallery.tsx")
const route = read("app/api/chat/reference-images/route.ts")
const catalog = read("lib/media/reference-catalog.ts")
const cache = read("lib/media/client-reference-cache.ts")
const markdown = read("components/sovereign/MalikMarkdown.tsx")
const chat = read("components/sovereign/chat-view.tsx")

function check(title, action) {
  action()
  console.log("PASS", title)
}

check("Gallery only displays approved HTTPS image hosts and refuses data/unsafe links", () => {
  assert.match(catalog, /url\.protocol === "https:"/)
  assert.match(catalog, /IMAGE_HOSTS\.has\(url\.hostname\.toLowerCase\(\)\)/)
  assert.match(catalog, /!url\.username && !url\.password/)
  assert.match(gallery, /loading="lazy"/)
  assert.match(gallery, /onError=\{\(\) => setFailed\(true\)\}/)
})
check("Images are real catalog results with attribution, not invented or charged generation", () => {
  assert.match(route, /api\.unsplash\.com\/search\/photos/)
  assert.match(catalog, /commons\.wikimedia\.org\/w\/api\.php/)
  assert.match(route, /UNSPLASH_ACCESS_KEY/)
  assert.match(catalog, /sourceUrl: media\.descriptionurl/)
  assert.match(route, /return NextResponse\.json\(\{ images \}/)
  assert.doesNotMatch(route, /\/api\/ai\/image|\/api\/generate\/video|base64/i)
})
check("Markdown image rows render as galleries alongside existing code and tables", () => {
  assert.match(markdown, /function parseImageLine\(/)
  assert.match(markdown, /isSafeVisualUrl\(match\[2\]\)/)
  assert.match(markdown, /kind: "images"; images: MalikVisualImage\[\]/)
  assert.match(markdown, /!parseImageLine\(lines\[index\]\)/)
  assert.match(markdown, /<MalikVisualGallery key=\{key\}/)
  assert.match(chat, /allowImages=\{false\}/)
  assert.match(markdown, /<CodeBlock key=\{key\}/)
})
check("Chat loads relevant references directly alongside streamed text and keeps history lazy", () => {
  assert.match(gallery, /return isReferenceImageRequest\(question\)/)
  assert.match(gallery, /export function wantsReferenceImages/)
  assert.match(chat, /!isUser && !olderVersion && !message\.generatedMedia/)
  assert.match(chat, /<MalikReferenceImages question=\{question\}/)
  assert.match(cache, /current\.controller\.abort\(\)/)
  assert.match(gallery, /IntersectionObserver/)
  assert.doesNotMatch(gallery, /fetch\("\/api\/chat\/reference-images/)
  assert.match(gallery, /<MalikVisualGallery title=\{plan\.topic\}/)
})
console.log("Rich visual answer integration verified.")
