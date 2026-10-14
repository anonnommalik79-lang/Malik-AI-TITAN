// Malik Work code projects: safe files and ZIPs, real diagnostics, the
// compiled preview, honest statuses, the /api/work/code route with the real
// private store, and the generator's self-repair on compiler diagnostics.
//
//   node scripts/verify-work-code.mjs
import test from "node:test"
import assert from "node:assert/strict"
import { deflateRawSync } from "node:zlib"
import { workTestLoader } from "./work-test-loader.mjs"

let frequencyAllowed = true
let session = { userId: "guest:qa", authenticated: false, plan: "free" }
const modelCalls = []
let modelScript = []
const load = workTestLoader({
  "@/lib/server/request-entitlement": { resolveRequestEntitlement: async () => session },
  "@/lib/server/request-frequency": { takeRequestFrequency: () => frequencyAllowed },
  "@/lib/server/malik-model-router": {
    runStrictMalikModel: async (input) => {
      modelCalls.push(input)
      if (/Project QA/.test(input.systemPrompt)) return { content: "PASS" }
      return { content: modelScript.shift() ?? "", provider: "fixture", model: "fixture" }
    },
  },
})

const files = load("lib/work/code/files.ts")
const { readProjectZip, ZipReadError } = load("lib/work/code/zip-read.ts")
const { analyzeProject, compareDiagnostics } = load("lib/work/code/diagnostics.ts")
const { buildProjectPreview, previewCsp } = load("lib/work/code/preview.ts")
const { projectStatus } = load("lib/work/code/status.ts")
const store = load("lib/os/store.ts")
store.configureOsBackend(store.memoryBackend())
const { POST } = load("app/api/work/code/route.ts")
const { generateProjectWithBrain } = load("lib/ai/project-builder.ts")

const NEXT = [
  { path: "package.json", content: JSON.stringify({ name: "shop", scripts: { build: "next build" }, dependencies: { next: "16.2.7", react: "19.1.0", "react-dom": "19.1.0", "lucide-react": "^0.564.0" } }) },
  { path: "tsconfig.json", content: '{\n // comments are legal here\n "compilerOptions": { "paths": { "@/*": ["./*"] } }\n}' },
  { path: "app/layout.tsx", content: 'import "./globals.css"\nexport const metadata = { title: "Shop" }\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ru"><body>{children}</body></html> }' },
  { path: "app/globals.css", content: "body { margin: 0 } .card { padding: 8px }" },
  { path: "app/page.tsx", content: 'import Link from "next/link"\nimport { Cart } from "@/components/Cart"\nexport default function Page() { return <main><Cart /><Link href="/about">About</Link></main> }' },
  { path: "app/about/page.tsx", content: "export default async function About() { return <p>About</p> }" },
  { path: "app/blog/[slug]/page.tsx", content: "export default function Post({ params }: { params: { slug: string } }) { return <h1>{params.slug}</h1> }" },
  { path: "app/(marketing)/pricing/page.tsx", content: "export default function Pricing() { return <h1>Pricing</h1> }" },
  { path: "app/api/orders/route.ts", content: 'import { NextResponse } from "next/server"\nexport async function GET() { return NextResponse.json([]) }' },
  { path: "components/Cart.tsx", content: '"use client"\nimport { useState } from "react"\nimport { ShoppingCart } from "lucide-react"\nexport function Cart() { const [n, setN] = useState(0); return <button onClick={() => setN(n + 1)}><ShoppingCart /> {n}</button> }' },
]

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function makeZip(entries, options = {}) {
  const chunks = [], central = []; let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name), data = Buffer.from(entry.data), packed = entry.store ? data : deflateRawSync(data)
    const crc = entry.badCrc ? 1 : crc32(data)
    const flags = 0x800 | (entry.encrypted ? 1 : 0)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(entry.store ? 0 : 8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    chunks.push(local, name, packed)
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(flags, 8); head.writeUInt16LE(entry.store ? 0 : 8, 10); head.writeUInt32LE(crc, 16); head.writeUInt32LE(entry.zip64 ? 0xffffffff : packed.length, 20); head.writeUInt32LE(entry.declared ?? data.length, 24); head.writeUInt16LE(name.length, 28); head.writeUInt32LE(offset, 42)
    central.push(head, name); offset += 30 + name.length + packed.length
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(options.count ?? entries.length, 8); end.writeUInt16LE(options.count ?? entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, directory, end])
}
const zipError = (buffer) => { try { readProjectZip(buffer); return null } catch (error) { return error instanceof ZipReadError ? error.code : String(error) } }

