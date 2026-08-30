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
  return fs.readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
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
const provider = codeOf("lib/media/providers/titan-video.ts")

console.log("\nwhat used to make a five second clip take ten minutes")

check("the studio no longer hardcodes 1080p on every render", () => {
  assert.ok(!/resolution:\s*"1080p"/.test(studio), "1080p must not be pinned in the request")
  assert.match(studio, /resolution:\s*QUALITY_RESOLUTION\[quality\]/, "resolution must follow the quality control")
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
  assert.match(studio, /i === 0 \? 1500 : i < 12 \? 2500 : 5000/,
    "the first checks must be tight so a one minute render is not rounded up")
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
