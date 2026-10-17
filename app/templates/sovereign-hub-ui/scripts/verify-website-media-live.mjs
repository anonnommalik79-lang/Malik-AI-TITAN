// Opt-in real NASA metadata + HEAD checks. No photos/videos are downloaded,
// no paid provider keys are used, no model or production database is called.
import { workTestLoader } from "./work-test-loader.mjs"
const { discoverAssets } = workTestLoader()("lib/website/engine/media.ts")
const saved = { pexels: process.env.PEXELS_API_KEY, unsplash: process.env.UNSPLASH_ACCESS_KEY }
delete process.env.PEXELS_API_KEY; delete process.env.UNSPLASH_ACCESS_KEY
const started = performance.now()
try {
  const result = await discoverAssets({ direction: "cinematic", mediaQueries: [{ slot: "space-photo", kind: "image", query: "black hole" }, { slot: "space-video", kind: "video", query: "black hole" }] })
  console.log(JSON.stringify({ live: true, provider: "NASA", elapsedMs: Math.round(performance.now() - started), assets: result.assets.map(a => ({ slot: a.slot, kind: a.kind, url: a.url, mime: a.mime, credit: a.credit, license: a.license })), missing: result.missing }, null, 2))
  if (result.missing.length) process.exitCode = 2
} finally {
  if (saved.pexels !== undefined) process.env.PEXELS_API_KEY = saved.pexels
  if (saved.unsplash !== undefined) process.env.UNSPLASH_ACCESS_KEY = saved.unsplash
}
