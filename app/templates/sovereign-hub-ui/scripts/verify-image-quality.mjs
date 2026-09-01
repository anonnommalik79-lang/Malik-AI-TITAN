import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"
import { createRequire } from "node:module"

/**
 * Delivery above 2K.
 *
 * The quality pipeline stopped at a 2048px long edge, and the request was for
 * 4K, 8K and 16K. The parts that make that safe rather than merely possible:
 *
 * - the model still renders at its own native size, because asking a diffusion
 *   model for more pixels than it was trained on produces duplicated faces and
 *   limbs, not detail. Everything above native is an enlargement, and this file
 *   is about doing that enlargement well;
 * - one Lanczos jump from 1440 to 15360 rings badly, so the climb happens in
 *   doublings with a light pass between them;
 * - 16K is ~133 megapixels and this repo already carries commits titled
 *   "prevent OOM" and "stop generation from freezing Chromium", so an
 *   oversized request is clamped to what fits rather than taking the process
 *   down.
 */

const require_ = createRequire(import.meta.url)

/**
 * `stubs` maps a module specifier to a JavaScript expression that stands in for
 * it. The expression is evaluated inside the loaded module, so it can refer to
 * any name in `scope` - which is how a module that has already been loaded for
 * real is handed to the next one instead of being stubbed with a fake.
 */
function load(file, stubs = {}, scope = {}) {
  let code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  for (const [name, value] of Object.entries(stubs)) {
    code = code.replace(new RegExp(`require\\("${name.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}"\\)`, "g"), value)
  }
  const box = { exports: {} }
  const names = Object.keys(scope)
  new Function("require", "module", "exports", ...names, code)(
    require_,
    box,
    box.exports,
    ...names.map((name) => scope[name]),
  )
  return box.exports
}

function codeOf(file) {
  return fs.readFileSync(file, "utf8")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
}

const presets = load("lib/media/image-quality-presets.ts", {
  "./image-model-capabilities": "{ getMalikImageModelCapability: () => ({ maxSteps: 40, minSteps: 4, maxGuidance: 9, defaultGuidance: 4 }) }",
})

// The budget is normally derived from host memory, so it differs between a
// laptop and a 512MB Render instance. Pinning it here is what makes the clamping
// assertions below mean something on any machine; a separate check covers the
// derivation itself.
process.env.IMAGE_MAX_MEGAPIXELS = "140"

// The real presets, not a copy of them: a test that asserts 16K is 15360px is
// worthless if it asserts it against a number written in the test file.
const post = load(
  "lib/media/image-postprocess.ts",
  {
    "server-only": "{}",
    "./asset-store": "{ decodeDataUrl: () => null }",
    "./image-quality-presets": "__presets",
  },
  { __presets: presets },
)

const intent = load("lib/media/image-resolution-intent.ts", {
  "./image-quality-presets": "__presets",
}, { __presets: presets })

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

console.log("\ndelivery sizes above 2K")

check("4K, 8K and 16K exist as real tiers with real long edges", () => {
  const all = presets.MALIK_IMAGE_QUALITY_PRESETS
  assert.equal(all.ultra4k.targetLongEdge, 3840)
  assert.equal(all.ultra8k.targetLongEdge, 7680)
  assert.equal(all.ultra16k.targetLongEdge, 15360)
  for (const id of ["ultra4k", "ultra8k", "ultra16k"]) {
    assert.ok(presets.isMalikImageQuality(id), `${id} must be accepted from a request`)
  }
})

check("every prompt gets the high tier without having to ask", () => {
  // "добавь что под каждым промптом будет 8к 16к скрытно" - the size is applied
  // silently, and the words never reach the model.
  assert.equal(presets.DEFAULT_MALIK_IMAGE_QUALITY, "ultra8k")
  assert.equal(presets.resolveMalikImageQuality(undefined), "ultra8k")
  assert.equal(presets.resolveMalikImageQuality("nonsense"), "ultra8k")
})

check("sharpening falls as the enlargement grows", () => {
  const all = presets.MALIK_IMAGE_QUALITY_PRESETS
  assert.ok(all.ultra4k.sharpen > all.ultra8k.sharpen, "the same sharpen on a bigger jump reads as crunch")
  assert.ok(all.ultra8k.sharpen > all.ultra16k.sharpen)
})

console.log("\nspeed, from measurement rather than folklore")

