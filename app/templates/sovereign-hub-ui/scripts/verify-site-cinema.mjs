// Every site the chat builds gets the MALIK Cinema motion runtime, and the
// model is told how to use it. Request: Apple Vision Pro-grade sites in one
// attempt — scroll scenes, word-by-word statements, footage, transitions.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { workTestLoader } from "./work-test-loader.mjs"

const load = workTestLoader()
const { withSiteCinema, withSiteCinemaInAnswer, SITE_CINEMA_CONTRACT, cinemaRecipe } = load("lib/website/cinema.ts")
const { auditSite, siteNeedsUpgrade, siteDocumentIn, replaceSiteDocument, extractSiteDocument } = load("lib/website/site-audit.ts")
const { chatArtDirection, siteSubject } = load("lib/website/chat-art-direction.ts")
const { prepareChatWebsite, chatWebsiteInstruction } = load("lib/server/chat-website-design.ts")
const { discoverAssets } = load("lib/website/engine/media.ts")

const page = (body, head = "<title>t</title>") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`
const runtimeOf = (html) => html.match(/<script id="malik-cinema">\n([\s\S]*?)\n<\/script>/)?.[1] || ""

test("a site that uses the attributes gets the runtime once, in the right places", () => {
  const html = page('<h1 data-reveal>Hi</h1><section data-scene="260"><div data-stage></div></section>')
  const out = withSiteCinema(html)
  assert.match(out, /<style id="malik-cinema-css">[\s\S]*<\/style>\n<script id="malik-cinema-boot">[\s\S]*<\/script>\n<\/head>/)
  assert.match(out, /<script id="malik-cinema">[\s\S]*<\/script>\n<\/body>/)
  assert.ok(out.includes('<h1 data-reveal>Hi</h1>'), "the model's markup is untouched")
  assert.equal(withSiteCinema(out), out, "never injected twice")
  assert.equal((out.match(/<\/script/g) || []).length, 2, "the runtime never closes its own script tag early")
})

test("the runtime is valid JavaScript and holds its safety promises", () => {
  const out = withSiteCinema(page("<p data-split=scrub>a b c</p>"))
  const runtime = runtimeOf(out)
  assert.ok(runtime.length > 4000)
  assert.doesNotThrow(() => new Function(runtime), "parses")
  assert.match(runtime, /prefers-reduced-motion: reduce/)
  assert.match(runtime, /saveData/)
  assert.match(runtime, /root\.classList\.remove\("mc-js"\)/, "a runtime error reveals everything")
  assert.match(out, /setTimeout\(function\(\)\{if\(!window\.__malikCinema\)document\.documentElement\.classList\.remove\("mc-js"\)\},2500\)/, "a runtime that never starts reveals everything")
  assert.match(out, /@media \(prefers-reduced-motion:reduce\)\{html\.mc-js \[data-reveal\][^}]*opacity:1!important/)
  assert.match(out, /@media print\{/)
  assert.ok(Buffer.byteLength(out) - Buffer.byteLength(page("<p data-split=scrub>a b c</p>")) < 40_000, "small enough to ship with every site")
})

test("fragments, plain pages and other code are left alone", () => {
  assert.equal(withSiteCinema('<div data-reveal>x</div>'), '<div data-reveal>x</div>', "not a complete document")
  const plain = page("<h1>No motion attributes</h1>")
  assert.equal(withSiteCinema(plain), plain)
  const answer = "Код:\n\n```css\n.a{color:red}\n```\n\n```js\nconsole.log('data-reveal')\n```\n"
  assert.equal(withSiteCinemaInAnswer(answer), answer)
})

test("every complete html document in an answer is upgraded, prose and other files kept", () => {
  const doc = page("<h1 data-split>Ember</h1>")
  const answer = `Готово — сайт ниже.\n\n\`\`\`html index.html\n${doc}\n\`\`\`\n\n\`\`\`css\nbody{margin:0}\n\`\`\`\n\nОткройте предпросмотр.`
  const out = withSiteCinemaInAnswer(answer)
  assert.match(out, /^Готово — сайт ниже\.\n\n```html index\.html\n<!doctype html>/)
  assert.match(out, /id="malik-cinema"/)
  assert.match(out, /```css\nbody\{margin:0\}\n```\n\nОткройте предпросмотр\.$/)
  const longFence = `\`\`\`\`html\n${page('<pre>\`\`\`</pre><div data-reveal>x</div>')}\n\`\`\`\``
  assert.match(withSiteCinemaInAnswer(longFence), /id="malik-cinema"[\s\S]*\n````$/)
})

