import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

function load(path, stubs = {}) {
  const javascript = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  new Function("require", "module", "exports", javascript)(
    (id) => {
      if (!Object.hasOwn(stubs, id)) throw new Error("Unexpected dependency: " + id)
      return stubs[id]
    }, module, module.exports,
  )
  return module.exports
}

const intent = load("lib/ai/image-intent.ts")
const photos = [
  "Покажи три фотографии архитектуры Астаны с визуальными референсами. Добавь описание каждой фотографии.",
  "покажи мне медеу алматы",
  "Show me Medeu Almaty",
  "Найди фотографии Алматы",
  "Расскажи про Медеу с фото",
]
for (const prompt of photos) {
  assert.equal(intent.isReferenceImageRequest(prompt), true, "reference request: " + prompt)
  assert.equal(intent.isExplicitImageGenerationRequest(prompt), false, "not paid generation: " + prompt)
  assert.equal(intent.isExplicitImageEditRequest(prompt, false), false, "must not demand uploaded image: " + prompt)
}
for (const prompt of ["Покажи мне код функции", "Покажи мне список моделей", "Покажи мне как исправить изображение", "Напиши текст для фотографии", "Объясни как сгенерировать фото"]) {
  assert.equal(intent.isReferenceImageRequest(prompt), false, "non-visual subject: " + prompt)
}
for (const prompt of ["сгенерируй фото кота", "/image futuristic building"]) {
  assert.equal(intent.isReferenceImageRequest(prompt), false, "creation intent: " + prompt)
  assert.equal(intent.isExplicitImageGenerationRequest(prompt), true, "creation retained: " + prompt)
}
assert.equal(intent.isExplicitImageEditRequest("убери человека на фото", false), true)
assert.equal(intent.isExplicitImageEditRequest("убери человека на фото", true), true)
assert.equal(intent.isExplicitImageEditRequest("добавь кота", true), true)
console.log("PASS existing-reference / creation / edit intent contracts")

const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
const gallery = fs.readFileSync("components/sovereign/MalikVisualGallery.tsx", "utf8")
const response = fs.readFileSync("lib/ai/response-intelligence.ts", "utf8")
assert.match(dashboard, /if \(isReferenceImageRequest\(prompt\)[\s\S]{0,190}return null/)
assert.match(gallery, /return isReferenceImageRequest\(question\)/)
assert.match(response, /VISUAL REFERENCE CONTRACT/)
console.log("PASS client routing, gallery and model response contract")

const calls = []
const media = [{
  title: "File:Medeu.jpg",
  imageinfo: [{
    mime: "image/jpeg", thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Medeu.jpg/680px-Medeu.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Medeu.jpg",
    extmetadata: { Artist: { value: "Test Photographer" }, LicenseShortName: { value: "CC BY-SA 4.0" } },
  }],
}]
const savedFetch = globalThis.fetch
const savedKey = process.env.UNSPLASH_ACCESS_KEY
delete process.env.UNSPLASH_ACCESS_KEY
globalThis.fetch = async (input) => {
  const url = new URL(String(input))
  assert.equal(url.hostname, "commons.wikimedia.org", "only catalogue lookups are allowed")
  const q = url.searchParams.get("gsrsearch") || ""
  calls.push(q)
  return Response.json({ query: { pages: /Medeu|architecture Astana/.test(q) ? media : [] } })
}
const route = load("app/api/chat/reference-images/route.ts", {
  "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
})
try {
  const query = "покажи мне медеу алматы"
  const res = await route.GET(new Request("https://malik.test/api/chat/reference-images?q=" + encodeURIComponent(query)))
  assert.equal(res.status, 200)
  const payload = await res.json()
  assert.equal(payload.images.length, 1)
  assert.equal(payload.images[0].credit, "Test Photographer")
  assert.equal(payload.images[0].license, "CC BY-SA 4.0")
  assert.equal(calls.length, 2)
  assert.match(calls[0], /медеу алматы/)
  assert.match(calls[1], /Medeu Almaty/)
  calls.length = 0
  await route.GET(new Request("https://malik.test/api/chat/reference-images?q=" + encodeURIComponent(photos[0])))
  assert.deepEqual(calls, ["архитектуры Астаны", "architecture Astana"])
  console.log("PASS actual screenshot prompts normalize to subject and use bilingual image search")
} finally {
  globalThis.fetch = savedFetch
  if (savedKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY
  else process.env.UNSPLASH_ACCESS_KEY = savedKey
}