// ── Files ──────────────────────────────────────────────────────────────────
test("paths: traversal, absolute, drive, control characters and home are refused", () => {
  for (const bad of ["../etc/passwd", "a/../../b", "/etc/passwd", "C:\\Windows\\x", "~/.ssh/id_rsa", "a//b", "a/./b", "x\u0000y", "", ".".repeat(300)]) assert.equal(files.safeProjectPath(bad), null, bad)
  assert.equal(files.safeProjectPath("./src\\app\\page.tsx"), "src/app/page.tsx")
})
test("files: secrets, generated folders, binaries, size and count limits are left out and reported", () => {
  const input = [
    { path: "app/page.tsx", content: "export default 1" }, { path: ".env", content: "KEY=1" }, { path: ".env.local", content: "K=1" }, { path: ".env.example", content: "KEY=" },
    { path: "node_modules/x/index.js", content: "" }, { path: "dist/app.js", content: "" }, { path: "keys/server.pem", content: "x" }, { path: "logo.png", content: "x" },
    { path: "big.ts", content: "x".repeat(files.PROJECT_LIMITS.fileChars + 1) }, { path: "app/page.tsx", content: "dup" }, { path: "bin.ts", content: "a\u0000b" },
  ]
  const result = files.normalizeProjectFiles(input)
  assert.deepEqual(result.files.map((file) => file.path), ["app/page.tsx", ".env.example"])
  assert.deepEqual(result.rejected.map((item) => item.code), ["SECRET_FILE", "SECRET_FILE", "IGNORED_DIRECTORY", "IGNORED_DIRECTORY", "SECRET_FILE", "BINARY_OR_UNSUPPORTED", "TOO_LARGE", "DUPLICATE", "BINARY_OR_UNSUPPORTED"])
  const many = files.normalizeProjectFiles(Array.from({ length: files.PROJECT_LIMITS.files + 5 }, (_, index) => ({ path: `f${index}.ts`, content: "1" })))
  assert.equal(many.files.length, files.PROJECT_LIMITS.files); assert.equal(many.rejected.filter((item) => item.code === "LIMIT_FILES").length, 5)
})
test("files: a picked folder behaves like its contents; tree lists folders first", () => {
  const stripped = files.stripCommonRoot([{ path: "my-app/src/a.ts", content: "" }, { path: "my-app/package.json", content: "" }])
  assert.deepEqual(stripped.map((file) => file.path), ["src/a.ts", "package.json"])
  const tree = files.projectTree([{ path: "b.ts", content: "" }, { path: "src/z.ts", content: "" }, { path: "a.ts", content: "" }, { path: "src/lib/x.ts", content: "" }])
  assert.deepEqual(tree.map((node) => node.name), ["src", "a.ts", "b.ts"]); assert.deepEqual(tree[0].children.map((node) => node.name), ["lib", "z.ts"])
})

