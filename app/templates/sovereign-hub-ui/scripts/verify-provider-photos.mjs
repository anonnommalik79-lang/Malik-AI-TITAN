import assert from "node:assert/strict"
import { findProviderReferenceImages } from "../lib/media/provider-reference-photos.ts"
import { isSafeVisualUrl } from "../lib/media/reference-catalog.ts"

const original = globalThis.fetch
const names = ["BRAVE_SEARCH_API_KEY", "SERPER_API_KEY", "TAVILY_API_KEY", "SERPAPI_API_KEY"]
const env = new Map(names.map((name) => [name, process.env[name]]))
const plan = { topic: "Mount Everest", queries: ["Mount Everest"], explicit: true, layout: "landscape" }
try {
  for (const name of names) delete process.env[name]
  assert.deepEqual(await findProviderReferenceImages(plan, AbortSignal.timeout(100)), [])
  assert(isSafeVisualUrl("https://imgs.search.brave.com/test.jpg"))
  assert(isSafeVisualUrl("https://serpapi.com/searches/test.jpeg"))
  assert(isSafeVisualUrl("https://encrypted-tbn0.gstatic.com/images?q=123"))
  assert(!isSafeVisualUrl("https://evil.example.com/test.jpg"))
  for (const name of names) process.env[name] = "mock-key"
  let calls = []
  globalThis.fetch = async (input) => {
    calls.push(String(input))
    return Response.json({ results: [
      { title: "Mount Everest summit", url: "https://photos.example.com/everest",
        thumbnail: { src: "https://imgs.search.brave.com/everest.jpg" } },
      { title: "Unrelated beach", thumbnail: { src: "https://imgs.search.brave.com/beach.jpg" } },
    ] })
  }
  const brave = await findProviderReferenceImages(plan, AbortSignal.timeout(3000))
  assert.equal(calls.length, 1, "found images should not spend remaining provider credits")
  assert.equal(brave.length, 1, "unrelated images are rejected")
  assert.equal(brave[0].credit, "Brave Images")
  assert.equal(brave[0].sourceUrl, "https://photos.example.com/everest")
  calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    if (String(url).includes("api.search.brave.com")) return new Response("quota", { status: 429 })
    assert.equal(init.headers["X-API-KEY"], "mock-key")
    return Response.json({ images: [{ title: "Mount Everest Nepal",
      imageUrl: "https://tracking.invalid/private.jpg",
      thumbnailUrl: "https://encrypted-tbn0.gstatic.com/images?q=everest",
      link: "https://photos.example.com/everest" }] })
  }
  const serper = await findProviderReferenceImages(plan, AbortSignal.timeout(3000))
  assert.equal(calls.length, 2)
  assert.equal(serper[0]?.credit, "Serper Images")
  calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (!String(url).includes("api.tavily.com")) return new Response("down", { status: 503 })
    return Response.json({ images: [{ url: "https://upload.wikimedia.org/everest.jpg",
      description: "Mount Everest summit" }] })
  }
  const tavily = await findProviderReferenceImages(plan, AbortSignal.timeout(3000))
  assert.equal(calls.length, 3)
  assert.equal(tavily[0]?.credit, "Tavily Images")
  calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (!String(url).includes("serpapi.com")) return new Response("down", { status: 503 })
    return Response.json({ images_results: [{ title: "Mount Everest view",
      thumbnail: "https://serpapi.com/searches/everest.jpeg", link: "https://photos.example.com/everest" }] })
  }
  const serpapi = await findProviderReferenceImages(plan, AbortSignal.timeout(3000))
  assert.equal(calls.length, 4)
  assert.equal(serpapi[0]?.credit, "SerpApi Images")
  assert.deepEqual(await findProviderReferenceImages({ ...plan, logo: true }, AbortSignal.timeout(100)), [])
  assert.deepEqual(await findProviderReferenceImages({ ...plan, kind: "tutorial" }, AbortSignal.timeout(100)), [])
  assert.deepEqual(await findProviderReferenceImages(plan, AbortSignal.abort()), [])
  console.log("PASS Brave, Serper, Tavily, SerpApi fallback, safety, ranking, quotas and abort")
} finally {
  globalThis.fetch = original
  for (const name of names) {
    const old = env.get(name)
    if (old === undefined) delete process.env[name]
    else process.env[name] = old
  }
}