check("the enlargement is one Lanczos pass, not a ladder of doublings", () => {
  // Stepped enlargement is standard advice and it is wrong here. Scored against
  // a real 5760px original - shrink to 1440, enlarge back, compare - one jump
  // scored 33.84dB against the ladder's 31.01dB and took a quarter of the time.
  // Lanczos3's support scales with the ratio, so it already does in one pass
  // what the ladder approximates; the intermediate passes only accumulate error.
  const source = codeOf("lib/media/image-postprocess.ts")
  assert.equal((source.match(/\.resize\(/g) || []).length, 1, "exactly one resize")
  assert.doesNotMatch(source, /while \(.*currentLong/, "the ladder loop must be gone")
  assert.match(source, /kernel: sharp\.kernel\.lanczos3/)
})

check("one decode and one encode, in a single streamed pipeline", () => {
  const source = codeOf("lib/media/image-postprocess.ts")
  assert.equal((source.match(/\.webp\(/g) || []).length, 1)
  assert.equal((source.match(/\.jpeg\(/g) || []).length, 1)
  // Intermediate buffers are what force extra codec round-trips; there are none.
  assert.doesNotMatch(source, /\.raw\(\)\.toBuffer/, "no intermediate raw round-trip")
  assert.doesNotMatch(source, /\.png\(\{ compressionLevel/, "no intermediate PNG round-trip")
})

check("mozjpeg is off, because it cost seventeen times as much", () => {
  // Measured at 7680px: mozjpeg 4:4:4 took 10.8s, plain took 0.6s - and plain at
  // q95 produced the larger file, so it is keeping more of the picture.
  const source = codeOf("lib/media/image-postprocess.ts")
  assert.match(source, /mozjpeg: false/)
  assert.doesNotMatch(source, /mozjpeg: true/)
})

check("chroma is only subsampled where the block is invisible", () => {
  const source = codeOf("lib/media/image-postprocess.ts")
  assert.match(source, /FULL_CHROMA_UP_TO/)
  assert.match(source, /"4:4:4" : "4:2:0"/, "small frames keep full chroma, huge ones do not")
})

check("libvips thread count is set rather than left at the container default", () => {
  // sharp.concurrency() reported 1 on a two-core host: every stage ran twice as
  // long as it needed to. This is the cheapest speed-up in the file.
  const source = codeOf("lib/media/image-postprocess.ts")
  assert.match(source, /sharp\.concurrency\(threads\)/)
  assert.match(source, /SHARP_CONCURRENCY/, "a shared host must be able to cap it")
})

check("sharpening stops where it stops being worth twenty seconds", () => {
  // 0.5 sharpen costs ~2.6s at 5760px and ~20s at 15360px, and moves PSNR by
  // 0.05dB. At a 10x enlargement every edge is interpolated: there is no real
  // detail left to sharpen.
  const source = codeOf("lib/media/image-postprocess.ts")
  assert.match(source, /SHARPEN_UP_TO/)
  assert.match(source, /finalLong <= SHARPEN_UP_TO/)
})

check("orientation is baked in before the frame is measured", () => {
  // Orientations 5-8 are quarter turns: the header's width and height are the
  // wrong way round, and a portrait would be enlarged against the wrong edge.
  const source = codeOf("lib/media/image-postprocess.ts")
  assert.match(source, /quarterTurned/)
  assert.match(source, /\.rotate\(\)/)
})

console.log("\nnot taking the server down to do it")

check("an oversized request is clamped instead of refused", () => {
  const { clampToMegapixels } = post
  // 16:9 at 15360 is about 133 MP: inside the default budget.
  assert.equal(clampToMegapixels(15360, 16 / 9, true), 15360)
  // A square 16K is 236 MP and must come back smaller rather than as an error.
  const square = clampToMegapixels(15360, 1, true)
  assert.ok(square > 0 && square < 15360, `a square 16K must be clamped, got ${square}`)
  assert.equal(clampToMegapixels(0, 1, true), 0)
})

check("the budget is configurable, because the ceiling is the host's not ours", () => {
  assert.match(codeOf("lib/media/image-postprocess.ts"), /IMAGE_MAX_MEGAPIXELS/)
})

check("the delivered tier is measured from the file, not from what was asked", () => {
  const { deliveredTier } = post
  assert.equal(deliveredTier(15360), "16k")
  assert.equal(deliveredTier(7680), "8k")
  assert.equal(deliveredTier(3840), "4k")
  assert.equal(deliveredTier(2048), "2k")
  assert.equal(deliveredTier(1440), "native")
  // A clamped 16K request that came out at 8K must not claim to be 16K.
  assert.equal(deliveredTier(9000), "8k")
})

check("very large output is encoded as JPEG, not WebP", () => {
  // WebP at 8K costs more than the enlargement and produces a file browsers
  // struggle to decode.
  const source = codeOf("lib/media/image-postprocess.ts")
  assert.match(source, /JPEG_ABOVE_LONG_EDGE/)
  assert.match(source, /const heavy = finalLong > JPEG_ABOVE_LONG_EDGE/)
})

check("the budget is derived from the host, not from a number in the file", () => {
  const source = codeOf("lib/media/image-postprocess.ts")
  assert.match(source, /os\.totalmem\(\)/, "the same code runs on 512MB and on a workstation")
  assert.match(source, /MEMORY_MEGAPIXEL_CEILING/)
})

console.log("\nasking for a size the way people actually ask")

check("a size written in the prompt is honoured", () => {
  const { readResolutionIntent } = intent
  assert.equal(readResolutionIntent("кот на крыше в 8к").quality, "ultra8k")
  assert.equal(readResolutionIntent("портрет 16К").quality, "ultra16k")
  assert.equal(readResolutionIntent("mountain landscape 4k").quality, "ultra4k")
  assert.equal(readResolutionIntent("street at night in 4K").quality, "ultra4k")
  assert.equal(readResolutionIntent("город 2к").quality, "ultra")
  assert.equal(readResolutionIntent("logo ultra hd").quality, "ultra4k")
})

check("the size word is taken out before the model sees it", () => {
  // "8K" in a prompt is a stock-render cue: it appears in training data next to
  // wallpaper packs and upscaler demos, so leaving it in pulls the picture
  // toward exactly the plastic look the person asked to avoid.
  const { readResolutionIntent } = intent
  assert.equal(readResolutionIntent("кот на крыше в 8к").prompt, "кот на крыше")
  assert.equal(readResolutionIntent("портрет 8к крупным планом").prompt, "портрет крупным планом")
  assert.equal(readResolutionIntent("mountain landscape 4k").prompt, "mountain landscape")
  assert.equal(readResolutionIntent("城市, 16к, ночь").prompt, "城市, ночь")
})

check("a prompt that is only a size keeps its words", () => {
  // Stripping "8к" out of "8к" leaves the model nothing to draw.
  const { readResolutionIntent } = intent
  const only = readResolutionIntent("8к")
  assert.equal(only.quality, "ultra8k")
  assert.equal(only.prompt, "8к")
})

check("word boundaries hold next to Cyrillic", () => {
  // JavaScript's \b is ASCII-only and never fires beside Cyrillic, which is why
  // none of these patterns may use it.
  const { readResolutionIntent } = intent
  assert.equal(readResolutionIntent("мешок 4кг картошки").quality, undefined, "4кг is a weight")
  assert.equal(readResolutionIntent("16кадров в секунду").quality, undefined)
  assert.equal(readResolutionIntent("модель 2048k1 на столе").quality, undefined)
  assert.equal(readResolutionIntent("от 4 к 5 часам").quality, undefined, "'4 к 5' is a range, not a resolution")
  assert.doesNotMatch(codeOf("lib/media/image-resolution-intent.ts"), /\\b/, "\\b must not appear in these patterns")
})

check("the largest size named wins, and the prompt beats the saved setting", () => {
  const { readResolutionIntent, resolveRequestedQuality } = intent
  assert.equal(readResolutionIntent("сделай 4к, а лучше 16к").quality, "ultra16k")

  // Somebody with 16K saved who types "4к" wants this one at 4K.
  assert.equal(resolveRequestedQuality("кот 4к", "ultra16k").quality, "ultra4k")
  // And somebody who never opened settings still gets what they typed.
  assert.equal(resolveRequestedQuality("кот 8к", undefined).quality, "ultra8k")
  // No size in the prompt: the setting stands and the prompt is untouched.
  const plain = resolveRequestedQuality("кот на крыше", "ultra16k")
  assert.equal(plain.quality, "ultra16k")
  assert.equal(plain.prompt, "кот на крыше")
  assert.equal(plain.fromPrompt, false)
})

console.log("\nwired up rather than merely written")

check("the new tiers can be chosen from the picker", () => {
  // Presets nobody can select are dead code with a changelog entry.
  const ui = codeOf("components/sovereign/ImageQualityRuntime.tsx")
  for (const id of ["ultra4k", "ultra8k", "ultra16k"]) {
    assert.match(ui, new RegExp(`"${id}"`), `${id} must appear in the quality control`)
  }
})

check("the route reads the size out of the prompt", () => {
  const route = codeOf("lib/media/generate-photo-route.ts")
  assert.match(route, /resolveRequestedQuality/)
  assert.match(route, /requestedResolution/, "asked-for and delivered must be reported separately")
})

check("sharp is a declared dependency, not one that happens to be there", () => {
  // It was only present as a transitive dependency: `await import("sharp")`
  // failing is caught and silently degrades to passthrough, so the whole
  // quality feature could be off in production with nothing to show for it.
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
  assert.ok(pkg.dependencies.sharp, "sharp must be declared")
})

console.log(failures ? `\n${failures} failing\n` : "\nall image quality checks passed\n")
process.exit(failures ? 1 : 0)