// ── ZIP ────────────────────────────────────────────────────────────────────
test("zip: a deflated project is read; unsafe and generated entries are skipped, not extracted", () => {
  const buffer = makeZip([{ name: "app/page.tsx", data: "export default function P() { return null }" }, { name: "README.md", data: "# x", store: true }, { name: "../evil.ts", data: "x" }, { name: "/etc/passwd", data: "x" }, { name: "node_modules/a.js", data: "x" }, { name: ".env", data: "S=1" }, { name: "img/a.png", data: "x" }, { name: "dir/", data: "" }])
  const result = readProjectZip(buffer)
  assert.deepEqual(result.files.map((file) => file.path), ["app/page.tsx", "README.md"])
  assert.deepEqual(result.skipped.map((item) => item.code), ["UNSAFE_PATH", "UNSAFE_PATH", "IGNORED_DIRECTORY", "SECRET_FILE", "BINARY_OR_UNSUPPORTED"])
})
test("zip: bombs, encryption, wrong CRC/size, ZIP64, too many entries and non-ZIP data are refused", () => {
  assert.equal(zipError(makeZip([{ name: "bomb.txt", data: "0".repeat(900_000) }])), "ZIP_BOMB_RATIO")
  assert.equal(zipError(makeZip([{ name: "a.ts", data: "x", encrypted: true }])), "ZIP_ENCRYPTED")
  assert.equal(zipError(makeZip([{ name: "a.ts", data: "hello", badCrc: true }])), "ZIP_CRC_OR_SIZE")
  assert.equal(zipError(makeZip([{ name: "a.ts", data: "hello", declared: 4 }])), "ZIP_CRC_OR_SIZE")
  assert.equal(zipError(makeZip([{ name: "a.ts", data: "x", zip64: true }])), "ZIP64_UNSUPPORTED")
  assert.equal(zipError(makeZip([{ name: "a.ts", data: "x" }], { count: 4000 })), "ZIP_TOO_MANY_ENTRIES")
  assert.equal(zipError(Buffer.from("not a zip file at all, definitely not")), "ZIP_SIGNATURE")
  const large = readProjectZip(makeZip([{ name: "huge.txt", data: "x".repeat(1_100_000), store: true }]))
  assert.deepEqual(large.skipped.map((item) => item.code), ["TOO_LARGE"])
})

// ── Diagnostics ────────────────────────────────────────────────────────────
test("diagnostics: a correct Next.js project has no errors; aliases, comments in tsconfig and builtins are understood", () => {
  const analysis = analyzeProject(NEXT)
  assert.equal(analysis.stack, "next-app"); assert.deepEqual(analysis.diagnostics, [])
  assert.ok(analysis.checks.some((check) => /серверных модулей/.test(check)))
  const node = analyzeProject([{ path: "package.json", content: '{"name":"n"}' }, { path: "index.js", content: 'const fs = require("node:fs"); const path = require("path"); module.exports = { fs, path }' }])
  assert.equal(node.counts.errors, 0)
})
test("diagnostics: real errors with file, line and column", () => {
  const broken = analyzeProject([
    { path: "package.json", content: JSON.stringify({ name: "x", scripts: { build: "next build" }, dependencies: { next: "16", react: "19", "react-dom": "19" } }) },
    { path: "tsconfig.json", content: "{ bad json" },
    { path: "app/layout.tsx", content: "export default function L({ children }) { return <html><body>{children}</body></html> }" },
    { path: "app/page.tsx", content: 'import { useState } from "react"\nimport { Chart } from "recharts"\nimport Card from "../components/Card"\nexport default function P() { const [a] = useState(0); return <div>{a}<Card /></div> }' },
    { path: "app/about/page.tsx", content: "export default function A() { return <div>oops</div" },
    { path: "app/error.tsx", content: "export default function E() { return null }" },
    { path: "app/client/page.tsx", content: '"use client"\nexport const metadata = { title: "x" }\nexport default function C() { return null }' },
    { path: "app/globals.css", content: "body { color: red;\n.a { x: 1 }" },
    { path: "public/index.html", content: '<img src="missing.png">' },
  ])
  const codes = broken.diagnostics.map((item) => `${item.code}@${item.file}:${item.line}`)
  for (const expected of ["JSON_INVALID@tsconfig.json:1", "DEPENDENCY_MISSING@app/page.tsx:2", "IMPORT_NOT_FOUND@app/page.tsx:3", "TS1005@app/about/page.tsx:1", "NEXT_CLIENT_CODE_IN_SERVER@app/page.tsx:4", "NEXT_ERROR_NOT_CLIENT@app/error.tsx:1", "NEXT_METADATA_IN_CLIENT@app/client/page.tsx:2", "CSS_UNBALANCED@app/globals.css:2", "HTML_REFERENCE_MISSING@public/index.html:1"]) assert.ok(codes.includes(expected), `${expected} not in ${codes.join(", ")}`)
  assert.ok(broken.counts.errors >= 8)
  const fixed = analyzeProject(NEXT)
  assert.deepEqual(compareDiagnostics(broken.diagnostics, fixed.diagnostics).introduced, 0)
  assert.equal(compareDiagnostics(broken.diagnostics, fixed.diagnostics).improved, true)
})
test("diagnostics: a hook is fine behind a \"use client\" boundary, and an error in a server import chain is found", () => {
  const ok = analyzeProject([{ path: "app/layout.tsx", content: "export default function L({ children }) { return children }" }, { path: "app/page.tsx", content: 'import W from "../ui/W"\nexport default function P() { return <W /> }' }, { path: "ui/W.tsx", content: '"use client"\nimport { useState } from "react"\nexport default function W() { useState(1); return null }' }])
  assert.equal(ok.counts.errors, 0)
  const deep = analyzeProject([{ path: "app/layout.tsx", content: "export default function L({ children }) { return children }" }, { path: "app/page.tsx", content: 'import S from "../ui/S"\nexport default function P() { return <S /> }' }, { path: "ui/S.tsx", content: 'export default function S() { return <button onClick={() => 1}>x</button> }' }])
  assert.deepEqual(deep.diagnostics.filter((item) => item.severity === "error").map((item) => item.code + "@" + item.file), ["NEXT_CLIENT_CODE_IN_SERVER@ui/S.tsx"])
})

