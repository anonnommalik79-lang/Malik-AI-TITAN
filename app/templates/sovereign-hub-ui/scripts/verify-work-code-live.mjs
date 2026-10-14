// Live acceptance of the Malik Work Code Studio in the real app (guest session).
//
//   MALIK_QA_BASE_URL=http://localhost:3000 node scripts/verify-work-code-live.mjs
//
// A real project folder is written to a temp directory and uploaded through
// the folder picker; a broken project goes in as a ZIP. Every check reads the
// screen, the preview frame or the downloaded file — nothing is assumed.
import { createRequire } from "node:module"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { deflateRawSync, inflateRawSync } from "node:zlib"

const require = createRequire(import.meta.url)
const base = process.env.MALIK_QA_BASE_URL
if (!base) { console.log("SKIP live work code: set MALIK_QA_BASE_URL to a running app"); process.exit(0) }
let engines
try { engines = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright") } catch { console.log("SKIP live work code: Playwright is not installed"); process.exit(0) }

let failures = 0
const ok = (name, condition, extra = "") => { if (!condition) failures += 1; console.log(`${condition ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`) }

const SHOP = {
  "package.json": JSON.stringify({ name: "corner-shop", private: true, scripts: { dev: "next dev", build: "next build" }, dependencies: { next: "16.2.7", react: "19.1.0", "react-dom": "19.1.0", "lucide-react": "^0.564.0" } }, null, 2),
  "tsconfig.json": '{\n  // Next.js\n  "compilerOptions": { "jsx": "react-jsx", "paths": { "@/*": ["./*"] } }\n}\n',
  "app/layout.tsx": 'import "./globals.css"\nexport const metadata = { title: "Corner Shop" }\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="ru"><body className="shop">{children}</body></html>\n}\n',
  "app/globals.css": ".shop { font-family: system-ui; margin: 0 }\n.card { padding: 12px; border: 1px solid #ddd }\n",
  "app/page.tsx": 'import Link from "next/link"\nimport { Cart } from "@/components/Cart"\nexport default function Home() {\n  return <main><h1 id="title">Каталог</h1><Cart /><Link href="/about" id="about-link">О нас</Link></main>\n}\n',
  "app/about/page.tsx": 'export default function About() { return <section><h2 id="about">Мы — магазин у дома</h2></section> }\n',
  "components/Cart.tsx": '"use client"\nimport { useEffect, useState } from "react"\nimport { ShoppingCart } from "lucide-react"\nexport function Cart() {\n  const [count, setCount] = useState(0)\n  useEffect(() => { const saved = Number(localStorage.getItem("cart") || 0); setCount(saved) }, [])\n  return <button id="add" className="card" onClick={() => { localStorage.setItem("cart", String(count + 1)); setCount(count + 1) }}><ShoppingCart size={16} /> В корзине: {count}</button>\n}\n',
  "README.md": "# Corner Shop\n\nnpm install\nnpm run dev\nnpm run build\n",
  ".env": "SECRET_TOKEN=do-not-upload\n",
  "node_modules/react/index.js": "module.exports = {}\n",
  "public/logo.png": "\u0089PNG\u0000binary",
}
const BROKEN = {
  "package.json": JSON.stringify({ name: "broken", scripts: { build: "next build" }, dependencies: { next: "16", react: "19", "react-dom": "19" } }),
  "app/layout.tsx": 'export default function L({ children }) { return <html><body>{children}</body></html> }\n',
  "app/page.tsx": 'import { useState } from "react"\nimport Card from "../components/Card"\nexport default function Page() { const [n] = useState(1); return <div>{n}<Card /></div> }\n',
}
const CRASH = {
  "index.html": '<!doctype html><html><head><title>Crash</title></head><body><div id="root"></div><script src="app.js"></script></body></html>',
  "app.js": 'document.getElementById("root").textContent = "before"; window.setTimeout(function () { missingFunction() }, 50)\n',
}

function writeProject(root, files) {
  for (const [path, content] of Object.entries(files)) { const full = join(root, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, content, "utf8") }
}
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function zip(files) {
  const chunks = [], central = []; let offset = 0
  for (const [path, content] of Object.entries(files)) {
    const name = Buffer.from(`broken-app/${path}`), data = Buffer.from(content), packed = deflateRawSync(data), crc = crc32(data)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    chunks.push(local, name, packed)
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(8, 10); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42)
    central.push(entry, name); offset += 30 + name.length + packed.length
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, dir, end])
}
/** File names inside a stored or deflated ZIP (for the exported archive). */
function zipNames(buffer) {
  const names = []; let end = buffer.length - 22
  while (end > 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--
  let offset = buffer.readUInt32LE(end + 16)
  for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) { const length = buffer.readUInt16LE(offset + 28); names.push(buffer.subarray(offset + 46, offset + 46 + length).toString()); offset += 46 + length + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32) }
  return names
}
void inflateRawSync

