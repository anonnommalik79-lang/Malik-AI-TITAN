import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

/**
 * The image prompt is the whole product here.
 *
 * What used to reach the model was a two-hundred-word English contract —
 * "AUTHORITATIVE USER REQUEST", "NON-NEGOTIABLE VISUAL FACTS", "MUST NOT
 * INCLUDE", "FIDELITY RULE", "OUTPUT". A diffusion model has no concept of a
 * rule; it draws the tokens it is handed. So the subject drowned in boilerplate
 * (random-looking pictures) and the boilerplate itself got rendered as caption
 * text (pictures made of words). This guards the rewrite.
 */

/** Assertions are about code, not about comments describing what was removed. */
function codeOf(file) {
  return fs.readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
}

async function loadModule(file, stubs = {}) {
  const source = fs.readFileSync(file, "utf8")
  let code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

  // The module talks to the text model; the pure prompt logic is what is tested.
  for (const [specifier, replacement] of Object.entries(stubs)) {
    code = code.replace(
      new RegExp(`import\\s*\\{[^}]*\\}\\s*from\\s*["']${specifier.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}["'];?`, "g"),
      replacement,
    )
  }
  return import(`data:text/javascript,${encodeURIComponent(code)}`)
}

// Offline: translation is stubbed so normalisation and assembly can be asserted.
const offline = await loadModule("lib/media/visual-prompt.ts", {
  "@/lib/server/malik-model-router": "const runStrictMalikModel = async () => { throw new Error('offline') };",
  "./types": "",
})

const { normalizeVisualRequest, buildVisualPrompt, IMAGE_NEGATIVE_PROMPT } = offline

// --- the request survives cleanup, the chatter does not ----------------------

const CLEANUP = [
  ["/image рыжий кот на подоконнике", "рыжий кот на подоконнике"],
  ["сгенерируй фото рыжего кота", "рыжего кота"],
  ["сделай мне картинку красной машины", "красной машины"],
  ["пожалуйста нарисуй горы на закате", "горы на закате"],
  ["хочу фото аэропорта Алматы ночью", "аэропорта Алматы ночью"],
  ["мне нужно изображение двух собак", "двух собак"],
  ["generate an image of a red apple", "a red apple"],
]
for (const [input, expected] of CLEANUP) {
  assert.equal(normalizeVisualRequest(input), expected, `«${input}» должно очиститься до «${expected}»`)
}

// Content words are never dropped, however the user typed them.
for (const input of [
  "кот сидит на красном диване в комнате с окном",
  "екі бала футбол ойнап жатыр",
  "чёрный мерседес под дождём ночью, неон",
  "portrait of an old man with a grey beard",
]) {
  const cleaned = normalizeVisualRequest(input)
  assert.ok(cleaned.length >= input.length * 0.6, `Очистка не должна съедать смысл: «${input}» → «${cleaned}»`)
}

// --- assembled prompt carries no instructions --------------------------------

const FORBIDDEN_IN_PROMPT = [
  "AUTHORITATIVE", "NON-NEGOTIABLE", "MUST APPEAR", "MUST NOT", "FIDELITY RULE",
  "OUTPUT:", "REQUIRED ", "PRIMARY SUBJECT", "RENDER IT LITERALLY", "collage",
  "watermark", "never", "do not",
]

for (const request of [
  "/image рыжий кот на подоконнике",
  "сделай фото красной машины возле моря",
  "two dogs running on a beach at sunset",
]) {
  const built = await buildVisualPrompt(request)
  assert.ok(built.prompt.length > 0, "Промпт не должен быть пустым")
  for (const banned of FORBIDDEN_IN_PROMPT) {
    assert.equal(
      built.prompt.toLowerCase().includes(banned.toLowerCase()),
      false,
      `В промпт не должно попадать «${banned}»: ${built.prompt}`,
    )
  }
  assert.ok(built.prompt.length < 620, "Промпт должен оставаться коротким")
}

// A style is added only when the caller explicitly asked for one.
const plain = await buildVisualPrompt("красная машина")
const cinematic = await buildVisualPrompt("красная машина", "cinematic")
assert.equal(plain.prompt, "красная машина", "Без выбранного режима промпт остаётся как есть")
assert.equal(cinematic.prompt, "красная машина, cinematic photograph", "Режим добавляет два слова, не абзац")

