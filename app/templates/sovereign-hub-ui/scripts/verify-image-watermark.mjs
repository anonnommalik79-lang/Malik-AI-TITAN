import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import sharp from "sharp"
import http from "node:http"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cache = new Map()
function load(file, stubs = {}) {
  const absolute = path.resolve(root, file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const module = { exports: {} }; cache.set(absolute, module)
  const realRequire = createRequire(absolute)
  const require = (name) => {
    if (name in stubs) return stubs[name]
    if (name === "server-only") return {}
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(absolute), name)
      if (fs.existsSync(`${target}.ts`)) return load(`${target}.ts`, stubs)
    }
    return realRequire(name)
  }
  const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function("require", "module", "exports", code)(require, module, module.exports)
  return module.exports
}

const wm = load("lib/media/malik-watermark.ts")
const post = load("lib/media/image-postprocess.ts")
const preview = load("lib/media/image-display-preview.ts")
const output = process.env.MALIK_WATERMARK_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), "malik-watermark-"))
fs.mkdirSync(output, { recursive: true })
let passed = 0
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
const inline = (buffer, mime) => `data:${mime};base64,${buffer.toString("base64")}`

for (const [width, height] of [[768, 1024], [1024, 1024], [1440, 810]]) {
  for (const background of ["#000000", "#ffffff"]) {
    for (const format of ["png", "jpeg", "webp"]) {
      await check(`${width}x${height} ${background} ${format}: saved pixels, contrast, idempotency`, async () => {
        const source = await sharp({ create: { width, height, channels: 3, background } }).toFormat(format).toBuffer()
        const result = await wm.watermarkImageBytes(source)
        const target = path.join(output, `${width}x${height}-${background.slice(1)}.${format === "jpeg" ? "jpg" : format}`)
        fs.writeFileSync(target, result.buffer)
        // Open the actual saved/downloadable file, not an SVG or DOM overlay.
        const saved = fs.readFileSync(target)
        const meta = await sharp(saved).metadata()
        assert.equal(meta.width, width); assert.equal(meta.height, height); assert.equal(meta.format, format)
        assert.ok(wm.hasMalikImageWatermark(meta))
        const box = wm.malikWatermarkLayout(width, height)
        assert.ok(Math.abs((width - box.left - box.width) / width - .025) < .002)
        assert.ok(Math.abs((height - box.top - box.height) / height - .025) < .002)
        const pixels = await sharp(saved).extract({ left: box.left, top: box.top, width: box.width, height: box.height }).removeAlpha().raw().toBuffer()
        const changed = background === "#000000" ? Math.max(...pixels) : 255 - Math.min(...pixels)
        assert.ok(changed >= 135 && changed <= 175, `actual pixel opacity ${changed / 255}`)
        const repeated = await wm.watermarkImageBytes(saved)
        assert.deepEqual(repeated.buffer, saved, "repeat must return identical bytes, no stacked mark or re-encode")
        if (format === "png") {
          const before = await sharp(source).raw().toBuffer()
          const after = await sharp(saved).removeAlpha().raw().toBuffer()
          let changes = 0
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 3
            if (before[index] !== after[index]) {
              changes++
              assert.ok(x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height, "no changed pixels outside wordmark")
            }
          }
          assert.ok(changes > 100, "wordmark must be physically present")
        }
      })
    }
  }
}
await check("EXIF orientation is baked into pixel dimensions", async () => {
  const source = await sharp({ create: { width: 640, height: 960, channels: 3, background: "#ffffff" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const result = await wm.watermarkImageBytes(source)
  assert.equal(result.width, 960); assert.equal(result.height, 640)
  assert.equal((await sharp(result.buffer).metadata()).orientation, undefined)
})
for (const [width, height] of [[3840, 2160], [2048, 256], [256, 2048], [32, 32]]) await check(`native size ${width}x${height} is preserved`, async () => {
  const source = await sharp({ create: { width, height, channels: 3, background: "#303030" } }).png().toBuffer()
  const image = await wm.watermarkImageBytes(source)
  const metadata = await sharp(image.buffer).metadata()
  assert.equal(metadata.width, width); assert.equal(metadata.height, height)
  assert.ok(wm.hasMalikImageWatermark(metadata))
})
await check("legacy adapter mask matches the exact server vector artwork", async () => {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2840" height="400" viewBox="0 0 142 20"><path fill="white" fill-opacity=".60" fill-rule="evenodd" d="${wm.MALIK_WORDMARK_PATH}"/></svg>`)
  const expected = await sharp(svg).raw().toBuffer()
  const mask = await sharp(path.join(root, "../../ai/media_jobs/malik-wordmark.png")).raw().toBuffer()
  assert.deepEqual(mask, expected)
})
await check("transparent PNG keeps alpha and embeds the actual text", async () => {
  const source = await sharp({ create: { width: 1024, height: 768, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
  const result = await wm.watermarkImageBytes(source)
  const { data, info } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.channels, 4); assert.equal(data[3], 0)
  assert.ok(data.some((value, i) => i % 4 === 3 && value >= 140 && value <= 165))
})
await check("postprocessor + preview + reopen preserve the mark", async () => {
  const source = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "#111111" } }).png().toBuffer()
  const master = await post.postProcessGeneratedImage({ imageUrl: inline(source, "image/png"), quality: "draft", effect: "off" })
  assert.equal(master.watermarked, true)
  const display = await preview.createMalikImageDisplayPreview({ buffer: master.buffer, width: master.width, height: master.height })
  assert.ok(display)
  assert.ok(wm.hasMalikImageWatermark(await sharp(display.buffer).metadata()))
  const repeated = await post.postProcessGeneratedImage({ imageUrl: inline(master.buffer, master.mime), quality: "draft", effect: "off" })
  assert.deepEqual(repeated.buffer, master.buffer)
  fs.writeFileSync(path.join(output, "master.webp"), master.buffer)
  fs.writeFileSync(path.join(output, "preview.webp"), display.buffer)
})
await check("corrupt or inaccessible sources fail without unbranded success", async () => {
  await assert.rejects(wm.watermarkImageBytes(Buffer.from("not an image")), /MALIK AI/)
  await assert.rejects(post.postProcessGeneratedImage({ imageUrl: "file:///missing.png", quality: "draft" }), /MALIK AI/)
})

// Real route -> real Sharp -> controlled object store -> HTTP download -> disk.
// Only authentication/credits and the paid provider are fixtures.
const fixture = await sharp({ create: { width: 1024, height: 768, channels: 3, background: "#222222" } }).png().toBuffer()
let generated = inline(fixture, "image/png"), configured = false, uploadFails = false, charged = 0
const stored = new Map()
const server = http.createServer((request, response) => {
  const asset = stored.get(request.url)
  if (!asset) { response.writeHead(404); response.end(); return }
  response.writeHead(200, { "Content-Type": asset.mime, "Content-Length": asset.buffer.length })
  response.end(asset.buffer)
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const address = `http://127.0.0.1:${server.address().port}`
const stubs = {
  "./limits": { normalizeImageCreditSize: () => "1K", checkImageCreditLimit: async () => ({ ok: true, plan: "owner", remaining: 999, remaining4k: 999, daily: 999, cost: 1 }), recordImageCreditUsage: async () => { charged++ } },
  "./request": { resolveMediaUser: async () => ({ userId: "watermark-test-only", plan: "owner" }) },
  "./visual-prompt": { buildVisualPrompt: async (prompt) => ({ prompt, negativePrompt: "" }) },
  "./providers/agnes-image": { agnesImageConfigured: () => true, generateWithAgnesImage: async () => ({ imageUrl: generated, providerModel: "fixture" }) },
  "@/lib/malik-compute/runtime": { withCompute: (handler) => handler },
  "@/lib/storage/cloud-upload": {
    isCloudStorageConfigured: () => configured,
    uploadMediaAsset: async (asset) => {
      if (uploadFails) return { stored: false, reason: "Fixture unavailable store" }
      const route = `/asset-${stored.size}`; stored.set(route, asset)
      return { stored: true, publicUrl: address + route }
    },
  },
}
const handle = load("lib/media/generate-photo-route.ts", stubs).handleMalikPhotoGenerationRequest
const request = () => new Request("https://malik.test/api/media/image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "A quiet lake at sunset", quality: "draft", effect: "off" }) })
async function assertMarkedUrl(url) {
  const response = await fetch(url)
  assert.equal(response.status, 200)
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.ok(wm.hasMalikImageWatermark(await sharp(bytes).metadata()))
  return bytes
}
try {
  for (const route of ["app/api/ai/image/route.ts", "app/api/media/image/route.ts"]) await check(`actual ${route}: all no-storage references branded`, async () => {
    const response = await load(route, stubs).POST(request())
    const body = await response.json()
    assert.equal(response.status, 200); assert.equal(body.watermarked, true)
    assert.equal(body.originalPrompt, "A quiet lake at sunset")
    assert.equal(body.masterUrl, body.imageUrl)
    for (const key of ["imageUrl", "masterUrl", "url", "mediaUrl", "browserCacheImageUrl"]) await assertMarkedUrl(body[key])
  })
  await check("cloud master, preview, share URL and downloaded/reopened file contain the same stamp", async () => {
    configured = true
    const body = await (await handle(request())).json()
    assert.equal(body.durable, true)
    const downloaded = await assertMarkedUrl(body.masterUrl)
    const savedFile = path.join(output, "downloaded-from-storage.webp")
    fs.writeFileSync(savedFile, downloaded)
    assert.ok(wm.hasMalikImageWatermark(await sharp(fs.readFileSync(savedFile)).metadata()))
    await assertMarkedUrl(body.previewUrl)
    assert.match(body.url, /#malik-master=/)
    const download = await load("lib/media/browser-watermark.ts").brandImageInBrowser(body.masterUrl)
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), downloaded, "download must not overlay or re-encode a second stamp")
  })
  await check("failed object store falls back to full branded master, never provider source", async () => {
    uploadFails = true
    const body = await (await handle(request())).json()
    assert.equal(body.durable, false)
    assert.notEqual(body.masterUrl, generated)
    await assertMarkedUrl(body.imageUrl)
    assert.equal((await sharp(await assertMarkedUrl(body.masterUrl)).metadata()).width, 1024)
  })
  await check("failed stamping returns 502 and does not charge image credits", async () => {
    generated = "data:image/png;base64,bm90LWFuLWltYWdl"
    const before = charged
    const response = await handle(request())
    assert.equal(response.status, 502)
    const body = await response.json()
    assert.equal(body.ok, false); assert.equal(body.error, "IMAGE_WATERMARK_FAILED")
    assert.equal(charged, before)
    assert.equal(body.imageUrl, undefined)
  })
  await check("legacy AI response finalization replaces every existing image reference", async () => {
    const finalize = load("lib/media/finalize-image-response.ts").finalizeImageResponse
    const result = await finalize({ success: true, type: "image", provider: "openai", model: "fixture", latencyMs: 0, output: { resultUrl: inline(fixture, "image/png"), imageUrl: "unprocessed", url: "unprocessed" } })
    for (const key of ["resultUrl", "imageUrl", "url"]) await assertMarkedUrl(result.output[key])
  })
} finally { await new Promise((resolve) => server.close(resolve)) }
await check("gallery reopen resolves the preview and preserves its full-resolution master reference", async () => {
  const entries = new Map([
    ["acct:guest:id:preview", { dataUrl: inline(fixture, "image/png") }],
    ["acct:guest:id:master", { dataUrl: inline(fixture, "image/png") }],
  ])
  const previous = globalThis.indexedDB
  globalThis.indexedDB = { open: () => {
    const request = {}
    setTimeout(() => {
      request.result = { close() {}, transaction: () => ({ objectStore: () => ({ get: (id) => {
        const read = {}; setTimeout(() => { read.result = entries.get(id); read.onsuccess() }, 0); return read
      } }) }) }
      request.onsuccess()
    }, 0)
    return request
  } }
  try {
    const store = load("lib/media/client-generated-image-store.ts")
    const master = "malik-image://" + encodeURIComponent("acct:guest:id:master")
    const gallery = "malik-image://" + encodeURIComponent("acct:guest:id:preview") + "#malik-master=" + encodeURIComponent(master)
    const resolved = await store.resolveGeneratedImageUrl(gallery)
    assert.equal(resolved.split("#malik-master=")[0], entries.get("acct:guest:id:preview").dataUrl)
    assert.equal(decodeURIComponent(resolved.split("#malik-master=")[1]), master)
    assert.equal(await store.resolveGeneratedImageUrl(master), entries.get("acct:guest:id:master").dataUrl)
    await assert.rejects(store.resolveGeneratedImageUrl("malik-image://" + encodeURIComponent("acct:another:id:master")), /аккаунту/)
  } finally { globalThis.indexedDB = previous }
})
await check("existing photograph is stamped without losing its dimensions", async () => {
  const source = fs.readFileSync(path.join(root, "public/images/card-photo.jpg"))
  const branded = await wm.watermarkImageBytes(source)
  fs.writeFileSync(path.join(output, "photo-watermarked.jpg"), branded.buffer)
  const sourceMeta = await sharp(source).metadata()
  const savedMeta = await sharp(path.join(output, "photo-watermarked.jpg")).metadata()
  assert.equal(savedMeta.width, sourceMeta.width); assert.equal(savedMeta.height, sourceMeta.height)
  assert.ok(wm.hasMalikImageWatermark(savedMeta))
})
console.log(`${passed}/${passed} PASS; saved files: ${output}`)