// ── Preview ────────────────────────────────────────────────────────────────
test("preview: a Next.js app compiles to a sandbox page with routes, layouts and only local runtime scripts", () => {
  const preview = buildProjectPreview(NEXT, { runtimeBase: "https://malikaiworld.world", token: "tok" })
  assert.equal(preview.ok, true); assert.equal(preview.mode, "next-app")
  assert.deepEqual(preview.routes, ["/", "/about", "/pricing", "/blog/[slug]"])
  assert.match(preview.html, /<script src="https:\/\/malikaiworld\.world\/work-preview\/react-18\.3\.1\.production\.min\.js">/)
  assert.match(preview.html, /lucide-react-0\.564\.0\.min\.js/)
  assert.ok(!/unpkg|cdn\.tailwindcss|jsdelivr/.test(preview.html), "no third-party CDN")
  const csp = previewCsp("https://malikaiworld.world", "next-app")
  assert.match(csp, /connect-src 'none'/); assert.match(csp, /script-src 'unsafe-inline' https:\/\/malikaiworld\.world\/work-preview\//); assert.ok(!/unsafe-eval/.test(csp))
  assert.ok(preview.html.includes("localStorage") && preview.html.indexOf("Object.defineProperty(window,n") < preview.html.indexOf("__MALIK_MODULES__"), "storage shim runs before project code")
  assert.ok(preview.limitations.some((item) => /API-маршруты/.test(item)))
  assert.ok(!preview.html.includes("app/api/orders/route.ts\"]=function"), "API routes are not shipped to the browser")
})
test("preview: project code cannot close the runtime script; JSON config cannot break out", () => {
  const preview = buildProjectPreview([
    { path: "app/layout.tsx", content: "export default function L({ children }) { return children }" },
    { path: "app/page.tsx", content: 'export default function P() { return <p>{"</script><script>alert(1)</script>"}</p> }' },
    { path: "app/x</script>/page.tsx", content: "export default function Q() { return null }" },
  ], { runtimeBase: "http://localhost:3000", token: "t" })
  const scripts = preview.html.match(/<script\b[^>]*>/gi) || []
  assert.ok(scripts.length <= 7, `unexpected script tags: ${scripts.length}`)
  assert.ok(!/<\/script><script>alert/.test(preview.html))
})
test("preview: static sites inline local files; React/Vite runs src/main; unsupported stacks say why", () => {
  const site = buildProjectPreview([{ path: "index.html", content: '<html><head><link rel="stylesheet" href="style.css"></head><body><h1>Hi</h1><script src="app.js"></script></body></html>' }, { path: "style.css", content: "h1{color:red}" }, { path: "app.js", content: "console.log(1)" }], { runtimeBase: "http://x", token: "t" })
  assert.equal(site.mode, "html"); assert.ok(site.html.includes("h1{color:red}") && site.html.includes("console.log(1)") && site.html.includes("Content-Security-Policy"))
  const vite = buildProjectPreview([{ path: "package.json", content: '{"dependencies":{"react":"18","react-dom":"18"},"devDependencies":{"vite":"5"}}' }, { path: "index.html", content: '<html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>' }, { path: "src/main.tsx", content: 'import { createRoot } from "react-dom/client"\nimport App from "./App"\ncreateRoot(document.getElementById("root")!).render(<App />)' }, { path: "src/App.tsx", content: "export default function App() { return <h1>Vite</h1> }" }], { runtimeBase: "http://x", token: "t" })
  assert.equal(vite.mode, "react"); assert.equal(vite.entry, "src/main.tsx"); assert.ok(vite.html.includes('<div id="root"></div>'))
  assert.equal(buildProjectPreview([{ path: "main.py", content: "print(1)" }], { runtimeBase: "http://x", token: "t" }).reason, "SERVER_ONLY_PROJECT")
  assert.equal(buildProjectPreview([{ path: "package.json", content: '{"dependencies":{"next":"14"}}' }, { path: "pages/index.tsx", content: "export default function P() { return null }" }], { runtimeBase: "http://x", token: "t" }).reason, "NEXT_PAGES_ROUTER_UNSUPPORTED")
  const tailwind = buildProjectPreview([{ path: "app/layout.tsx", content: 'import "./globals.css"\nexport default function L({ children }) { return children }' }, { path: "app/globals.css", content: "@tailwind base;" }, { path: "app/page.tsx", content: 'import { z } from "zod"\nexport default function P() { return null }' }], { runtimeBase: "http://x", token: "t" })
  assert.ok(tailwind.limitations.some((item) => /Tailwind/.test(item)) && tailwind.limitations.some((item) => /«zod» недоступен/.test(item)))
})

// ── Status ─────────────────────────────────────────────────────────────────
test("status: verified only when the preview really rendered; errors are never «done»", () => {
  const clean = { counts: { errors: 0, warnings: 0 } }, preview = { ok: true, reason: null, limitations: [] }
  assert.equal(projectStatus({ analysis: clean, preview, runtime: { ready: true, errors: [] } }).status, "COMPLETED_VERIFIED")
  assert.equal(projectStatus({ analysis: clean, preview }).status, "CHECKING")
  assert.equal(projectStatus({ analysis: clean, preview, runtime: { ready: false, errors: [] } }).status, "CHECKING")
  assert.equal(projectStatus({ analysis: clean, preview, runtime: { ready: true, errors: ["boom"] } }).status, "FAILED")
  assert.equal(projectStatus({ analysis: { counts: { errors: 2, warnings: 0 } }, preview, runtime: { ready: true, errors: [] } }).status, "FAILED")
  assert.equal(projectStatus({ analysis: { counts: { errors: 0, warnings: 1 } }, preview, runtime: { ready: true, errors: [] } }).status, "COMPLETED_WITH_LIMITATIONS")
  assert.equal(projectStatus({ analysis: clean, preview: { ok: false, reason: "SERVER_ONLY_PROJECT", limitations: [] } }).status, "COMPLETED_WITH_LIMITATIONS")
  assert.equal(projectStatus({ analysis: null }).status, "BLOCKED")
  assert.equal(projectStatus({ analysis: clean, cancelled: true }).status, "CANCELLED")
})

// ── Route with the real private store ──────────────────────────────────────
const call = (body, { contentType = "application/json", raw } = {}) => POST(new Request("http://localhost:3000/api/work/code", { method: "POST", headers: { "content-type": contentType }, body: raw ?? JSON.stringify(body) }))
test("route: analyze and preview for a guest; nothing stored", async () => {
  session = { userId: "guest:qa", authenticated: false, plan: "free" }
  const analyzed = await (await call({ action: "analyze", files: NEXT })).json()
  assert.equal(analyzed.ok, true); assert.equal(analyzed.analysis.counts.errors, 0)
  const previewed = await (await call({ action: "preview", files: NEXT })).json()
  assert.equal(previewed.preview.ok, true); assert.match(previewed.preview.token, /^[0-9a-f-]{36}$/); assert.match(previewed.preview.html, /http:\/\/localhost:3000\/work-preview\//)
  assert.equal(previewed.status.status, "CHECKING")
  const saved = await call({ action: "save", files: NEXT })
  assert.equal(saved.status, 401)
})
test("route: ZIP upload is unpacked, normalized and analyzed", async () => {
  const zip = makeZip([{ name: "proj/package.json", data: '{"name":"p","dependencies":{}}' }, { name: "proj/index.js", data: "module.exports = 1" }, { name: "proj/.env", data: "S=1" }])
  const result = await (await call({ action: "unzip", zipBase64: zip.toString("base64") })).json()
  assert.deepEqual(result.files.map((file) => file.path), ["package.json", "index.js"]); assert.ok(result.skipped.some((item) => item.code === "SECRET_FILE"))
  const bad = await call({ action: "unzip", zipBase64: Buffer.from("nope nope nope nope nope nope").toString("base64") })
  assert.equal(bad.status, 400); assert.equal((await bad.json()).code, "ZIP_SIGNATURE")
})
test("route: save stores the project for its owner only, with versions", async () => {
  session = { userId: "user:alice@example.com", authenticated: true, plan: "free" }
  const first = await (await call({ action: "save", files: NEXT, title: "Shop" })).json()
  assert.equal(first.ok, true); assert.equal(first.totalFiles, NEXT.length)
  const artifact = await store.getArtifact("user:alice@example.com", first.artifactId)
  assert.equal(artifact.kind, "code"); assert.equal(JSON.parse(artifact.content).files.length, NEXT.length); assert.equal(artifact.metadata.errors, 0)
  assert.equal(await store.getArtifact("user:bob@example.com", first.artifactId), null, "another account cannot read it")
  const second = await (await call({ action: "save", files: NEXT.slice(0, 5), title: "Shop", revisionOf: first.artifactId })).json()
  const revision = await store.getArtifact("user:alice@example.com", second.artifactId)
  assert.equal(revision.version, 2); assert.deepEqual(revision.links, [{ relation: "revision-of", artifactId: first.artifactId }]); assert.equal(second.projectId, first.projectId)
  session = { userId: "user:bob@example.com", authenticated: true, plan: "free" }
  const foreign = await (await call({ action: "save", files: NEXT.slice(0, 2), revisionOf: first.artifactId })).json()
  assert.notEqual(foreign.projectId, first.projectId, "a foreign revisionOf starts a new project of the caller")
})
test("route: bounded and validated input; rate limited", async () => {
  assert.equal((await call(null, { contentType: "text/plain", raw: "{}" })).status, 400)
  assert.equal((await call(null, { raw: "{not json" })).status, 400)
  assert.equal((await call({ action: "analyze", files: [{ path: "../x.ts", content: "1" }] })).status, 400)
  assert.equal((await call({ action: "nope", files: NEXT })).status, 400)
  frequencyAllowed = false
  assert.equal((await call({ action: "analyze", files: NEXT })).status, 429)
  frequencyAllowed = true
})

// ── Self-repair in generation ──────────────────────────────────────────────
const block = (list) => list.map((file) => `<<<FILE:${file.path}>>>\n${file.content}\n<<<END_FILE>>>`).join("\n")
const README = { path: "README.md", content: "# Shop\n\nA small shop with a catalog and a cart that survives page reloads.\n\n## Run\n\nnpm install\nnpm run dev\nnpm run build\n\n## Features\n\n- Catalog with filters\n- Cart with local persistence between visits\n- Checkout form with validation and clear error states\n- Keyboard accessible controls and responsive layout\n\n## Architecture\n\nApp Router pages, client components for interactive parts.\n" }
const GLOBALS = { path: "app/globals.css", content: "body { margin: 0; font-family: system-ui; } " + ".card { padding: 12px; border-radius: 12px; border: 1px solid #ddd; } ".repeat(6) }
test("self-repair: compiler errors go back to the model; the fixed project passes", async () => {
  modelCalls.length = 0
  const brokenFiles = [README, GLOBALS, { path: "app/layout.tsx", content: 'import "./globals.css"\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html> }' }, { path: "app/page.tsx", content: 'import { useState } from "react"\nexport default function Page() { const [n, setN] = useState(0); return <button onClick={() => setN(n + 1)}>{n}</button> }' }]
  const fixedFiles = brokenFiles.map((file) => file.path === "app/page.tsx" ? { ...file, content: '"use client"\n' + file.content } : file)
  modelScript = [block(brokenFiles), block(fixedFiles)]
  const result = await generateProjectWithBrain({ prompt: "Сделай счётчик" })
  assert.equal(result.status, "completed"); assert.equal(result.qa.rounds, 2)
  const repairPrompt = modelCalls.filter((item) => !/Project QA/.test(item.systemPrompt))[1].prompt
  assert.match(repairPrompt, /app\/page\.tsx:2:\d+ .*use client.*\[NEXT_CLIENT_CODE_IN_SERVER\]/)
  assert.ok(result.qa.checks.some((check) => /compiler diagnostics clean/.test(check)))
})
test("self-repair: stops when a repair does not improve, and reports failure honestly", async () => {
  modelCalls.length = 0
  const broken = [README, GLOBALS, { path: "app/layout.tsx", content: 'import "./globals.css"\nexport default function L({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html> }' }, { path: "app/page.tsx", content: 'import X from "./missing"\nexport default function P() { return <X /> }' }]
  modelScript = [block(broken), block(broken), block(broken)]
  const result = await generateProjectWithBrain({ prompt: "Сделай страницу" })
  assert.equal(result.status, "failed"); assert.equal(result.qa.rounds, 2, "no third attempt after a repair that did not help")
  assert.ok(result.qa.issues.some((issue) => /IMPORT_NOT_FOUND/.test(issue)))
})

// ── Export, documents and data (acceptance 10–20) ─────────────────────────
test("export: the studio's ZIP is a valid archive that reads back to the same files", async () => {
  const { zipFiles } = load("components/sovereign/os/preview.ts")
  const blob = zipFiles(NEXT)
  const back = readProjectZip(Buffer.from(await blob.arrayBuffer()))
  assert.deepEqual(back.files.map((file) => file.path), NEXT.map((file) => file.path))
  assert.equal(back.files.find((file) => file.path === "components/Cart.tsx").content, NEXT.find((file) => file.path === "components/Cart.tsx").content)
})
test("documents: DOCX, PDF and XLSX are real files with the content, tables and page numbers", async () => {
  const { exportDocument } = load("lib/work/documents/export.ts")
  const { PDFDocument } = await import("pdf-lib")
  const markdown = "# Отчёт о продажах\n\nКвартальный обзор.\n\n| Месяц | Выручка |\n|---|---|\n| Январь | 1200 |\n| Февраль | 1500 |\n\n" + "Подробный абзац с выводами и рекомендациями. ".repeat(220)
  const docx = await exportDocument({ format: "docx", title: "Отчёт", markdown })
  const docxFiles = readProjectZip(Buffer.from(docx.bytes)).files
  const body = docxFiles.find((file) => file.path === "word/document.xml")?.content || ""
  assert.ok(body.includes("Отчёт о продажах") && body.includes("<w:tbl>") && body.includes("Февраль"), "DOCX has the heading and a real table")
  const pdf = await exportDocument({ format: "pdf", title: "Отчёт", markdown })
  assert.equal(Buffer.from(pdf.bytes.subarray(0, 5)).toString(), "%PDF-")
  const loaded = await PDFDocument.load(pdf.bytes)
  assert.ok(loaded.getPageCount() >= 2, `pages: ${loaded.getPageCount()}`); assert.equal(loaded.getTitle(), "Отчёт")
  const xlsx = await exportDocument({ format: "xlsx", title: "Отчёт", markdown })
  const { readXlsx } = load("lib/os/data/xlsx.ts")
  assert.deepEqual(readXlsx(Buffer.from(xlsx.bytes)).slice(0, 3), [["Месяц", "Выручка"], ["Январь", "1200"], ["Февраль", "1500"]])
})
test("data analyst: CSV and XLSX are profiled exactly; missing values and empty columns are reported, not invented", () => {
  const { parseCsv, toTable, profileTable } = load("lib/os/data/table.ts")
  const csv = "region,sales,date,note\nNorth,100,2026-01-01,\nSouth,,2026-01-02,x\nNorth,300,2026-01-03,\nEast,200,2026-01-04,\n"
  const profile = profileTable(toTable(parseCsv(csv)))
  const sales = profile.profiles.find((column) => column.name === "sales")
  assert.equal(profile.rows, 4); assert.equal(sales.type, "number"); assert.equal(sales.missing, 1); assert.equal(sales.mean, 200); assert.equal(sales.median, 200); assert.equal(sales.sum, 600)
  assert.equal(profile.profiles.find((column) => column.name === "date").type, "date")
  assert.equal(profile.profiles.find((column) => column.name === "note").missing, 3)
  const empty = profileTable(toTable(parseCsv("a,b\n,\n,\n")))
  assert.ok(empty.profiles.every((column) => column.type === "empty" && column.mean === undefined), "no number is made up for an empty column")
})
