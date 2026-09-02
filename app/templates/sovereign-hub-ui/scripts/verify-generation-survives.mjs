import assert from "node:assert/strict"
import fs from "node:fs"

/**
 * A picture must not be cancelled by anything except the person.
 *
 * The failure this guards against was visible as "Фото не создано - Fetch is
 * aborted" while the server was, at the same moment, generating the picture
 * perfectly well: a live check against the deployed API returned 200 with a
 * real 2048x1170 image in 17 seconds. Nothing was wrong with generation. The
 * browser was hanging up on it.
 *
 * It hung up because media generation shared a controller with the chat turn,
 * and "is a turn running" was inferred by watching whether a send button was
 * disabled in the DOM. Seventeen seconds is far longer than a chat turn, so by
 * the time the picture came back its controller had been abandoned or reused.
 */

function codeOf(file) {
  return fs.readFileSync(file, "utf8")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
}

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${String(error.message).split("\n")[0]}`)
  }
}

const runtime = codeOf("components/sovereign/MalikTurnRuntime.tsx")
const route = codeOf("lib/media/generate-photo-route.ts")

console.log("\ngeneration outlives the turn that started it")

check("media generation has its own controller, not the chat turn's", () => {
  assert.match(runtime, /mediaControllerRef/)
  assert.match(runtime, /MEDIA_TURN_PATHS/)
  // The photo and video endpoints must be out of the set whose members get
  // aborted when a new turn begins.
  const primary = /const PRIMARY_TURN_PATHS = new Set\(\[([\s\S]*?)\]\)/.exec(runtime)?.[1] || ""
  assert.doesNotMatch(primary, /generate\/photo/, "a photo must not be treated as a chat turn")
  assert.doesNotMatch(primary, /generate\/video/, "a video must not be treated as a chat turn")
})

check("every media endpoint is routed to that controller", () => {
  const media = /const MEDIA_TURN_PATHS = new Set\(\[([\s\S]*?)\]\)/.exec(runtime)?.[1] || ""
  for (const path of [
    "/api/generate/photo",
    "/api/generate/video",
    "/api/ai/video/status",
    "/api/generate/video/status",
    "/api/media/video/status",
  ]) {
    assert.ok(media.includes(path), `${path} must run on the media controller`)
  }
})

check("starting a chat turn does not touch it", () => {
  // beginTurn aborts the previous turn. It must only ever reach the turn
  // controller, never the media one.
  const begin = /const beginTurn = \(\) => \{([\s\S]*?)\n    \}/.exec(runtime)?.[1] || ""
  assert.ok(begin, "beginTurn must still exist")
  assert.doesNotMatch(begin, /mediaControllerRef/, "a new message must not cancel a picture")
})

check("unmounting does not cancel it either", () => {
  // Leaving the chat for another section remounts this runtime. That must not
  // throw away work in progress.
  const cleanup = runtime.slice(runtime.indexOf("window.fetch = nativeFetch\n      window.removeEventListener"))
  assert.ok(cleanup, "the cleanup block must still exist")
  const firstBlock = cleanup.slice(0, cleanup.indexOf("}, [])"))
  assert.doesNotMatch(firstBlock, /mediaControllerRef\.current\?\.abort|mediaControllerRef\.current\.abort/,
    "switching sections must not cancel a picture")
})

check("the stop button is the one thing that does cancel it", () => {
  const stop = /const stopTurn = \(\) => \{([\s\S]*?)\n  \}/.exec(runtime)?.[1] || ""
  assert.ok(stop, "stopTurn must still exist")
  assert.match(stop, /mediaStopRequestedRef\.current = true/)
  assert.match(stop, /media\.abort\(\)/)
})

check("a status poll cannot resurrect work the person cancelled", () => {
  assert.match(runtime, /mediaStopRequestedRef\.current\) \{[\s\S]{0,220}?throw stoppedError\(\)/)
})

console.log("\ngeneration outlives the connection that asked for it")

check("a dropped connection does not cancel the render", () => {
  // request.signal fires when the tab closes or the phone sleeps. Handing it to
  // the generator threw away both the work and the quota already spent on it.
  const call = /routeImageGeneration\(\{([\s\S]*?)\n    \}\)/.exec(route)?.[1] || ""
  assert.ok(call, "the generation call must still exist")
  assert.doesNotMatch(call, /signal: request\.signal/, "generation must not be tied to the client connection")
})

check("the result is persisted, so it is there when the person comes back", () => {
  assert.match(route, /uploadMediaAsset/)
  assert.match(route, /saveMediaAsset/)
})

check("a second request cannot pile up behind the first", () => {
  // This lock is what makes the change above safe: at most one generation per
  // person can be running with nobody listening to it.
  assert.match(route, /acquireImageGenerationLock/)
  assert.match(route, /IMAGE_GENERATION_ALREADY_RUNNING/)
})

console.log(failures ? `\n${failures} failing\n` : "\nall generation-survival checks passed\n")
process.exit(failures ? 1 : 0)