const work = mkdtempSync(join(tmpdir(), "malik-work-"))
writeProject(join(work, "corner-shop"), SHOP)
writeFileSync(join(work, "corner-shop/public/logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]))
writeFileSync(join(work, "broken.zip"), zip(BROKEN))
writeProject(join(work, "crash"), CRASH)

async function openStudio(browser, width, lang) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800, acceptDownloads: true })
  await context.addCookies([{ name: "malik-guest", value: "1", url: base }])
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(String(error)))
  await page.goto(base + "/dashboard", { waitUntil: "load", timeout: 180000 })
  await page.locator("textarea").first().waitFor({ timeout: 120000 })
  await page.locator(".malik-workspace-switch button", { hasText: "Работа" }).first().click()
  await page.waitForTimeout(600)
  if (lang) await page.evaluate((value) => { document.documentElement.lang = value }, lang)
  await page.locator("[data-work-code-open]").first().click()
  await page.locator("[data-work-code-studio] .wcs").waitFor({ timeout: 120000 })
  return { context, page, errors }
}
const studioStatus = (page) => page.locator("[data-wcs-status]").first().getAttribute("data-wcs-status")
async function waitStatus(page, wanted, timeout = 30000) {
  const start = Date.now()
  for (;;) {
    const value = await studioStatus(page).catch(() => null)
    if (value && wanted.includes(value)) return value
    if (Date.now() - start > timeout) return value
    await page.waitForTimeout(250)
  }
}

