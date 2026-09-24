import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

/**
 * A five-second clip took five to ten minutes. None of that was the video model
 * being slow in a way we could not control - it was four choices stacked on top
 * of each other, each of which multiplied the wait:
 *
 * 1. The studio hardcoded `resolution: "1080p"` on every request. On Wan, 1080P
 *    is roughly three times the render of 720P, and nothing in the UI could
 *    change it - the popover showed 1080p as a fixed, non-adjustable setting.
 * 2. `prompt_extend: true` asked DashScope to run its own LLM rewrite of a
 *    prompt we had already compiled ourselves, inside the render clock.
 * 3. That local compiler was a blocking call to a large model with a twelve
 *    second timeout, before the job could even be queued.
 * 4. The owner account was pinned to ten seconds, which doubles the render.
 *
 * These assertions exist so none of the four creeps back.
 */

function codeOf(file) {
  // Only comments that start their own line are stripped. Matching "/*"
  // anywhere would also match it inside a string - this file's own providers
  // send an Accept header of "...,*/*;q=0.8" - and the fake comment then ran to
  // the next "*/" somewhere far below, silently deleting the very code the
  // assertions were about. Deleted code cannot fail a grep, so the tests went
  // green while checking nothing.
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
    console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`)
  }
}

const studio = codeOf("components/sovereign/video-generation/VideoGenerationStudio.tsx")
const dashboard = codeOf("components/sovereign/dashboard.tsx")
const videoRuntime = codeOf("components/sovereign/MalikVideoModelRuntime.tsx")
const provider = codeOf("lib/media/providers/titan-video.ts")

console.log("\nwhat used to make a five second clip take ten minutes")

check("the video studio shows a loading shell while its lightweight chunk arrives", () => {
  assert.match(
    dashboard,
    /const\s+VideoGenerationStudio\s*=\s*dynamic\s*\(/,
    "the video studio should stay out of the initial dashboard bundle",
  )
  assert.match(
    dashboard,
    /data-video-studio-loading/,
    "opening the video studio must never show an unexplained blank screen",
  )
  assert.match(
    dashboard,
    /activeView\s*===\s*["']video-generation["'][\s\S]{0,160}return\s+<VideoGenerationStudio/,
    "the selected sidebar view must render the video studio",
  )
})

check("the video limit observer cannot trigger an infinite mutation loop", () => {
  assert.match(videoRuntime, /copy\s*&&\s*copy\.textContent\s*!==\s*copyText/,
    "model copy may only be rewritten when its value actually changed")
  assert.match(videoRuntime, /tier\s*&&\s*tier\.textContent\s*!==\s*tierText/,
    "model tier may only be rewritten when its value actually changed")
  assert.ok(!/if\s*\(copy\)\s*copy\.textContent\s*=/.test(videoRuntime),
    "an unconditional text rewrite would wake the document MutationObserver forever")
  assert.ok(!/if\s*\(tier\)\s*\{\s*tier\.textContent\s*=/.test(videoRuntime),
    "an unconditional tier rewrite would wake the document MutationObserver forever")
})

check("the studio no longer hardcodes 1080p on every render", () => {
  assert.ok(!/resolution:\s*"1080p"/.test(studio), "1080p must not be pinned in the request")
  assert.match(studio, /resolution:\s*selectedResolution/, "resolution must follow the capability-safe quality control")
  assert.match(studio, /QUALITY_RESOLUTION\[quality\]/, "the quality toggle must still drive the requested resolution")
  assert.match(studio, /selectedCapability\.resolutions/, "provider capabilities must prevent impossible resolution requests")
})

check("1080p is the default, and 720p is available for a faster render", () => {
  assert.match(studio, /useState<Quality>\("max"\)/, "1080p is the point of the studio and stays default")
  assert.match(studio, /fast:\s*"720p"/, "720p must be reachable for a fast render")
  assert.match(studio, /max:\s*"1080p"/)
})

check("quality is adjustable, not a fixed label", () => {
  assert.match(studio, /Качество/, "the popover must offer a quality control")
  assert.ok(!/mv__fixed-setting[^>]*>\s*<Check[^>]*\/>\s*1080p/.test(studio),
    "1080p must not be shown as an unchangeable setting any more")
})

check("five seconds is the starting duration for everyone", () => {
  assert.match(studio, /useState<Duration>\(5\)/, "duration must start at 5")
  assert.ok(!/ownerTenSecond/.test(studio), "no account should be pinned to the ten second render")
})

check("the prompt pipeline is exactly what it was", () => {
  // Everything that could change how the finished shot looks is unchanged: the
  // large model does the translation, its budget is the same, and DashScope's
  // own rewrite still runs. The speed comes from clip duration and from not
  // rounding the finish time up, neither of which touches a single pixel.
  assert.match(provider, /DASHSCOPE_PROMPT_MODEL \|\| "qwen-plus"/,
    "the translation step must keep the model that preserves detail")
  assert.match(provider, /max_tokens: 900/, "the compiler's room to describe the shot is unchanged")
  assert.match(provider, /DASHSCOPE_PROMPT_TIMEOUT_MS \|\| 12_000/, "the compiler budget is unchanged")
  assert.ok(!/alreadyCinematicEnglish/.test(provider),
    "no prompt may bypass the compiler: that was a behaviour change with nothing to gain")
})

check("DashScope's own rewrite still runs, and can be switched off deliberately", () => {
  assert.match(provider, /prompt_extend: process\.env\.DASHSCOPE_PROMPT_EXTEND/,
    "prompt_extend must default to on, as before, and be switchable")
  assert.ok(!/prompt_extend:\s*!compiledPrompt/.test(provider),
    "it must not be silently disabled whenever our compiler succeeded")
})

check("1080p is the server-side default too", () => {
  assert.match(provider, /VIDEO_DEFAULT_RESOLUTION/, "the default must be configurable")
  assert.match(provider, /\|\| "1080p"/, "a request that names no resolution still renders 1080p")
})

check("polling does not add five seconds to a fast render", () => {
  const polling = /i === 0 \? (\d+) : i < 12 \? (\d+) : (\d+)/.exec(studio)
  assert.ok(polling, "polling cadence must remain explicit and reviewable")
  const [, first, early, late] = polling.map(Number)
  assert.ok(first <= 1500, "the first status check must happen within 1.5 seconds")
  assert.ok(early <= 2500, "early polling must stay within 2.5 seconds")
  assert.ok(late <= 5000, "late polling must never regress past five seconds")
})

// The classifier that decides whether a prompt needs rewriting is real logic,
// so it is exercised rather than only grepped for.
const compiled = ts.transpileModule(
  fs.readFileSync("lib/media/providers/titan-video.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText.replace(/import[^;]+;/g, "")

const probe = await import(`data:text/javascript,${encodeURIComponent(
  `${compiled}\nexport const __kept = keptTheRequest;`,
)}`)

console.log("\nthe rewrite must still be the request that was made")

check("a faithful rewrite is accepted", () => {
  assert.equal(
    probe.__kept(
      "три кота бегут по ночной улице под дождём",
      "Cinematic tracking shot of 3 cats running along a rain-soaked night street, neon reflections, shallow depth of field",
    ),
    true,
  )
})

check("a rewrite that drops the count is rejected", () => {
  assert.equal(
    probe.__kept(
      "три кота бегут по ночной улице под дождём",
      "Cinematic tracking shot of a cat running along a rain-soaked night street, neon reflections, shallow depth of field",
    ),
    false,
  )
})

check("a number written out in words still counts as kept", () => {
  assert.equal(
    probe.__kept(
      "три кота бегут по ночной улице под дождём",
      "Cinematic tracking shot of three cats running along a rain-soaked night street, neon reflections",
    ),
    true,
  )
})

check("dropped dialogue is rejected", () => {
  assert.equal(
    probe.__kept(
      'мужчина смотрит в камеру и говорит «я вернусь завтра утром» крупным планом на закате',
      "Close-up of a man looking into the camera at sunset, golden hour, shallow depth of field, cinematic",
    ),
    false,
  )
  assert.equal(
    probe.__kept(
      'мужчина смотрит в камеру и говорит «я вернусь завтра утром» крупным планом на закате',
      'Close-up of a man looking into the camera at sunset, speaking in Russian: «я вернусь завтра утром», golden hour, cinematic',
    ),
    true,
  )
})

check("a one-line summary of a long request is rejected", () => {
  assert.equal(
    probe.__kept(
      "снег идёт над старым городом, камера медленно поднимается над крышами, вдалеке горит маяк, чайки кружат над водой",
      "A snowy city.",
    ),
    false,
  )
})

check("a short request is not judged by length", () => {
  assert.equal(probe.__kept("кот", "A cat, cinematic close-up"), true)
})

check("Kazakh numerals that are ordinary Russian words do not cause false rejections", () => {
  // "он" is ten in Kazakh and "he" in Russian; "бес" is five in Kazakh and a
  // demon in Russian. Checking them on a Russian request rejected correct
  // rewrites for not containing a number nobody asked for.
  assert.equal(probe.__kept("он бежит по улице ночью под дождём", "A man runs down a rainy street at night, cinematic tracking shot"), true)
  assert.equal(probe.__kept("бес кружит над городом в тумане", "A demon circles above a foggy city, cinematic wide shot"), true)
})

check("Kazakh counts are still enforced on a Kazakh request", () => {
  assert.equal(probe.__kept("үш мысық түнгі көшеде жүгіреді", "Three cats run along a night street, cinematic"), true)
  assert.equal(probe.__kept("үш мысық түнгі көшеде жүгіреді", "A cat runs along a night street, cinematic"), false)
})

check("the sound instruction still reaches every compiled prompt", () => {
  // Wan has no audio parameter - the soundtrack is steered entirely by the
  // prompt, so the compiler's audio line is the only thing driving it.
  assert.match(provider, /synchronized ambience, sound effects/,
    "the compiler must still ask for synchronized audio")
})

console.log(failures ? `\n${failures} failing\n` : "\nall video speed checks passed\n")
process.exit(failures ? 1 : 0)