test("the model is told to use the runtime and to compose like a flagship product page", async () => {
  for (const name of ["data-loader", "data-loader-count", "data-shader", "data-marquee", "data-cursor-text", "data-smooth", "data-split=\\\"lines\\\"", "data-scramble", "data-bg", "data-kenburns", "data-grain", "data-skew", "data-reveal", "data-split=\\\"scrub\\\"", "data-scene", "data-stage", "data-scrub-inset", "data-scrub-range", "0 1 1 0", "data-autoplay", "data-gallery", "data-nav", "mc-scrolled"]) {
    assert.ok(SITE_CINEMA_CONTRACT.includes(name.replace(/\\/g, "")), name)
  }
  assert.match(SITE_CINEMA_CONTRACT, /Do NOT write IntersectionObserver/)
  const site = chatWebsiteInstruction(await prepareChatWebsite({}, { prompt: "Создай сайт автосалона как у Apple" }, async () => ({ assets: [], missing: [] })))
  assert.match(site, /MALIK CINEMA RUNTIME/)
  assert.match(site, /THIS SITE'S CINEMATIC RECIPE/)
  assert.doesNotMatch(site, /restrained/i)
  const still = chatWebsiteInstruction(await prepareChatWebsite({}, { prompt: "Создай сайт автосалона без анимаций" }, async () => ({ assets: [], missing: [] })))
  assert.match(still, /USER OPT-OUT/)
  assert.doesNotMatch(still, /MALIK CINEMA RUNTIME/)
})

test("any subject gets real photos and footage searched in the user's words", () => {
  assert.equal(siteSubject("Создай сайт автосалона BMW с анимациями как у Apple"), "автосалона BMW")
  assert.equal(siteSubject("Сделай мне крутой лендинг для фитнес клуба"), "фитнес клуба")
  assert.equal(siteSubject("Build a premium website for a dental clinic"), "dental clinic")
  const car = chatArtDirection("Создай сайт автосалона BMW")
  assert.equal(car.profile, "adaptive")
  assert.deepEqual(car.mediaQueries.map((q) => q.kind), ["image", "image", "image", "image", "image", "image", "video"], "six photographs and one film for a deep page")
  assert.equal(car.mediaQueries[0].query, "автосалона BMW")
  assert.equal(chatArtDirection("Создай сайт автосалона без фото").mediaQueries.length, 0)
  assert.ok(chatArtDirection("Создай сайт автосалона без видео").mediaQueries.every((q) => q.kind === "image"))
  assert.ok(chatArtDirection("Создай сайт автосалона без анимаций").mediaQueries.every((q) => q.kind === "image"), "no motion, no autoplay footage")
})

test("Russian queries ask the photo libraries to search in Russian", async () => {
  const previous = process.env.PEXELS_API_KEY
  process.env.PEXELS_API_KEY = "test-key"
  const urls = []
  try {
    await discoverAssets({ direction: "adaptive", mediaQueries: [{ slot: "hero", kind: "image", query: "автосалон" }] }, undefined, async (url) => {
      urls.push(String(url))
      return new Response(JSON.stringify({ photos: [], results: [], query: { search: [] } }), { headers: { "content-type": "application/json" } })
    })
  } finally {
    if (previous === undefined) delete process.env.PEXELS_API_KEY
    else process.env.PEXELS_API_KEY = previous
  }
  assert.ok(urls.some((url) => url.startsWith("https://api.pexels.com/v1/search?") && url.includes("locale=ru-RU")), urls.join("\n"))
})

test("the chat route upgrades the sites it writes", () => {
  const route = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(route, /if\(authoredWebsite\|\|isContinueRequest\(originalPrompt\)\)answer=\{\.\.\.answer,content:withSiteCinemaInAnswer\(answer\.content\)\}/)
})

test("every brief gets its own recipe — never one template for all sites", () => {
  const prompts = ["Создай сайт автосалона BMW", "Создай сайт кофейни в Алматы", "Сделай лендинг фитнес клуба", "Создай сайт AI стартапа", "Создай сайт архитектурного бюро", "Создай сайт школы танцев", "Создай сайт винодельни", "Создай сайт ювелирного магазина"]
  const recipes = prompts.map((prompt) => cinemaRecipe(prompt))
  assert.equal(cinemaRecipe(prompts[0]).text, recipes[0].text, "the same brief keeps its recipe")
  assert.equal(new Set(recipes.map((r) => r.text)).size, prompts.length, "different briefs, different recipes")
  assert.ok(new Set(recipes.map((r) => r.direction)).size >= 4, "several visual directions across subjects")
  const heroes = new Set(recipes.map((r) => r.text.match(/Hero: (\w+)/)[1]))
  const scenes = new Set(recipes.flatMap((r) => [...r.text.matchAll(/Signature scene \d: (\S+)/g)].map((m) => m[1])))
  assert.ok(heroes.size >= 3 && scenes.size >= 4, `heroes ${[...heroes]}, scenes ${[...scenes]}`)
  for (const r of recipes) {
    const [one, two] = [...r.text.matchAll(/Signature scene \d: (\S+)/g)].map((m) => m[1])
    assert.notEqual(one, two, "two different signature scenes")
    assert.match(r.text, /Chapter order: sticky data-nav → hero → .*SIGNATURE SCENE 1.*SIGNATURE SCENE 2 → closing/)
  }
  assert.match(cinemaRecipe("Создай сайт автосалона").direction, /obsidian|gallery|swiss/, "the subject steers the direction")
  assert.match(cinemaRecipe("Создай сайт кофейни").direction, /earth|gallery|obsidian/)
})

const copy = (n) => Array.from({ length: n }, (_, i) => `слово${i}`).join(" ")
const good = (extra = "") => `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body>
<header data-nav><a href="#a">A</a></header>
<section id="a" data-reveal><h1 data-split>T</h1><img src="https://images.unsplash.com/x" alt=""></section>
<section data-scene="260"><div data-stage><img data-scrub-inset="14 0" data-scrub-radius="30 0" src="https://images.unsplash.com/y" alt=""></div></section>
<section data-reveal><p data-split="scrub">Words</p></section><section data-stagger="90"><div data-reveal>1</div></section><section data-gallery id="g"></section>
${Array.from({ length: 6 }, (_, i) => `<section data-reveal><h2>Глава ${i}</h2><p>${copy(170)}</p><img src="https://images.unsplash.com/z${i}" alt=""></section>`).join("\n")}
${extra}<script>document.title = "ok"</script></body></html>`

test("a finished cinematic site passes the audit; broken and flat drafts are caught", () => {
  assert.deepEqual(auditSite(good(), { motion: true }), [])
  const cut = good().slice(0, -40)
  assert.ok(auditSite(cut, { motion: true }).some((i) => i.code === "INCOMPLETE" && i.severity === "critical"))
  const syntax = auditSite(good("<script>const a = ;</script>"), { motion: true })
  assert.ok(syntax.some((i) => i.code === "SCRIPT_SYNTAX"))
  assert.ok(auditSite(good('<a href="#missing">x</a>'), { motion: true }).some((i) => i.code === "BROKEN_ANCHORS" && /#missing/.test(i.detail)))
  assert.ok(auditSite(good("<p>Lorem ipsum dolor</p>"), { motion: true }).some((i) => i.code === "PLACEHOLDER"))
  assert.ok(auditSite(good('<img src="images/hero.jpg">'), { motion: true }).some((i) => i.code === "LOCAL_IMAGES"))
  const flat = "<!doctype html><html><head><meta name=viewport content=x></head><body><section>a</section></body></html>"
  const flatIssues = auditSite(flat, { motion: true }).map((i) => i.code)
  for (const code of ["FEW_CHAPTERS", "THIN_COPY", "FEW_VISUALS", "FLAT_MOTION", "NO_SCENE"]) assert.ok(flatIssues.includes(code), code)
  assert.ok(!auditSite(flat, { motion: false }).some((i) => i.code === "FLAT_MOTION"), "a no-motion request is not asked for motion")
  assert.equal(siteNeedsUpgrade([]), false)
  assert.equal(siteNeedsUpgrade([{ code: "NO_SCENE", severity: "quality", detail: "" }]), false, "one small gap is not worth a second full pass")
  assert.equal(siteNeedsUpgrade([{ code: "INCOMPLETE", severity: "critical", detail: "" }]), true)
  assert.equal(siteNeedsUpgrade(auditSite(flat, { motion: true })), true)
})

test("the upgraded page replaces exactly the old document in the answer", () => {
  const answer = "Вот сайт:\n\n```html\n" + good() + "\n```\n\nОткройте предпросмотр."
  const doc = siteDocumentIn(answer)
  assert.equal(doc.html, good())
  const next = replaceSiteDocument(answer, "<!doctype html><html><body>NEW</body></html>")
  assert.equal(next, "Вот сайт:\n\n```html\n<!doctype html><html><body>NEW</body></html>\n```\n\nОткройте предпросмотр.")
  assert.equal(extractSiteDocument("Готово:\n```html\n" + good() + "\n```"), good().trim())
  assert.equal(extractSiteDocument("text <!doctype html><html><body>x</body></html> tail"), "<!doctype html><html><body>x</body></html>")
  assert.equal(siteDocumentIn("```css\nbody{}\n```"), null)
})

test("the chat route audits each site and upgrades a weak draft once, within the deadline", () => {
  const route = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(route, /if\(authoredWebsite&&!\("incomplete" in answer&&answer\.incomplete\?\.reason==="time"\)\)answer=\{\.\.\.answer,content:await upgradeChatSite\(/)
  assert.match(route, /const budget = chatAnswerDeadline\(\{ code: true, deep: briefNeedsDeep\(input\.prompt\), site: true \}\)\.hardMs - 40_000 - \(Date\.now\(\) - input\.startedAt\)/)
  assert.match(route, /site: Boolean\(chatArtDirection\(coderPrompt\(body\)\)\)/, "a site gets the longer deadline its upgrade pass needs")
  assert.match(route, /if \(!better\) return input\.answer/, "a worse upgrade never replaces the first draft")
  const order = route.indexOf("await upgradeChatSite(") < route.indexOf("content:withSiteCinemaInAnswer(answer.content)")
  assert.ok(order, "the audit sees the model's page before the runtime is appended")
})

test("recipe v2: tokens with Cyrillic-safe fonts, studio techniques and depth", () => {
  const ru = cinemaRecipe("Создай сайт кофейни в Алматы").text
  const en = cinemaRecipe("Build a website for a coffee roastery").text
  for (const text of [ru, en]) {
    assert.match(text, /:root\{--bg:#[0-9a-f]{6};--surface:#[0-9a-f]{6};--text:#[0-9a-f]{6};--muted:#[0-9a-f]{6};--accent:#[0-9a-f]{6};--mc-accent:#[0-9a-f]{6};--display:'[^']+'/)
    assert.match(text, /https:\/\/fonts\.googleapis\.com\/css2\?family=/)
    assert.match(text, /Studio techniques for this site \(use every one\): .+;.+;.+;.+;/)
    assert.match(text, /10–14 chapters/)
    assert.match(text, /at least 1,200 words/)
    assert.match(text, /fetchpriority="high"/)
  }
  const cyrillicFaces = /family=(?:Manrope|Unbounded|Inter|Montserrat|Cormorant\+Garamond|Playfair\+Display|Prata|Golos\+Text|Onest|Russo\+One|Rubik|IBM\+Plex\+Sans|Exo\+2|JetBrains\+Mono|Lora|Forum|Jost|IBM\+Plex\+Mono)\b/
  for (const prompt of ["Создай сайт автосалона", "Создай сайт кофейни", "Сделай лендинг фитнес клуба", "Создай сайт AI стартапа", "Создай сайт архитектурного бюро", "Создай сайт школы танцев", "Сайт ювелирного магазина", "Создай сайт клиники"]) {
    const families = [...cinemaRecipe(prompt).text.matchAll(/family=([^:&]+)/g)].map((m) => m[0])
    assert.ok(families.length >= 1)
    for (const family of families) assert.match(family, cyrillicFaces, `${prompt}: ${family} must have Cyrillic`)
  }
  const offline = cinemaRecipe("Создай сайт кофейни", { offline: true }).text
  assert.doesNotMatch(offline, /fonts\.googleapis/, "an offline site loads no remote fonts")
  const chapters = cinemaRecipe("Создай сайт автосалона").text.match(/Chapter order: (.+)/)[1].split(" → ")
  assert.ok(chapters.length >= 14, `${chapters.length} steps from nav to footer`)
})

test("photographs are fetched sharp and footage in Full HD", async () => {
  const previous = process.env.PEXELS_API_KEY
  process.env.PEXELS_API_KEY = "test-key"
  try {
    const result = await discoverAssets({ direction: "adaptive", mediaQueries: [{ slot: "hero", kind: "image", query: "car" }, { slot: "motion", kind: "video", query: "car" }] }, undefined, async (url, init) => {
      const href = String(url)
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-type": href.includes("videos.pexels") ? "video/mp4" : "image/jpeg", "content-length": "500000" } })
      if (href.includes("/videos/search")) return Response.json({ videos: [{ url: "https://www.pexels.com/video/1/", image: "https://images.pexels.com/videos/1/poster.jpeg", user: { name: "A" }, video_files: [640, 1280, 1920, 3840].map((width) => ({ file_type: "video/mp4", width, height: width / 16 * 9, link: `https://videos.pexels.com/video-files/1/${width}.mp4` })) }] })
      if (href.includes("api.pexels.com/v1/search")) return Response.json({ photos: [{ url: "https://www.pexels.com/photo/1/", photographer: "B", width: 6000, height: 4000, src: { original: "https://images.pexels.com/photos/1/pexels-photo-1.jpeg", large2x: "https://images.pexels.com/photos/1/pexels-photo-1.jpeg?w=940&dpr=2" } }] })
      return Response.json({})
    })
    const image = result.assets.find((asset) => asset.kind === "image")
    const video = result.assets.find((asset) => asset.kind === "video")
    assert.match(image.url, /pexels-photo-1\.jpeg\?auto=compress&cs=tinysrgb&w=2400$/)
    assert.match(video.url, /\/1920\.mp4$/, "Full HD, not the 4K original or a 640px preview")
  } finally {
    if (previous === undefined) delete process.env.PEXELS_API_KEY
    else process.env.PEXELS_API_KEY = previous
  }
})

test("runtime v2 carries the studio techniques it promises", () => {
  const runtime = runtimeOf(withSiteCinema(page("<div data-loader><span data-loader-count>0</span></div>")))
  for (const piece of ["aurora:", "mesh:", "liquid:", "getContext(\"webgl\"", "data-loader-count", "mc-loaded", "mc-cursor", "data-marquee", "data-smooth", "passive: false", "data-bg", "data-skew", "GLYPHS", "splitLines", "fonts.ready"]) {
    assert.ok(runtime.includes(piece), piece)
  }
  assert.match(runtime, /setTimeout\(finishLoad, 5000\)/, "a preloader can never trap the page")
  assert.match(runtime, /if \(!reduce && !coarse && \(root\.hasAttribute\("data-smooth"\)/, "inertia scrolling never on touch or reduced motion")
  const doc = withSiteCinema(page("<div data-loader>x</div>"))
  assert.match(doc, /html:not\(\.mc-js\) \[data-loader\]\{display:none!important\}/, "no JavaScript, no loader")
})