const browser = await engines.chromium.launch()
try {
  for (const width of [1280, 390]) {
    const label = `${width}px`
    const { context, page, errors } = await openStudio(browser, width)
    await page.locator("[data-work-code-studio] input[type=file]").first().setInputFiles(join(work, "corner-shop"))
    const status = await waitStatus(page, ["COMPLETED_VERIFIED", "COMPLETED_WITH_LIMITATIONS", "FAILED"])
    ok(`${label}: an uploaded Next.js folder is checked and its preview renders`, status === "COMPLETED_VERIFIED", status)
    const frame = page.frameLocator("[data-work-code-studio] iframe")
    ok(`${label}: the preview shows the project's own page`, (await frame.locator("#title").innerText({ timeout: 10000 })) === "Каталог")
    await frame.locator("#add").click(); await frame.locator("#add").click()
    ok(`${label}: client state and localStorage work inside the preview`, /В корзине: 2/.test(await frame.locator("#add").innerText()))
    await frame.locator("#about-link").click()
    ok(`${label}: next/link navigates to another page inside the preview`, (await frame.locator("#about").innerText({ timeout: 5000 })).includes("магазин у дома"))
    ok(`${label}: the preview cannot read Malik AI cookies or the parent page`, (await page.frames().find((item) => item.parentFrame() && item.url() === "about:srcdoc")?.evaluate(() => { try { return String(parent.document.title) } catch { return "blocked" } })) === "blocked")
    await page.locator(".wcs-tab", { hasText: "Телефон" }).click()
    const frameWidth = await page.locator("[data-work-code-studio] iframe").evaluate((node) => node.getBoundingClientRect().width)
    ok(`${label}: mobile preview is phone width`, frameWidth <= 390.5 && frameWidth > 300, String(frameWidth))
    await page.locator(".wcs-tab[role=tab]", { hasText: "Код" }).click()
    const tree = await page.locator(".wcs-code__tree").innerText()
    ok(`${label}: the file tree shows the real folders and files`, ["app", "components", "about", "Cart.tsx", "package.json"].every((name) => tree.includes(name)) && !tree.includes("node_modules") && !tree.includes(".env"))
    await page.locator(".wcs-tree__row", { hasText: "Cart.tsx" }).click()
    ok(`${label}: the code viewer shows the file with line numbers`, (await page.locator(".wcs-code__text").innerText()).includes("useState(0)"))
    await page.locator(".wcs-tab[role=tab]", { hasText: "Проблемы" }).click()
    const problems = await page.locator(".wcs-problems").innerText()
    ok(`${label}: secrets, node_modules and binaries were not uploaded and are listed`, /\.env — файл с секретами/.test(problems) && /node_modules\/react\/index\.js — служебная папка/.test(problems) && /logo\.png — бинарный/.test(problems))
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".wcs-button", { hasText: "Скачать ZIP" }).click()])
    const names = zipNames(readFileSync(await download.path()))
    ok(`${label}: «Скачать ZIP» exports exactly the project files`, names.length === 8 && names.includes("app/about/page.tsx") && !names.some((name) => /\.env|node_modules|png/.test(name)), names.join(","))
    await page.locator(".wcs-button", { hasText: "Сохранить в проекты" }).click()
    ok(`${label}: a guest is told to sign in instead of a fake «saved»`, /Войдите в аккаунт/.test(await page.locator(".wcs-error").innerText({ timeout: 10000 })))
    if (width < 800) ok(`${label}: the studio covers the whole phone screen`, (await page.locator("[data-work-code-studio]").evaluate((node) => node.getBoundingClientRect().width)) === width)
    ok(`${label}: no horizontal page scroll`, (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
    ok(`${label}: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 300))
    await context.close()
  }

  {
    const { context, page } = await openStudio(browser, 1280)
    await page.locator("[data-work-code-studio] input[type=file]").nth(2).setInputFiles(join(work, "broken.zip"))
    const status = await waitStatus(page, ["FAILED", "COMPLETED_VERIFIED", "COMPLETED_WITH_LIMITATIONS"])
    ok("broken ZIP: unpacked and reported as failed, not as done", status === "FAILED", status)
    const problems = await page.locator(".wcs-problems").innerText()
    ok("broken ZIP: real problems with file and line", /app\/page\.tsx:2:\d+/.test(problems) && /IMPORT_NOT_FOUND/.test(problems) && /NEXT_CLIENT_CODE_IN_SERVER/.test(problems), problems.slice(0, 300))
    await page.locator(".wcs-problem", { hasText: "IMPORT_NOT_FOUND" }).click()
    ok("broken ZIP: a problem opens the file at its line", (await page.locator(".wcs-line.is-target").innerText()).includes("../components/Card"))
    await context.close()
  }
  {
    const { context, page } = await openStudio(browser, 1280)
    await page.locator("[data-work-code-studio] input[type=file]").first().setInputFiles(join(work, "crash"))
    const status = await waitStatus(page, ["FAILED"], 15000)
    ok("runtime error: an error thrown by the running site makes the result FAILED", status === "FAILED", status)
    await page.locator(".wcs-tab[role=tab]", { hasText: "Проблемы" }).click()
    ok("runtime error: the message from the preview is shown", /missingFunction/.test(await page.locator(".wcs-problems").innerText()))
    await context.close()
  }
  {
    const { context, page } = await openStudio(browser, 390, "ar")
    const dir = await page.locator("[data-work-code-studio] .wcs").getAttribute("dir")
    ok("Arabic: the studio is right-to-left with Arabic words", dir === "rtl" && /اختيار مجلد/.test(await page.locator("[data-work-code-studio]").innerText()))
    await context.close()
  }
} finally { await browser.close() }
console.log(failures ? `\n${failures} FAILED` : "\nall live work code checks passed")
process.exit(failures ? 1 : 0)
