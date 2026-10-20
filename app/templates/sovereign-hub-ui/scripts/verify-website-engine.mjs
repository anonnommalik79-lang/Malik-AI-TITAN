import test from "node:test"
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
import { randomUUID } from "node:crypto"

// Only external storage/auth/provider/executor boundaries are fixtures. Every
// state transition, path check, compiler parse and API handler is production TS.
const values = new Map()
let revision = 0, currentActor = { userId: "owner-fixture", plan: "owner", authenticated: true }
const storage = {
  configured: () => true,
  read: async key => structuredClone(values.get(key) || { value: null, etag: null }),
  write: async (key, value, etag) => {
    if ((values.get(key)?.etag || null) !== etag) return { stored: false, conflict: true }
    values.set(key, { value: structuredClone(value), etag: String(++revision) }); return { stored: true, conflict: false }
  },
}
const load = workTestLoader({
  "@/lib/server/private-json-store": { privateJsonStoreConfigured: storage.configured, readPrivateJsonVersioned: storage.read, writePrivateJsonConditional: storage.write },
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => currentActor },
  "@/lib/server/request-frequency": { takeRequestFrequency: () => true },
})
const { WebsiteStore } = load("lib/website/engine/store.ts")
const { stepProject } = load("lib/website/engine/runner.ts")
const { websiteIntent, lastWebsiteJob } = load("lib/website/engine/intent.ts")
const { projectFiles, applyFiles, missingJsxBindings, validateSources, dependencyProblems, sourceHash, environmentDiagnosis } = load("lib/website/engine/workspace.ts")
const { designConstraints, parseDesign } = load("lib/website/engine/design.ts")
const { websiteProjectsRequest } = load("lib/website/engine/http.ts")
const { assetUrl, discoverAssets } = load("lib/website/engine/media.ts")
const { shouldUseWeb } = load("lib/ai/web-search-policy.ts")
const { readProjectZip } = load("lib/work/code/zip-read.ts")
const { websiteChatTurn } = load("lib/website/engine/chat.ts")
const { withAssetCredits } = load("lib/website/engine/credits.ts")
const { executeProject } = load("lib/website/engine/executor.ts")
const store = new WebsiteStore(storage)
const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cosmic observatory</title><link rel="stylesheet" href="styles.css"></head><body><nav><a href="gallery.html">Gallery</a></nav><main><h1>Explore the universe</h1><button id="launch">Explore</button><p id="result" role="status"></p><canvas aria-label="Original space illustration"></canvas></main><script src="main.js"></script></body></html>`
const fixtureFiles = [
  { path: "index.html", content: html },
  { path: "styles.css", content: "*{box-sizing:border-box}body{margin:0;background:#08080b;color:white;font-family:Arial}main{max-width:70rem;margin:auto;padding:2rem}canvas{max-width:100%}@media(max-width:600px){main{padding:1rem}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}" },
  { path: "main.js", content: 'document.getElementById("launch").addEventListener("click",()=>document.getElementById("result").textContent="Demo flight selected")' },
  { path: "gallery.html", content: '<!doctype html><html lang="en"><head><title>Gallery</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Gallery</h1><a href="index.html">Home</a></body></html>' },
]
const design = { direction: "cinematic", audience: "space enthusiasts", composition: "full bleed", typography: "editorial", palette: ["#08080b", "#fff"], spacing: "fluid", motion: "reduced-motion compatible canvas", accessibility: ["labels"], performance: ["DPR cap"], stack: "static", sections: ["hero", "missions", "galaxies", "observatory", "science", "gallery", "video", "contact"], interactions: ["gallery navigation"], files: fixtureFiles.map(f => ({ path: f.path, purpose: f.path })), mediaQueries: [] }
const deps = {
  model: async (_job, _system, prompt) => {
    if (prompt.startsWith("Return JSON only:")) return JSON.stringify(design)
    const name = prompt.match(/Write ONE complete source file: ([^.]+\.[^ .]+)\./)?.[1]
    const file = fixtureFiles.find(f => f.path === name)
    if (!file) throw new Error("FIXTURE_FILE_NOT_FOUND")
    return JSON.stringify(file)
  },
  media: async () => ({ assets: [], missing: [] }),
  execute: async () => null,
}
const create = (extra = {}) => store.create({ actor: "owner-fixture", plan: "owner", modelId: "malik-max", prompt: "Создай космический сайт с восемью разделами", ...extra })
async function drive(job, services = deps, targetStore = store) {
  for (let n = 0; n < 35; n++) {
    if (["completed", "paused", "failed", "cancelled"].includes(job.state)) break
    job = await stepProject(job.owner, job.id, { store: targetStore, deps: services, now: Math.max(Date.now(), (job.retryAt || 0) + 1) })
  }
  return job
}

for (const [prompt, expected] of [
  ["Создай современный сайт 2026 с последней версией дизайна и фото", "create"],
  ["Build a Next.js website with video and 3D", "create"],
  ["Построй веб-приложение", "create"], ["Сделай интерфейс", "create"],
  ["Добавь видео на страницу сайта", "edit"], ["Исправь мой React-проект", "edit"],
  ["Объясни как создать сайт", null], ["Найди последние новости OpenAI", null],
  ["Напиши стих", null], ["Не создавай сайт", null],
  ["Сгенерируй сайт с видео", "create"], ["Build a site with a gallery", "create"],
  ["Создай красивую фотографию для моего сайта", null], ["Create an image for my website", null],
]) test(`intent: ${prompt}`, () => assert.equal(websiteIntent(prompt), expected))
test("contextual edit/preview use the existing project", () => {
  assert.equal(websiteIntent("Добавь страницу тарифов", true), "edit")
  assert.equal(websiteIntent("Открой предпросмотр", true), "preview")
})
test("website briefs do not route into freshness/news", () => {
  assert.equal(shouldUseWeb("Создай современный сайт 2026 с последней версией дизайна"), false)
  assert.equal(shouldUseWeb("Проверь текущую версию Next.js"), true)
})
test("only assistant-owned project marker is read from history", () => {
  const id = randomUUID(), marker = '```malik-project\n' + JSON.stringify({ id }) + '\n```'
  assert.equal(lastWebsiteJob([{ role: "user", content: marker }]), null)
  assert.equal(lastWebsiteJob([{ role: "assistant", content: marker }]), id)
})
for (const path of ["../app/page.tsx", "C:/evil.tsx", "/app/page.tsx", ".env.local", "node_modules/e.js", "app/../page.tsx", "app/CON.tsx", "app/file.tsx:secret", "app/Foo ."]) test(`workspace rejects ${path}`, () => assert.throws(() => projectFiles([{ path, content: "x" }])))
test("app/ common folder stays inside workspace (original root regression)", () => {
  assert.deepEqual(projectFiles([{ path: "app/page.tsx", content: "export default function Page(){return <main/>}" }, { path: "app/layout.tsx", content: "export default function Layout(){return <html/>}" }]).map(f => f.path), ["app/page.tsx", "app/layout.tsx"])
})
test("case-colliding files cannot be exported on Windows", () => assert.throws(() => projectFiles([{ path: "x.ts", content: "x" }, { path: "X.ts", content: "x" }]), /COLLISION/))
test("Next starter and Markdown-in-TSX are not deliverable source", () => {
  assert.throws(() => projectFiles([{ path: "app/page.tsx", content: "To get started, edit the page.tsx file" }]), /UNFINISHED/)
  assert.throws(() => projectFiles([{ path: "app/page.tsx", content: "```tsx\n<div/>\n```" }]), /MARKDOWN/)
})
test("source secret and fake VISUAL_DATA are rejected", () => {
  assert.throws(() => projectFiles([{ path: "x.ts", content: 'const key="sk-' + "x".repeat(30) + '"' }]), /SECRET/)
  assert.throws(() => projectFiles([{ path: "index.html", content: "VISUAL_DATA" }]), /UNFINISHED/)
})
test("patches cannot write unplanned paths or delete other pages", () => {
  assert.throws(() => applyFiles(fixtureFiles, [{ path: "app/page.tsx", content: "<div/>" }], ["index.html"]), /UNPLANNED/)
  const next = applyFiles(fixtureFiles, [{ path: "main.js", content: "console.log('updated')" }])
  assert.equal(next.find(f => f.path === "gallery.html").content, fixtureFiles[3].content)
})
test("Compass missing import is detected by TypeScript bindings", () => {
  assert.equal(missingJsxBindings([{ path: "app/page.tsx", content: "export default function Page(){return <Compass/>}" }])[0].code, "JSX_UNBOUND")
  assert.equal(missingJsxBindings([{ path: "app/page.tsx", content: 'import { Compass } from "lucide-react"; export default function Page(){return <Compass/>}' }]).length, 0)
  assert.equal(missingJsxBindings([{ path: "app/page.tsx", content: 'function Card({Icon}:any){return <Icon/>}; export default Card' }]).length, 0)
})
test("dependency scripts, unpinned versions and untrusted tarballs fail", () => {
  assert.ok(dependencyProblems([{ path: "package.json", content: JSON.stringify({ dependencies: { next: "latest", react: "https://bad.test/x.tgz" }, scripts: { postinstall: "rm -rf /" } }) }]).length >= 3)
})
test("design directions differ without forcing one composition", () => {
  assert.notEqual(designConstraints("Создай космический сайт").direction, designConstraints("Сайт премиального отеля").direction)
  assert.notEqual(designConstraints("SaaS dashboard").composition, designConstraints("hypercar website").composition)
  assert.throws(() => parseDesign(JSON.stringify({ ...design, files: [{ path: "../index.html", purpose: "escape" }] }), "site"))
})
test("actual compiler parses all fixture source without errors", () => assert.equal(validateSources(fixtureFiles).counts.errors, 0))
test("idempotent submit creates one durable job", async () => {
  const requestId = randomUUID(), a = await create({ requestId }), b = await create({ requestId })
  assert.equal(a.id, b.id); assert.equal(a.workspaceRoot, `projects/${a.id}`)
  assert.equal((await store.candidates()).filter(item => item.id === a.id).length, 1)
})
test("source checkpoints persist across a new worker instance", async () => {
  let job = await create()
  for (let n = 0; n < 5; n++) job = await stepProject(job.owner, job.id, { store, deps })
  assert.equal(job.files.length, 1)
  const restarted = new WebsiteStore(storage)
  job = await drive(await restarted.read("owner-fixture", job.id), deps, restarted)
  assert.equal(job.state, "paused"); assert.equal(job.checkpoint, "preview_ready")
  assert.equal(job.files.length, 4); assert.equal(job.checks.build.status, "not_run")
  assert.equal(job.checks.browser.status, "not_run")
})
test("a blocked sandbox is not a fabricated completed build", async () => {
  const job = await drive(await create())
  assert.notEqual(job.state, "completed"); assert.match(job.events.at(-1).message, /sandbox/)
})
test("matching executor receipts permit completion (executor fixture, not a live sandbox)", async () => {
  const done = await drive(await create(), { ...deps, execute: async job => ({ id: "fixture", status: "completed", sourceHash: sourceHash(job.files), isolation: "microvm", dependencies: { passed: true, details: ["fixture"] }, build: { passed: true, details: ["fixture"] }, browser: { passed: true, details: ["fixture"] } }) })
  assert.equal(done.state, "completed")
})
test("failed writing stops after three retries with existing files preserved", async () => {
  const job = await drive(await create(), { ...deps, model: async () => { throw new Error("FIXTURE_PROVIDER_DOWN") } })
  assert.equal(job.state, "failed"); assert.equal(job.failures, 3)
})
test("expired lease can resume, late result is fenced", async () => {
  let job = await create()
  job = await store.update(job.owner, job.id, current => { current.lease = { token: "dead", until: Date.now() - 1 } })
  job = await stepProject(job.owner, job.id, { store, deps })
  assert.equal(job.state, "planning"); assert.equal(job.lease, undefined)
})
test("simultaneous workers do not write a file twice", async () => {
  const job = await create()
  await Promise.allSettled([stepProject(job.owner, job.id, { store, deps }), stepProject(job.owner, job.id, { store, deps })])
  const saved = await store.read("owner-fixture", job.id)
  assert.equal(saved.state, "planning")
})
test("cancellation wins over an in-flight model response", async () => {
  let job = await create()
  for (let n = 0; n < 2; n++) job = await stepProject(job.owner, job.id, { store, deps })
  let finish; const entered = new Promise(resolve => { finish = resolve })
  let release; const wait = new Promise(resolve => { release = resolve })
  const running = stepProject(job.owner, job.id, { store, deps: { ...deps, model: async () => { finish(); await wait; return JSON.stringify(design) } } })
  await entered; await store.control("owner-fixture", job.id, "cancel"); release()
  await assert.rejects(running, /STALE_PROJECT_LEASE/)
  assert.equal((await store.read("owner-fixture", job.id)).state, "cancelled")
})
test("edits preserve unrelated pages and restore exact prior source", async () => {
  let job = await drive(await create()); const original = sourceHash(job.files)
  job = await store.control("owner-fixture", job.id, "edit", "Измени только стили")
  const editDeps = { ...deps, model: async (_job, _system, prompt) => prompt.startsWith("Return JSON only:") ? JSON.stringify({ ...design, files: [{ path: "styles.css", purpose: "edit" }] }) : JSON.stringify({ path: "styles.css", content: "body{background:#fff;color:#000}" }) }
  job = await drive(job, editDeps)
  assert.equal(job.files.find(f => f.path === "gallery.html").content, fixtureFiles[3].content)
  assert.notEqual(sourceHash(job.files), original)
  job = await store.control("owner-fixture", job.id, "restore", "", job.revisions[0].id)
  assert.equal(sourceHash(job.files), original)
})
test("soft media failures are explicit, no fabricated URLs", async () => {
  const job = await drive(await create(), { ...deps, media: async () => ({ assets: [], missing: ["hero-video"] }) })
  assert.equal(job.checks.media.status, "fail"); assert.equal(job.assets.length, 0)
})
test("media SSRF allowlist rejects private endpoints and disguised hosts", () => {
  for (const url of ["http://127.0.0.1/a", "https://169.254.169.254/a", "https://images.pexels.com.evil.test/a", "https://u:p@images.pexels.com/a", "https://images.pexels.com:99/a"]) assert.equal(assetUrl(url), null)
})
test("asset availability uses HEAD and preserves credit (provider fixture)", async () => {
  const saved = process.env.PEXELS_API_KEY; process.env.PEXELS_API_KEY = "fixture"
  const calls = []
  try {
    const result = await discoverAssets({ ...design, mediaQueries: [{ slot: "hero", kind: "image", query: "hotel" }] }, undefined, async (url, init) => {
      calls.push({ url, method: init.method || "GET" })
      return init.method === "HEAD" ? new Response(null, { headers: { "content-type": "image/jpeg", "content-length": "3000" } }) : Response.json({ photos: [{ src: { large: "https://images.pexels.com/photos/1/a.jpg" }, url: "https://www.pexels.com/photo/1/", photographer: "Test Artist", width: 1280, height: 720 }] })
    })
    assert.equal(result.assets.length, 1); assert.match(result.assets[0].credit, /Test Artist/)
    assert.equal(calls[1].method, "HEAD")
  } finally { if (saved === undefined) delete process.env.PEXELS_API_KEY; else process.env.PEXELS_API_KEY = saved }
})
test("Windows diagnostics distinguish source, SWC, WASM and ports", () => {
  assert.match(environmentDiagnosis("Failed to load SWC binding"), /^SWC_NATIVE/)
  assert.match(environmentDiagnosis("Turbopack unsupported wasm"), /^TURBOPACK_WASM/)
  assert.match(environmentDiagnosis("EADDRINUSE"), /^PORT_CONFLICT/)
})
test("API enforces authentication and cross-user isolation", async () => {
  const job = await create()
  currentActor = { userId: "other-fixture", plan: "free", authenticated: true }
  assert.equal((await websiteProjectsRequest(new Request(`https://app.test/api/website/projects/${job.id}`), job.id)).status, 404)
  currentActor = { userId: "guest", plan: "free", authenticated: false }
  assert.equal((await websiteProjectsRequest(new Request("https://app.test/api/website/projects"))).status, 401)
  currentActor = { userId: "owner-fixture", plan: "owner", authenticated: true }
})
test("ZIP has one actual project root, all pages and verification receipts", async () => {
  const job = await drive(await create())
  const response = await websiteProjectsRequest(new Request(`https://app.test/api/website/projects/${job.id}?export=zip`), job.id)
  assert.equal(response.status, 200)
  const zip = readProjectZip(Buffer.from(await response.arrayBuffer()))
  assert.ok(zip.files.some(file => file.path.endsWith("/index.html")))
  assert.ok(zip.files.some(file => file.path.endsWith("/gallery.html")))
  assert.ok(zip.files.every(file => file.path.startsWith(job.id + "/")))
  const report = zip.files.find(file => file.path.endsWith("/MALIK-VERIFICATION.md"))
  assert.match(report.content, /build: not_run/)
})
test("preview is actual generated source and does not grant same-origin", async () => {
  const job = await drive(await create())
  const response = await websiteProjectsRequest(new Request(`https://app.test/api/website/projects/${job.id}?preview=1`), job.id)
  const data = await response.json()
  assert.equal(data.preview.ok, true); assert.match(data.preview.html, /Explore the universe/)
  assert.match(data.preview.html, /connect-src &#39;none&#39;|connect-src 'none'|connect-src &#x27;none&#x27;/)
})
test("SSE serves real monotonically numbered saved progress", async () => {
  let job = await create(); job = await stepProject(job.owner, job.id, { store, deps })
  const response = await websiteProjectsRequest(new Request(`https://app.test/api/website/projects/${job.id}?events=1`), job.id)
  const text = await response.text(); assert.match(text, /event: progress/); assert.match(text, /event: checkpoint/)
})
test("chat creates a saved project handle without waiting for model generation", async () => {
  const answer = await websiteChatTurn({ prompt: "Создай современный сайт 2026 с фото и видео", owner: currentActor, modelId: "malik-max" })
  assert.match(answer, /```malik-project/)
  const id = lastWebsiteJob([{ role: "assistant", content: answer }])
  const job = await store.read(currentActor.userId, id)
  assert.equal(job.state, "queued"); assert.equal(job.modelId, "malik-max")
})
test("guest chat keeps the old non-durable coding route intact", async () => {
  assert.equal(await websiteChatTurn({ prompt: "Создай сайт", owner: { ...currentActor, authenticated: false }, modelId: "malik-max" }), null)
})
test("model repair actually fixes an unbound JSX component, not just a prompt assertion", async () => {
  let job = await create()
  const source = [
    { path: "package.json", content: JSON.stringify({ dependencies: { next: "16.2.7", react: "19.1.0", "react-dom": "19.1.0" }, scripts: { build: "next build" } }) },
    { path: "app/layout.tsx", content: 'export default function Layout({children}:any){return <html lang="en"><body>{children}</body></html>}' },
    { path: "app/page.tsx", content: 'export default function Page(){return <Compass/>}' },
  ]
  job = await store.update(job.owner, job.id, current => { current.state = current.checkpoint = "installing"; current.files = source })
  const repairModel = async (_job, _system, prompt) => {
    assert.match(prompt, /JSX_UNBOUND/)
    return JSON.stringify({ files: [{ path: "app/page.tsx", content: 'function Compass(){return <svg aria-label="Direction"/>}; export default function Page(){return <main><h1>Explore</h1><Compass/></main>}' }] })
  }
  job = await stepProject(job.owner, job.id, { store, deps: { ...deps, model: repairModel } })
  assert.equal(job.repairAttempts, 1)
  job = await stepProject(job.owner, job.id, { store, deps })
  assert.equal(job.checks.static.status, "pass"); assert.equal(job.state, "building")
})
test("static multi-page preview selects the requested source document", async () => {
  const job = await drive(await create())
  const response = await websiteProjectsRequest(new Request(`https://app.test/api/website/projects/${job.id}?preview=1&route=/gallery.html`), job.id)
  const data = await response.json()
  assert.equal(data.preview.entry, "gallery.html"); assert.equal(data.preview.routes.length, 2)
})
test("a stack-less lunar resort website is model-authored HTML, not a Forge template or empty job", async () => {
  let modelCalls = 0, researchCalls = 0, forgeCalls = 0
  let designContext = ""
  class FixtureModelError extends Error {}
  const streamLoad = workTestLoader({
    "@/lib/auth/server": { getOptionalWorkOSAuth: async () => ({ user: { id: "fixture", email: "owner-fixture", emailVerified: true } }) },
    "@/lib/server/private-json-store": { privateJsonStoreConfigured: storage.configured, readPrivateJsonVersioned: storage.read, writePrivateJsonConditional: storage.write },
    "next/server": { after: () => {} },
    "@/lib/malik-compute/runtime": { withCompute: handler => handler, observeComputeResult: () => {} },
    "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => currentActor },
    "@/lib/server/malik-model-router": {
      resolveStrictMalikSelection: async () => ({ modelId: "malik-max", entitlement: currentActor }),
      runStrictMalikModel: async () => { modelCalls++; throw new Error("Unexpected model call in the fixture") },
      MalikModelRouteError: FixtureModelError, malikModelErrorPayload: e => ({ error: e.message }),
    },
    "@/lib/malik-god-router": {
      asPlainText: answer => answer.content,
      malikGodAnswer: async body => {
        modelCalls++
        designContext = streamLoad("lib/server/chat-website-design.ts").chatWebsiteInstruction(body)
        return { content: "```html filename=index.html\n<!doctype html><html><head><title>LUNA SERENITAS</title></head><body><h1>Moon resort concept</h1></body></html>\n```", provider: "fixture-model", model: "fixture", usedWeb: false, sources: [], attempts: [] }
      },
      gatherSourcesForPrompt: async () => { researchCalls++; throw new Error("Wrong research route") }, sourceContext: () => "",
    },
    "@/lib/website/engine/media": { discoverAssets: async () => ({ assets: [], missing: ["hero"] }) },
    "@/lib/sites/forge/chat-turn": {
      runSiteForgeTurn: async () => {
        forgeCalls++
        return {
          content: "**LUNA SERENITAS website ready**\\n\\n`\\`\\`html filename=index.html\\n<!doctype html><html><head><title>LUNA SERENITAS</title></head><body><h1>Moon resort</h1></body></html>\\n`\\`\\`",
          result: { pages: ["home"], quality: { ok: true, score: 99, issues: [] }, planner: { used: true }, photoStats: { filled: 1 } },
          mode: "new",
        }
      },
    },
    "@/lib/limits/rate-limit": { checkUsageLimit: async () => ({ ok: true }), recordChatUsage: async () => {} },
    "@/lib/server/daily-text-token-quota": { getDailyTextTokenQuota: () => ({ unlimited: true }) },
    "@/lib/server/malik-owner-context": { malikIdentityAnswer: () => null, withVerifiedOwnerChatContext: body => body },
    "@/lib/server/multimodal-router": { estimateMultimodalTokens: () => 0, hasMalikAttachments: () => false, routeMalikAttachments: async () => null },
  })
  const { POST } = streamLoad("app/api/stream/route-impl.ts")
  const response = await POST(new Request("http://fixture.test/api/stream", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ stream: true, originalQuestion: "Build a luxury lunar resort website called LUNA SERENITAS with photos and a live preview", workspaceMode: "work", isProjectRequest: true, forceCanvas: true }) }))
  const wire = await response.text()
  assert.equal(response.status, 200)
  assert.match(wire, /LUNA SERENITAS/)
  assert.match(wire, /<!doctype html>/)
  assert.doesNotMatch(wire, /malik-project|Проект сохранён/)
  assert.equal(forgeCalls, 0); assert.equal(modelCalls, 1); assert.equal(researchCalls, 0)
  assert.match(designContext, /NASA Moon/); assert.match(designContext, /YOU write the actual HTML/)
  assert.equal((wire.match(/^event: done$/gm) || []).length, 1)
})
test("a reused idempotency key cannot silently replace a different brief", async () => {
  const requestId = randomUUID(); await create({ requestId })
  await assert.rejects(create({ requestId, prompt: "Создай другой сайт" }), /IDEMPOTENCY_CONFLICT/)
})
test("quota exhaustion pauses without repeatedly calling the model", async () => {
  let calls = 0
  const job = await drive(await create(), { ...deps, model: async () => { calls++; throw new Error("WEBSITE_TEXT_TOKEN_LIMIT") } })
  assert.equal(job.state, "paused"); assert.equal(calls, 1)
})
test("repeated worker crashes stop after a bounded number of expired leases", async () => {
  let job = await create()
  job = await store.update(job.owner, job.id, current => { current.failures = 2; current.lease = { token: "dead", until: Date.now() - 1 } })
  job = await stepProject(job.owner, job.id, { store, deps })
  assert.equal(job.state, "failed"); assert.equal(job.files.length, 0)
})
test("cross-origin writes are rejected before accessing account projects", async () => {
  const response = await websiteProjectsRequest(new Request("https://app.test/api/website/projects", { method: "POST", headers: { origin: "https://evil.test" }, body: "{}" }))
  assert.equal(response.status, 403)
})
test("media attribution is actual escaped HTML/TSX, idempotent and updated with the version", () => {
  const asset = { slot: "hero", kind: "image", url: "https://images.unsplash.com/a.jpg", sourcePage: "https://unsplash.com/photos/a", creatorUrl: "https://unsplash.com/@artist", credit: "Artist <script> {x}", source: "unsplash", license: "https://unsplash.com/license", mime: "image/jpeg", verifiedAt: new Date().toISOString() }
  const htmlFiles = withAssetCredits([{ path: "index.html", content: html }], [asset])
  assert.match(htmlFiles[0].content, /Artist &lt;script&gt;/)
  assert.equal(withAssetCredits(htmlFiles, [asset])[0].content, htmlFiles[0].content)
  const updated = withAssetCredits(htmlFiles, [{ ...asset, credit: "New Artist" }])[0].content
  assert.match(updated, /New Artist/); assert.doesNotMatch(updated, /Artist &lt;script&gt;/)
  const jsx = withAssetCredits([{ path: "app/layout.tsx", content: 'export default function Layout({children}:any){return <html><body>{children}</body></html>}' }], [asset])
  assert.equal(missingJsxBindings(jsx).length, 0)
  assert.match(jsx[0].content, /Photographer profile/)
})
test("executor rejects another source hash and never sends environment secrets", async () => {
  const saved = { url: process.env.WEBSITE_EXECUTOR_URL, token: process.env.WEBSITE_EXECUTOR_TOKEN, fetch: globalThis.fetch }
  process.env.WEBSITE_EXECUTOR_URL = "https://executor.example.test"
  process.env.WEBSITE_EXECUTOR_TOKEN = "fixture-worker-token-not-real-".repeat(2)
  let sent
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(init.body)
    return Response.json({ id: "receipt", sourceHash: "wrong", status: "completed", isolation: "microvm" })
  }
  try {
    const job = await drive(await create())
    await assert.rejects(executeProject(job, AbortSignal.timeout(2000)), /INVALID_EXECUTOR_RECEIPT/)
    assert.equal(sent.policy.privileged, false); assert.equal(sent.policy.installScripts, false)
    assert.equal(sent.env, undefined); assert.equal(sent.policy.secrets, false)
  } finally {
    if (saved.url === undefined) delete process.env.WEBSITE_EXECUTOR_URL; else process.env.WEBSITE_EXECUTOR_URL = saved.url
    if (saved.token === undefined) delete process.env.WEBSITE_EXECUTOR_TOKEN; else process.env.WEBSITE_EXECUTOR_TOKEN = saved.token
    globalThis.fetch = saved.fetch
  }
})
test("NASA HTTP collection entries are upgraded only on the exact official asset host", async () => {
  const saved = { pexels: process.env.PEXELS_API_KEY, unsplash: process.env.UNSPLASH_ACCESS_KEY }
  delete process.env.PEXELS_API_KEY; delete process.env.UNSPLASH_ACCESS_KEY
  const calls = []
  try {
    const result = await discoverAssets({ ...design, mediaQueries: [{ slot: "hero-video", kind: "video", query: "black hole" }] }, undefined, async (url, init) => {
      calls.push(String(url))
      if (init.method === "HEAD") return new Response(null, { headers: { "content-type": "video/mp4", "content-length": "12000" } })
      if (String(url).includes("images-api.nasa.gov/search")) return Response.json({ collection: { items: [{ href: "https://images-assets.nasa.gov/video/example/collection.json", data: [{ center: "GSFC", nasa_id: "example", description: "Black hole visualization" }], links: [{ rel: "preview", href: "https://images-assets.nasa.gov/video/example/poster.jpg" }] }] } })
      return Response.json(["http://images-assets.nasa.gov/video/example/clip~mobile.mp4", "http://evil.test/clip~preview.mp4"])
    })
    assert.equal(result.assets.length, 1)
    assert.equal(result.assets[0].url, "https://images-assets.nasa.gov/video/example/clip~mobile.mp4")
    assert.ok(calls.every(url => url.startsWith("https://")))
  } finally {
    if (saved.pexels !== undefined) process.env.PEXELS_API_KEY = saved.pexels
    if (saved.unsplash !== undefined) process.env.UNSPLASH_ACCESS_KEY = saved.unsplash
  }
})
test("Render internal Request.url accepts only canonical/exact configured origins", async () => {
  const saved = { mode: process.env.NODE_ENV, render: process.env.RENDER, url: process.env.RENDER_EXTERNAL_URL }
  process.env.NODE_ENV = "production"; process.env.RENDER = "true"; process.env.RENDER_EXTERNAL_URL = "https://malik-fixture.onrender.com"
  try {
    const request = origin => new Request("http://localhost:10000/api/website/projects", { method: "POST", headers: { origin, "Content-Type": "application/json", "x-forwarded-host": "evil.test" }, body: JSON.stringify({ prompt: "Создай сайт" }) })
    assert.equal((await websiteProjectsRequest(request("https://malikaiworld.world"))).status, 202)
    assert.equal((await websiteProjectsRequest(request("https://malik-fixture.onrender.com"))).status, 202)
    assert.equal((await websiteProjectsRequest(request("https://another.onrender.com"))).status, 403)
    assert.equal((await websiteProjectsRequest(request("https://evil.test"))).status, 403)
    const job = await create()
    const files = [{ path: "package.json", content: '{"dependencies":{"next":"16.2.7","react":"19.1.0"}}' }, { path: "app/layout.tsx", content: 'export default function Layout({children}:any){return <html><body>{children}</body></html>}' }, { path: "app/page.tsx", content: 'export default function Page(){return <main>Preview</main>}' }]
    await store.update(job.owner, job.id, current => { current.files = files })
    const previewResponse = await websiteProjectsRequest(new Request(`http://localhost:10000/api/website/projects/${job.id}?preview=1`, { headers: { host: "malikaiworld.world" } }), job.id)
    assert.match((await previewResponse.json()).preview.html, /https:\/\/malikaiworld\.world\/work-preview\//)
    const codeRoute = load("app/api/work/code/route.ts")
    const codeResponse = await codeRoute.POST(new Request("http://localhost:10000/api/work/code", { method: "POST", headers: { "Content-Type": "application/json", host: "malikaiworld.world" }, body: JSON.stringify({ action: "preview", files }) }))
    assert.match((await codeResponse.json()).preview.html, /https:\/\/malikaiworld\.world\/work-preview\//)
  } finally {
    for (const [key, value] of [["NODE_ENV", saved.mode], ["RENDER", saved.render], ["RENDER_EXTERNAL_URL", saved.url]]) if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
})
test("generated source cannot replace the server's verification/attribution receipts", () => {
  for (const path of ["MALIK-VERIFICATION.md", "malik-assets.md"]) assert.throws(() => projectFiles([{ path, content: "fake PASS" }]), /RESERVED_RECEIPT_PATH/)
})
test("creative direction survives a normal edit instead of rerolling the entire visual identity", async () => {
  let job = await drive(await create())
  const creative = structuredClone(job.creative)
  assert.equal(creative.version, 1)
  job = await store.control("owner-fixture", job.id, "edit", "Измени только стили")
  assert.deepEqual(job.creative, creative)
})
test("real experience repair fixes a dead action and cannot erase missing-media evidence", async () => {
  let job = await create()
  const bad = html.replace('href="gallery.html"', 'href="#"')
  job = await store.update(job.owner, job.id, current => { current.state = current.checkpoint = "installing"; current.files = fixtureFiles.map(file => file.path === "index.html" ? { ...file, content: bad } : file); current.design = { ...design, mediaQueries: [{ slot: "photo", kind: "image", query: "space" }] } })
  const repairModel = async (_job, _system, prompt) => {
    assert.match(prompt, /DEAD_PRIMARY_LINK/)
    return JSON.stringify({ files: [{ path: "index.html", content: bad.replace('href="#"', 'href="#result"') }] })
  }
  job = await stepProject(job.owner, job.id, { store, deps: { ...deps, model: repairModel } })
  assert.equal(job.repairAttempts, 1); assert.equal(job.checks.media.status, "fail")
  job = await stepProject(job.owner, job.id, { store, deps })
  assert.equal(job.checks.experience.status, "pass"); assert.equal(job.checks.media.status, "fail")
})
console.log("Website Engine tests: source/queue/compiler/API are real; auth/storage/model/media/executor transports are labelled fixtures. No production sandbox or live model is claimed.")