// Prohibitions belong in the negative field, and must cover rendered text.
for (const token of ["text", "caption", "letters", "watermark", "collage", "border"]) {
  assert.ok(IMAGE_NEGATIVE_PROMPT.includes(token), `Негатив должен содержать «${token}»`)
}
assert.equal(/AUTHORITATIVE|MUST|RULE/i.test(IMAGE_NEGATIVE_PROMPT), false, "Негатив — это список объектов, не инструкции")

const empty = await buildVisualPrompt("   ")
assert.equal(empty.prompt, "", "Пустой запрос не должен превращаться в промпт")

// --- a bad translation must never reach the image model ----------------------

async function withTranslation(content) {
  const mod = await loadModule("lib/media/visual-prompt.ts", {
    "@/lib/server/malik-model-router": `const runStrictMalikModel = async () => (${JSON.stringify({ content })});`,
    "./types": "",
  })
  return mod.buildVisualPrompt("рыжий кот на подоконнике")
}

const good = await withTranslation("a ginger cat sitting on a windowsill")
assert.equal(good.prompt, "a ginger cat sitting on a windowsill", "Хороший перевод должен использоваться")
assert.equal(good.translated, true, "Перевод должен помечаться как выполненный")

// Everything below is a model misfire: fall back to the user's own words.
for (const [label, bad] of [
  ["отказ", "Sorry, I cannot generate images."],
  ["болтовня", "Sure! Here is the description you asked for:"],
  ["не перевёл", "рыжий кот на подоконнике"],
  ["инструкции", "PRIMARY SUBJECT MUST APPEAR: ginger cat. DO NOT add people."],
  ["пусто", "   "],
  ["односложно", "cat"],
]) {
  const built = await withTranslation(bad)
  assert.equal(built.prompt, "рыжий кот на подоконнике", `Плохой перевод («${label}») должен отбрасываться`)
  assert.equal(built.translated, false, `«${label}» не должен считаться переводом`)
}

// --- the pipeline is actually wired this way ---------------------------------

const router = codeOf("lib/media/image-router.ts")
assert.match(router, /buildVisualPrompt/, "Роутер должен строить промпт через новый пайплайн")
assert.equal(router.includes("strict-image-rules"), false, "Старые «строгие правила» должны быть удалены")
assert.equal(router.includes("image-intent-engine"), false, "Старый intent-движок должен быть удалён")
assert.equal(fs.existsSync("lib/media/strict-image-rules.ts"), false, "Файл строгих правил больше не нужен")
assert.equal(fs.existsSync("lib/media/image-intent-engine.ts"), false, "Файл intent-движка больше не нужен")

const pollinations = codeOf("lib/media/providers/pollinations.ts")
assert.equal(pollinations.includes("compactStrictPrompt"), false, "Провайдер не должен перекраивать промпт")
assert.equal(pollinations.includes("One coherent image"), false, "Провайдер не должен дописывать инструкции в промпт")
assert.match(pollinations, /negative_prompt=/, "Запреты должны уходить в negative_prompt")

// A failed generation must never come back dressed as a picture. (Code and
// website kinds still ship a starter template on failure — that is a scaffold,
// not a counterfeit photograph, so only the media branches are asserted here.)
const generate = codeOf("app/api/generate/route.ts")
assert.equal(generate.includes("Malik Vision Demo"), false, "SVG-заглушка с текстом должна быть удалена")
assert.equal(generate.includes("imageFallbackUrl"), false, "Подделка фото должна быть удалена")
assert.equal(generate.includes("videoFallbackPreviewUrl"), false, "Подделка видео должна быть удалена")
assert.match(generate, /function imageFailure/, "Провал должен возвращаться как честная ошибка")

const mediaBranch = generate.slice(
  generate.indexOf('if (kind === "photo"'),
  generate.indexOf("const fallbackCode"),
)
assert.ok(mediaBranch.length > 200, "Не удалось найти ветку фото/видео")
assert.equal(mediaBranch.includes("demo-ready"), false, "Фото не должно отдаваться как demo-ready")
assert.equal(mediaBranch.includes("storyboard-ready"), false, "Видео не должно отдаваться как storyboard-ready")
assert.ok((mediaBranch.match(/imageFailure\(/g) || []).length >= 4, "Каждый провал медиа должен быть честной ошибкой")

const dashboard = codeOf("components/sovereign/dashboard.tsx")
assert.equal(
  dashboard.includes("cinematic Gemini-style transparent chat generation"),
  false,
  "Чат не должен навязывать свой стиль каждому фото",
)

console.log("✅ Промпт изображения: чистое описание, запреты в negative, заглушек нет")
