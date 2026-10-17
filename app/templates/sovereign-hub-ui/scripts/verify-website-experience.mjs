import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import { workTestLoader } from "./work-test-loader.mjs"
const load = workTestLoader()
const { creativeBrief } = load("lib/website/engine/creative.ts")
const { sourceContext, boundedPrompt, MODEL_PROMPT_LIMIT, SOURCE_CONTEXT_LIMIT, websiteModelPolicy } = load("lib/website/engine/context.ts")
const { auditExperience } = load("lib/website/engine/experience.ts")
const { withMediaPolicy, stripMediaPolicy, MEDIA_POLICY_SCRIPT } = load("lib/website/engine/resources.ts")
const { discoverAssets, commonsLicense, MEDIA_LIMITS } = load("lib/website/engine/media.ts")
const { parseDesign, designRequest, requestedMedia } = load("lib/website/engine/design.ts")
const { withAssetCredits } = load("lib/website/engine/credits.ts")
const files = content => [{ path: "index.html", content: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${content}</body></html>` }]
const asset = { slot: "hero", kind: "image", url: "https://images.pexels.com/photo.jpg", source: "pexels", sourcePage: "https://www.pexels.com/photo/1/", credit: "Artist", license: "https://www.pexels.com/license/", mime: "image/jpeg", verifiedAt: "2026-10-17T00:00:00Z" }
const design = { direction: "hospitality", audience: "travellers", composition: "editorial", typography: "serif", palette: ["#fff", "#111"], spacing: "fluid", motion: "none", accessibility: ["keyboard"], performance: ["lazy"], stack: "static", sections: ["hero"], interactions: ["gallery"], files: [{ path: "index.html", purpose: "complete page" }], mediaQueries: [] }
const codes = (project, assets = []) => auditExperience(project, assets, design).errors.map(error => error.code)

test("creative direction is stable per project, diverse across identical briefs", () => {
  const one = creativeBrief("Create a resort website", "stable-id")
  assert.deepEqual(one, creativeBrief("Create a resort website", "stable-id"))
  const profiles = Array.from({ length: 100 }, (_, n) => creativeBrief("Create a resort website", `project-${n}`))
  assert.ok(new Set(profiles.map(profile => profile.id)).size > 80)
  assert.ok(new Set(profiles.map(profile => profile.hero)).size >= 7)
  assert.match(one.artDirection, /override/)
  assert.ok(one.constraints.some(rule => /Render/.test(rule)))
})
test("planning includes actual interfaces and persistent art direction, not rendered templates", () => {
  const request = designRequest("Build a hotel", [], creativeBrief("hotel", "one"))
  assert.match(request, /public exports/); assert.match(request, /PERSISTENT CREATIVE/)
  assert.match(request, /at most one autoplay/)
})
test("source context is bounded and does not silently truncate the focus file", () => {
  const source = Array.from({ length: 80 }, (_, n) => ({ path: `${n}.js`, content: `export const item${n}='${"x".repeat(20_000)}'` }))
  const result = sourceContext(source, ["79.js"])
  assert.ok(result.length <= SOURCE_CONTEXT_LIMIT)
  const parsed = JSON.parse(result)
  assert.equal(parsed.files[0].content, source[79].content)
  assert.ok(parsed.files.some(file => file.omittedChars > 0) || parsed.omittedFiles > 0)
})
test("oversized source/brief pauses at explicit limits instead of unbounded model input", () => {
  assert.throws(() => sourceContext([{ path: "huge.js", content: "x".repeat(40_000) }], ["huge.js"]), /FOCUSED_SOURCE_LIMIT/)
  assert.throws(() => boundedPrompt(["x".repeat(MODEL_PROMPT_LIMIT + 1)]), /MODEL_CONTEXT_LIMIT/)
})
test("bounded context preserves escaped unicode and omission accounting", () => {
  const result = sourceContext(Array.from({ length: 80 }, (_, n) => ({ path: `модуль-${n}.js`, content: '\\"'.repeat(2000) })), [], 4000)
  assert.ok(result.length <= 4000); assert.ok(JSON.parse(result).omittedFiles > 0)
})
test("planning and repair use deliberate reasoning; writing is not fixed low reasoning", () => {
  assert.equal(websiteModelPolicy("Return JSON only: plan").reasoningEffort, "high")
  assert.equal(websiteModelPolicy("Repair only these proven source errors.").temperature, 0.15)
  assert.equal(websiteModelPolicy("Write ONE complete source file:").reasoningEffort, "medium")
})
for (const [prompt, expected] of [["Сайт с фото и видео", ["image", "video"]], ["Build with real images", ["image"]], ["Сайт без фото и видео", []], ["No images, no video", []], ["Сайт с сурет және бейне", ["image", "video"]]]) test(`media requirements: ${prompt}`, () => assert.deepEqual(requestedMedia(prompt), expected))
test("a design cannot silently omit explicitly requested real media", () => {
  assert.throws(() => parseDesign(JSON.stringify(design), "Сайт с фото и видео"), /MEDIA_NOT_PLANNED/)
  assert.equal(parseDesign(JSON.stringify(design), "Сайт без фото и видео").mediaQueries.length, 0)
  assert.equal(parseDesign(JSON.stringify(design), "Измени CSS на сайте с фото", true).files.length, 1)
  assert.throws(() => parseDesign(JSON.stringify({ ...design, mediaQueries: [{ slot: "hero", kind: "image", query: "resort" }, { slot: "hero", kind: "video", query: "resort" }] }), "site"), /DUPLICATE_MEDIA_SLOT/)
})
for (const [content, code] of [
  ['<img src="https://evil.test/a.jpg" alt="Photo">', "UNVERIFIED_RENDERED_MEDIA"],
  ['<img src="//evil.test/a.jpg" alt="Photo">', "UNVERIFIED_RENDERED_MEDIA"],
  ['<img src="art.svg">', "IMAGE_ALT_MISSING"],
  ['<a href="#">Book now</a>', "DEAD_PRIMARY_LINK"],
  ['<p>Lorem ipsum</p>', "GENERIC_PLACEHOLDER_COPY"],
  ['<video autoplay src="clip.webm"></video>', "UNSAFE_VIDEO_AUTOPLAY"],
  ['<video preload="auto"></video>', "VIDEO_EAGER_DOWNLOAD"],
  ['<video autoPlay muted={false} playsInline preload="none"/>', "UNSAFE_VIDEO_AUTOPLAY"],
  ['<video autoplay muted playsinline preload="none"></video><video autoplay muted playsinline preload="none"></video>', "TOO_MANY_AUTOPLAY_VIDEOS"],
]) test(`source experience catches ${code}`, () => assert.ok(codes(files(content)).includes(code)))
test("working anchors, buttons and exact verified media are not false-positive warnings", () => {
  const source = files(`<a href="#gallery">Gallery</a><section id="gallery"><img src="${asset.url}" alt="Resort"></section><button onclick="this.textContent='Selected'">Select</button>`)
  assert.deepEqual(codes(source, [asset]), [])
})
test("a verified manifest alone is not a rendered photo/video in the actual website", () => {
  const plan = { ...design, mediaQueries: [{ slot: "hero", kind: "image", query: "resort" }, { slot: "movie", kind: "video", query: "resort" }] }
  const report = auditExperience(files('<h1>Resort</h1><canvas aria-label="Illustration"></canvas>'), [asset, { ...asset, slot: "movie", kind: "video" }], plan)
  assert.ok(report.errors.some(error => error.code === "PLANNED_PHOTO_NOT_RENDERED"))
  assert.ok(report.errors.some(error => error.code === "PLANNED_VIDEO_NOT_RENDERED"))
})
test("extensionless CSS image URLs are verified without rejecting font sources", () => {
  assert.ok(codes([{ path: "styles.css", content: 'body{background-image:url("https://images.unsplash.com/unverified")}@font-face{src:url("https://fonts.gstatic.com/font.woff2")}' }]).includes("UNVERIFIED_CSS_MEDIA"))
  assert.deepEqual(codes([{ path: "styles.css", content: '@font-face{src:url("https://fonts.gstatic.com/font.woff2")}' }]), [])
})
test("Next JSX literal media and expressions are distinguished without executing code", () => {
  assert.ok(codes([{ path: "app/page.tsx", content: '<Image src={"https://evil.test/x.png"} alt="test"/>' }]).includes("UNVERIFIED_RENDERED_MEDIA"))
  assert.deepEqual(codes([{ path: "app/page.tsx", content: '<Image src={media.hero.url} alt="test"/>' }]), []) // Dynamic correctness requires browser receipts.
})
test("RAF loops need reduced motion, teardown and offscreen/visibility handling", () => {
  const report = auditExperience([{ path: "main.js", content: "requestAnimationFrame(draw)" }], [], design)
  assert.ok(report.errors.some(error => error.code === "RAF_CLEANUP_MISSING" && error.file === "main.js"))
  assert.ok(report.errors.some(error => error.code === "HIDDEN_ANIMATION_RUNNING"))
  assert.ok(report.errors.some(error => error.code === "REDUCED_MOTION_MISSING"))
  assert.deepEqual(codes([{ path: "main.js", content: 'const reduce=matchMedia("(prefers-reduced-motion:reduce)");requestAnimationFrame(draw);cancelAnimationFrame(id);document.addEventListener("visibilitychange",pause)' }]), [])
})
test("large embedded image bytes are rejected, small original SVG is not called a photo", () => {
  assert.ok(codes(files(`<img alt="x" src="data:image/png;base64,${"x".repeat(5000)}">`)).includes("EMBEDDED_MEDIA_BUDGET"))
  assert.deepEqual(codes(files('<img alt="Original illustration" src="data:image/svg+xml,%3Csvg/%3E">')), [])
})
test("static export receives actual lazy image and video resource policy, idempotently", () => {
  const input = files(`<img alt="Hero" src="${asset.url}"><img alt="Detail" src="${asset.url}"><video autoplay muted playsinline preload="metadata"></video><video autoplay muted playsinline preload="auto"></video>`)
  const result = withMediaPolicy(input)
  assert.match(result[0].content, /loading="eager"/); assert.match(result[0].content, /loading="lazy"/)
  assert.equal((result[0].content.match(/data-malik-play-intent="true"/g) || []).length, 1)
  assert.equal((stripMediaPolicy(result[0].content).match(/preload="none"/g) || []).length, 2)
  assert.deepEqual(withMediaPolicy(result), result)
  assert.ok(new vm.Script(MEDIA_POLICY_SCRIPT))
})
test("owned video policy cannot hide a missing canvas reduced-motion/cleanup gate", () => {
  const result = withMediaPolicy(files('<video preload="none"></video><script>requestAnimationFrame(draw)</script>'))
  assert.ok(codes(result).includes("REDUCED_MOTION_MISSING"))
  assert.ok(codes(result).includes("RAF_CLEANUP_MISSING"))
})
test("non-media HTML and Next components stay unmodified by static resource injection", () => {
  const input = [...files('<main>Plain site</main>'), { path: "app/page.tsx", content: '<img src="x" alt="x"/>' }]
  assert.deepEqual(withMediaPolicy(input), input)
})
test("Commons license URLs reject NC/ND, disguised hosts and arbitrary protocols", () => {
  assert.equal(commonsLicense("https://creativecommons.org/licenses/by-sa/4.0/"), "https://creativecommons.org/licenses/by-sa/4.0/")
  assert.equal(commonsLicense("http://creativecommons.org/publicdomain/zero/1.0/deed.en"), "https://creativecommons.org/publicdomain/zero/1.0/")
  assert.equal(commonsLicense("https://creativecommons.org/licenses/by/2.5/"), "https://creativecommons.org/licenses/by/2.5/")
  for (const url of ["https://creativecommons.org/licenses/by-nc/4.0/", "https://creativecommons.org/licenses/by-nd/4.0/", "https://creativecommons.org.evil.test/licenses/by/4.0/", "javascript:alert(1)"]) assert.equal(commonsLicense(url), null)
})
async function keys(values, fn) {
  const names = ["PEXELS_API_KEY", "UNSPLASH_ACCESS_KEY"], previous = Object.fromEntries(names.map(key => [key, process.env[key]]))
  for (const key of names) { if (values[key]) process.env[key] = values[key]; else delete process.env[key] }
  try { return await fn() } finally { for (const key of names) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] }
}
const photo = n => ({ src: { large: `https://images.pexels.com/${n}.jpg` }, url: `https://www.pexels.com/photo/${n}/`, photographer: `Artist ${n}`, width: 1600, height: 1000 })
const oneImage = { ...design, mediaQueries: [{ slot: "hero", kind: "image", query: "resort architecture" }] }
test("broken first search result falls through to the next real candidate", () => keys({ PEXELS_API_KEY: "fixture" }, async () => {
  const calls = []
  const result = await discoverAssets(oneImage, undefined, async (url, init) => {
    calls.push({ url, method: init.method || "GET" })
    if (init.method === "HEAD") return new Response(null, { status: String(url).endsWith("1.jpg") ? 404 : 200, headers: { "content-type": "image/jpeg", "content-length": "20000" } })
    return Response.json({ photos: [photo(1), photo(2)] })
  })
  assert.equal(result.assets[0].url, "https://images.pexels.com/2.jpg")
  assert.ok(calls.filter(call => /images\.pexels/.test(call.url)).every(call => call.method === "HEAD"))
}))
test("parallel slots deduplicate the same stock photo without global cache", () => keys({ PEXELS_API_KEY: "fixture" }, async () => {
  const result = await discoverAssets({ ...oneImage, mediaQueries: [...oneImage.mediaQueries, { ...oneImage.mediaQueries[0], slot: "detail" }] }, undefined, async (_url, init) => init.method === "HEAD" ? new Response(null, { headers: { "content-type": "image/jpeg", "content-length": "20000" } }) : Response.json({ photos: [photo(1), photo(2)] }))
  assert.equal(result.assets.length, 2); assert.equal(new Set(result.assets.map(asset => asset.sourcePage)).size, 2)
}))
test("failed Pexels verification uses Unsplash sequentially and strips tracking secrets", () => keys({ PEXELS_API_KEY: "pexels-fixture", UNSPLASH_ACCESS_KEY: "unsplash-fixture" }, async () => {
  const calls = []
  const result = await discoverAssets(oneImage, undefined, async (url, init) => {
    calls.push(String(url))
    if (init.method === "HEAD") return new Response(null, { status: String(url).includes("pexels") ? 404 : 200, headers: { "content-type": "image/jpeg", "content-length": "20000" } })
    if (String(url).includes("api.pexels")) return Response.json({ photos: [photo(1)] })
    if (String(url).includes("/download")) return Response.json({ url: "tracked" })
    return Response.json({ results: [{ urls: { regular: "https://images.unsplash.com/a.jpg" }, links: { html: "https://unsplash.com/photos/a", download_location: "https://api.unsplash.com/photos/a/download" }, user: { name: "Artist", links: { html: "https://unsplash.com/@artist" } }, width: 1600, height: 900 }] })
  })
  assert.equal(result.assets[0].source, "unsplash")
  assert.ok(calls.indexOf("https://images.pexels.com/1.jpg") < calls.findIndex(url => url.includes("api.unsplash.com/search")))
  assert.doesNotMatch(JSON.stringify(result), /fixture|Authorization|Client-ID|tracking/)
}))
test("keyless Commons fallback requires actual license/artist metadata and HEAD", () => keys({}, async () => {
  const calls = []
  const result = await discoverAssets(oneImage, undefined, async (url, init) => {
    calls.push({ url: String(url), method: init.method || "GET" })
    if (init.method === "HEAD") return new Response(null, { headers: { "content-type": "image/jpeg", "content-length": "120000" } })
    return Response.json({ query: { pages: [{ imageinfo: [{ url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/resort.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Resort.jpg", width: 1600, height: 900, mime: "image/jpeg", size: 120000, extmetadata: { Artist: { value: '<a href="https://evil.test">Real Artist</a>' }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] }] } })
  })
  assert.equal(result.assets[0].source, "commons"); assert.equal(result.assets[0].bytes, 120000)
  assert.match(result.assets[0].credit, /Real Artist/); assert.doesNotMatch(result.assets[0].credit, /<a|evil/)
  const html = withAssetCredits(files('<h1>Resort</h1>'), result.assets)[0].content
  assert.match(html, /creativecommons.org\/licenses\/by-sa\/4.0/)
  assert.ok(calls.filter(call => call.url.includes("upload.wikimedia")).every(call => call.method === "HEAD"))
}))
test("actual Wikimedia thumbnail CDN is allowed exactly, never via a wildcard", () => {
  const { assetUrl } = load("lib/website/engine/media.ts")
  assert.ok(assetUrl("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/image.jpg/1920px-image.jpg"))
  assert.equal(assetUrl("https://thumb.wikimedia.org.evil.test/a.jpg"), null)
})
test("a failed later NASA collection does not discard an earlier valid candidate", () => keys({}, async () => {
  const result = await discoverAssets({ ...design, direction: "cinematic", mediaQueries: [{ slot: "movie", kind: "video", query: "black hole" }] }, undefined, async (url, init) => {
    if (init.method === "HEAD") return new Response(null, { headers: { "content-type": String(url).endsWith("mp4") ? "video/mp4" : "image/jpeg", "content-length": "10000" } })
    if (String(url).includes("images-api.nasa")) return Response.json({ collection: { items: [1, 2].map(n => ({ href: `https://images-assets.nasa.gov/video/${n}/collection.json`, links: [{ rel: "preview", href: `https://images-assets.nasa.gov/${n}.jpg` }], data: [{ center: "GSFC", nasa_id: String(n), description: "Black hole simulation" }] })) } })
    if (String(url).includes("/2/collection")) throw new Error("second-collection-unavailable")
    return Response.json(["https://images-assets.nasa.gov/video/1/clip~mobile.mp4"])
  })
  assert.equal(result.assets.length, 1); assert.equal(result.assets[0].source, "nasa")
}))
test("NASA image discovery uses official search sizes without unnecessary collection requests", () => keys({}, async () => {
  const calls = []
  const result = await discoverAssets({ ...design, direction: "cinematic", mediaQueries: [{ slot: "space", kind: "image", query: "black hole" }] }, undefined, async (url, init) => {
    calls.push(String(url))
    if (init.method === "HEAD") return new Response(null, { headers: { "content-type": "image/jpeg", "content-length": "120000" } })
    return Response.json({ collection: { items: [{ data: [{ center: "GSFC", nasa_id: "one", description: "Computer simulated black hole visualization" }], links: [{ render: "image", rel: "alternate", href: "https://images-assets.nasa.gov/one~large.jpg", width: 1920, height: 1080, size: 120000 }] }] } })
  })
  assert.equal(result.assets[0].width, 1920); assert.match(result.assets[0].description, /simulated/)
  assert.ok(calls.every(url => !url.includes("collection.json")))
}))
test("unsupported Commons licenses never become verified media", () => keys({}, async () => {
  let heads = 0
  const result = await discoverAssets(oneImage, undefined, async (_url, init) => {
    if (init.method === "HEAD") heads++
    return Response.json({ query: { pages: [{ imageinfo: [{ url: "https://upload.wikimedia.org/x.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:X.jpg", width: 1600, mime: "image/jpeg", extmetadata: { Artist: { value: "Artist" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-nc/4.0/" } } }] }] } })
  })
  assert.equal(heads, 0); assert.deepEqual(result.missing, ["hero"])
}))
test("oversized media is not downloaded to discover if it is usable", () => keys({ PEXELS_API_KEY: "fixture" }, async () => {
  let downloads = 0
  const result = await discoverAssets(oneImage, undefined, async (url, init) => {
    if (String(url).includes("images.pexels")) { if (init.method !== "HEAD") downloads++; return new Response(null, { headers: { "content-type": "image/jpeg", "content-length": String(MEDIA_LIMITS.imageBytes + 1) } }) }
    return Response.json(String(url).includes("api.pexels") ? { photos: [photo(1)] } : {})
  })
  assert.equal(downloads, 0); assert.equal(result.assets.length, 0)
}))
test("metadata response size, concurrency and overall budget are explicit and bounded", () => keys({ PEXELS_API_KEY: "fixture" }, async () => {
  let calls = 0
  const result = await discoverAssets({ ...oneImage, mediaQueries: Array.from({ length: 16 }, (_, n) => ({ slot: `image${n}`, kind: "image", query: "resort" })) }, undefined, async () => { calls++; return new Response("x".repeat(100), { headers: { "content-length": "2000000" } }) })
  assert.equal(result.assets.length, 0); assert.ok(calls <= MEDIA_LIMITS.requests)
  assert.equal(MEDIA_LIMITS.concurrency, 2); assert.equal(MEDIA_LIMITS.metadataBytes, 4_000_000)
}))
test("cumulative streamed metadata stops at the shared request budget", () => keys({ PEXELS_API_KEY: "fixture" }, async () => {
  let calls = 0
  const result = await discoverAssets({ ...oneImage, mediaQueries: Array.from({ length: 16 }, (_, n) => ({ slot: `image${n}`, kind: "image", query: "resort" })) }, undefined, async () => { calls++; return Response.json({ padding: "x".repeat(900_000) }) })
  assert.equal(result.assets.length, 0); assert.equal(result.missing.length, 16)
  assert.ok(calls <= 6, `shared 4MB budget exceeded: ${calls} large responses`)
}))
console.log("Experience checks certify source/resource mechanisms, not live-model aesthetic quality or a deployed sandbox.")
