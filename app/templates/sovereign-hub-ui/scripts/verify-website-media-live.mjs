// Opt-in real NASA / --commons metadata + HEAD checks. No media is downloaded,
// no paid provider keys are used, no model or production database is called.
import { workTestLoader } from "./work-test-loader.mjs"
const { discoverAssets } = workTestLoader()("lib/website/engine/media.ts")
const saved = { pexels: process.env.PEXELS_API_KEY, unsplash: process.env.UNSPLASH_ACCESS_KEY }
delete process.env.PEXELS_API_KEY; delete process.env.UNSPLASH_ACCESS_KEY
const started = performance.now()
try {
  const commons = process.argv.includes("--commons")
  const fetcher = process.argv.includes("--trace") ? async (url, init) => {
    const response = await fetch(url, init)
    console.log(JSON.stringify({ method: init?.method || "GET", host: new URL(url).hostname, path: new URL(url).pathname, status: response.status, mime: response.headers.get("content-type"), bytes: response.headers.get("content-length") }))
    return response
  } : fetch
  const result = await discoverAssets(commons ? { direction: "editorial", mediaQueries: [{ slot: "architecture", kind: "image", query: "modern architecture" }] } : { direction: "cinematic", mediaQueries: [{ slot: "space-photo", kind: "image", query: "black hole" }, { slot: "space-video", kind: "video", query: "black hole" }] }, undefined, fetcher)
  console.log(JSON.stringify({ live: true, elapsedMs: Math.round(performance.now() - started), assets: result.assets.map(a => ({ slot: a.slot, kind: a.kind, source: a.source, url: a.url, mime: a.mime, bytes: a.bytes, credit: a.credit, license: a.license })), missing: result.missing }, null, 2))
  if (result.missing.length) process.exitCode = 2
} finally {
  if (saved.pexels !== undefined) process.env.PEXELS_API_KEY = saved.pexels
  if (saved.unsplash !== undefined) process.env.UNSPLASH_ACCESS_KEY = saved.unsplash
}
