import assert from "node:assert/strict"
import { isSafeVisualUrl, isPublicReferenceUrl, sanitizeReferenceImages } from "../lib/media/reference-catalog.ts"
import { referencePhotoTicket, referencePhotoTarget, verifyReferencePhotoTicket } from "../lib/media/reference-photo-ticket.ts"
import { GET as deliver } from "../app/api/chat/reference-photo/route.ts"

const original = globalThis.fetch
// AbortSignal.timeout is unref'ed; fixture fetches have no real network handle.
const keepAlive = setInterval(() => {}, 1000)
const names = ["BRAVE_SEARCH_API_KEY", "SERPER_API_KEY", "TAVILY_API_KEY", "SERPAPI_API_KEY", "PIXABAY_API_KEY"]
const env = new Map(names.map((name) => [name, process.env[name]]))
const plan = { topic: "Mount Everest", queries: ["Mount Everest"], explicit: true, layout: "landscape" }
let serial = 0, cases = 0
async function fresh() {
  const url = new URL("../lib/media/provider-reference-photos.ts", import.meta.url)
  url.searchParams.set("qa", String(serial++))
  return (await import(url.href)).findProviderReferenceImages
}
function keys(...enabled) {
  for (const name of names) {
    if (enabled.includes(name)) process.env[name] = "fixture-only"
    else delete process.env[name]
  }
}
const fixture = {
  BRAVE_SEARCH_API_KEY: { results: [{ title: "Mount Everest summit", url: "https://example.org/everest", thumbnail: { src: "https://imgs.search.brave.com/everest.jpg" } }] },
  SERPER_API_KEY: { images: [{ title: "Mount Everest Nepal", imageUrl: "https://cdn.example.org/everest.jpg", thumbnailUrl: "https://encrypted-tbn0.gstatic.com/images?q=everest&utm_source=fixture", link: "https://example.org/everest" }] },
  TAVILY_API_KEY: { images: [{ url: "https://cdn.example.org/everest.jpg", description: "Mount Everest summit" }] },
  SERPAPI_API_KEY: { images_results: [{ title: "Mount Everest summit", original: "https://cdn.example.org/everest.jpg", thumbnail: "https://serpapi.com/searches/everest.jpeg", link: "https://example.org/everest" }] },
  PIXABAY_API_KEY: { hits: [{ tags: "Mount Everest Nepal", webformatURL: "https://cdn.pixabay.com/everest.jpg", pageURL: "https://pixabay.com/photos/everest", imageWidth: 1600, imageHeight: 1000, user: "Photographer" }] },
}
try {
  for (const [name, response] of Object.entries(fixture)) {
    keys(name)
    const search = await fresh()
    let calls = 0
    globalThis.fetch = async (url, init) => {
      calls++
      assert.equal(init.redirect, "error", "keys must never follow an API redirect")
      if (name === "BRAVE_SEARCH_API_KEY") assert.equal(init.headers["X-Subscription-Token"], "fixture-only")
      if (name === "SERPER_API_KEY") assert.equal(init.headers["X-API-KEY"], "fixture-only")
      if (name === "TAVILY_API_KEY") {
        assert.equal(init.headers.Authorization, "Bearer fixture-only")
        assert.equal(JSON.parse(init.body).include_image_descriptions, true)
      }
      return Response.json(response)
    }
    const images = await search(plan, AbortSignal.timeout(3000))
    assert.equal(calls, 1)
    assert.equal(images.length, 1, name + " must return a usable image")
    assert(isSafeVisualUrl(images[0].url))
    if (name === "TAVILY_API_KEY") {
      assert(images[0].url.startsWith("/api/chat/reference-photo?"))
      assert.equal(verifyReferencePhotoTicket(images[0].url), response.images[0].url)
    }
    const cached = await search(plan, AbortSignal.timeout(3000))
    assert.equal(cached.length, 1)
    assert.equal(calls, 1, "repeat must not spend another provider credit")
    if (name === "SERPER_API_KEY") {
      const replacement = await search(plan, AbortSignal.timeout(3000), { excludedUrls: [images[0].url] })
      assert.equal(referencePhotoTarget(replacement[0].url), response.images[0].imageUrl)
      assert.equal(calls, 1, "broken thumbnail reuses cached original")
    }
    cases++
  }
  keys()
  {
    const search = await fresh()
    globalThis.fetch = async (url) => {
      assert(String(url).startsWith("https://api.openverse.org/v1/images/"))
      return Response.json({ results: [
        { title: "Mount Everest summit", url: "https://cdn.example.org/open.jpg", foreign_landing_url: "https://example.org/photo", creator: "Author", license: "cc-by", license_version: "4.0" },
        { title: "Mount Everest explicit", url: "https://cdn.example.org/unsafe.jpg", mature: true },
        { title: "Unrelated beach", url: "https://cdn.example.org/beach.jpg" },
      ] })
    }
    const images = await search(plan, AbortSignal.timeout(3000))
    assert.equal(images.length, 1)
    assert.equal(images[0].credit, "Openverse · Author")
    assert.equal(images[0].license, "CC-BY 4.0")
    assert.equal(images[0].sourceUrl, "https://example.org/photo")
    cases++
  }
  {
    keys("BRAVE_SEARCH_API_KEY", "SERPER_API_KEY")
    const search = await fresh(), calls = []
    globalThis.fetch = async (url) => {
      calls.push(String(url))
      return String(url).includes("api.search.brave.com") ? new Response("quota", { status: 429 }) : Response.json(fixture.SERPER_API_KEY)
    }
    assert.equal((await search(plan, AbortSignal.timeout(3000)))[0].credit, "Serper Images")
    assert.equal(calls.length, 2)
    assert.equal((await search({ ...plan, queries: ["Mount Everest Nepal"] }, AbortSignal.timeout(3000)))[0].credit, "Serper Images")
    assert.equal(calls.filter((url) => url.includes("api.search.brave.com")).length, 1, "exhausted provider is skipped during cooldown")
    cases++
  }
  {
    keys("BRAVE_SEARCH_API_KEY")
    const search = await fresh()
    let active = 0, peak = 0, calls = 0
    globalThis.fetch = async (url) => {
      active++; calls++; peak = Math.max(active, peak)
      await new Promise((resolve) => setTimeout(resolve, 15))
      active--
      const query = new URL(url).searchParams.get("q")
      return Response.json({ results: [{ title: query + " summit", thumbnail: { src: "https://imgs.search.brave.com/bounded.jpg" } }] })
    }
    await Promise.all(Array.from({ length: 26 }, (_, i) => search({ ...plan, queries: ["Mount Everest check" + i] }, AbortSignal.timeout(3000))))
    assert(peak <= 2 && peak > 0)
    assert(calls <= 24, "global minute quota bounds credit usage")
    assert.equal(active, 0)
    cases++
  }
  {
    keys("BRAVE_SEARCH_API_KEY")
    const search = await fresh()
    globalThis.fetch = async (_, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }))
    await Promise.all(Array.from({ length: 6 }, () => search(plan, AbortSignal.timeout(30))))
    globalThis.fetch = async () => Response.json(fixture.BRAVE_SEARCH_API_KEY)
    assert.equal((await search(plan, AbortSignal.timeout(1000)))[0].credit, "Brave Images", "cancelled jobs release active slots")
    assert.deepEqual(await search({ ...plan, logo: true }, AbortSignal.timeout(100)), [])
    assert.deepEqual(await search({ ...plan, kind: "tutorial" }, AbortSignal.timeout(100)), [])
    assert.deepEqual(await search(plan, AbortSignal.abort()), [])
    cases++
  }
  {
    const external = "https://cdn.example.org/everest.jpg", ticket = referencePhotoTicket(external)
    assert(ticket && isSafeVisualUrl(ticket))
    assert.equal(verifyReferencePhotoTicket(ticket), external)
    assert.equal(sanitizeReferenceImages([{ url: ticket, alt: "Everest", credit: "Tavily Images" }])[0].url, ticket, "sanitizer preserves ticket parameters")
    const response = await deliver(new Request("https://malikaiworld.world" + ticket))
    assert.equal(response.status, 307)
    assert.equal(response.headers.get("location"), external)
    assert.equal(response.headers.get("referrer-policy"), "no-referrer")
    const tampered = ticket.replace("u=", "u=Y")
    assert.equal((await deliver(new Request("https://malikaiworld.world" + tampered))).status, 404)
    assert.equal((await deliver(new Request("https://malikaiworld.world" + ticket + "&u=other"))).status, 404)
    assert.equal((await deliver(new Request("https://malikaiworld.world/api/chat/reference-photo?url=" + encodeURIComponent(external)))).status, 404)
    assert(!isSafeVisualUrl(external), "untrusted model URLs do not become permitted")
    for (const url of ["http://cdn.example.org/a.jpg", "https://localhost./a.jpg", "https://127.0.0.1/a.jpg", "https://[::1]/a.jpg", "https://metadata.google.internal/a.jpg", "https://localtest.me/a.jpg", "https://127.0.0.1.nip.io/a.jpg", "https://user:pass@cdn.example.org/a.jpg", "https://cdn.example.org:8080/a.jpg", "https://cdn.example.org/a.jpg?api_key=private"]) {
      assert(!isPublicReferenceUrl(url), url)
      assert.equal(referencePhotoTicket(url), undefined)
    }
    const savedNow = Date.now
    try { Date.now = () => savedNow() + 3 * 86400000; assert.equal(verifyReferencePhotoTicket(ticket), undefined) }
    finally { Date.now = savedNow }
    cases++
  }
  console.log("PASS " + cases + " provider scenarios: all adapters, free fallback, attribution, cache, recovery, cooldown, 2-call concurrency, quota, cancellation and signed delivery")
} finally {
  clearInterval(keepAlive)
  globalThis.fetch = original
  for (const name of names) {
    const old = env.get(name)
    if (old === undefined) delete process.env[name]
    else process.env[name] = old
  }
}
