// Execute the real renderer, not source-pattern assertions. No model/API calls.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const modules = new Map()
function load(file) {
  if (modules.has(file)) return modules.get(file).exports
  const module = { exports: {} }
  modules.set(file, module)
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText
  new Function("require", "module", "exports", js)((id) => {
    if (id.endsWith(".css")) return {}
    if (!id.startsWith("@/") && !id.startsWith(".")) return require(id)
    const base = id.startsWith("@/") ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id)
    const target = [base, base + ".ts", base + ".tsx"].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    assert(target, "Missing module: " + id)
    return load(target)
  }, module, module.exports)
  return module.exports
}
const { MalikMarkdown } = load(path.join(root, "components/sovereign/MalikMarkdown.tsx"))
const { subjectCitationUrl } = load(path.join(root, "lib/ai/citation-names.ts"))
const fence = (kind, block) => "```" + kind + "\n" + JSON.stringify({ version: 1, ...block }) + "\n```"
const photo = (name, query) => fence("malik-photos", { subjects: [{ name, query, kind: "entity", layout: "landscape" }] })
const render = (text, question = "Расскажи про Медеу и Шымбулак", citations = []) => renderToStaticMarkup(React.createElement(MalikMarkdown, { text, citations, visualContext: { question, isLatest: true } }))
const count = (html, text) => html.split(text).length - 1
const sources = [{ title: "Медеу: каток", url: "https://example.com/medeu" }, { title: "Шымбулак: канатная дорога", url: "https://example.com/shymbulak" }]
const mixed = ["### Медеу: каток", photo("Медеу", "Medeu"), "Первый абзац катка [1].", "Второй абзац катка.", "### Шымбулак: курорт", "Первый абзац курорта [2].", photo("Шымбулак", "Shymbulak"), "Второй абзац курорта."].join("\n\n")
const html = render(mixed, undefined, sources)
assert.equal(count(html, 'data-malik-reference-topic="Медеу"'), 1)
assert.equal(count(html, 'data-malik-reference-topic="Шымбулак"'), 1)
const first = html.slice(html.indexOf('data-malik-reference-topic="Медеу"'), html.indexOf('data-malik-reference-topic="Шымбулак"'))
assert.match(first, /Первый абзац катка/)
assert.match(first, /Второй абзац катка/)
assert.doesNotMatch(first, /абзац курорта/)
for (const text of ["Первый абзац катка", "Второй абзац катка", "Первый абзац курорта", "Второй абзац курорта"]) assert.equal(count(html, text), 1)
assert.match(first, /href="https:\/\/example.com\/medeu"[^>]*class="malik-md-link is-subject"/)
assert.match(first, /class="malik-md-cite"/)

const chart = fence("malik-visual", { type: "timeline", title: "Маршрут", steps: [{ label: "Начало", date: "Утро" }, { label: "Конец", date: "Вечер" }] })
const noHints = render("### Медеу: каток\n\nОписание катка.\n\n" + chart + "\n\n### Шымбулак: курорт\n\nОписание курорта.")
assert.equal(count(noHints, "data-malik-reference-topic="), 2, "a chart does not switch off independent subject photos")
assert.match(noHints, /data-malik-answer-visual="timeline"/)
assert.doesNotMatch(noHints, /reference-topic="Медеу: каток"/, "descriptive suffixes are not image search subjects")

const partialHints = render("### Медеу\n\nОписание катка.\n\n" + photo("Медеу", "Medeu") + "\n\n### Шымбулак\n\nОписание курорта.")
assert.equal(count(partialHints, "data-malik-reference-topic="), 2, "one model photo hint must not hide other subjects")
const hero = render("### Медеу\n\nОписание одинокого объекта.\n\n" + photo("Медеу", "Medeu"), "Расскажи про Медеу")
assert.equal(count(hero, "data-malik-hero-visual="), 1)
assert.equal(count(hero, "Описание одинокого объекта"), 1, "hero description is not duplicated below the image")
assert.equal(count(render(mixed, "Расскажи про Медеу и Шымбулак без фото"), "data-malik-reference-topic="), 0)
const abstract = render("## Архитектура процессов\n\n- **Анализ рынка:** исследование аудитории.\n- **Регламенты и SOP:** инструкции.\n- **Контент-маркетинг:** материалы.", "Бизнес под ключ с Claude и ChatGPT")
assert.equal(count(abstract, "data-malik-reference-topic="), 0)
const software = render(["## Как собрать рабочую AI-систему для бизнеса", "План работы.", "### 1. Экосистемы и инструменты", fence("malik-cards", { type: "cards", items: [{ title: "ChatGPT", image: "ChatGPT", text: "Описание инструмента." }, { title: "Claude", image: "Claude", text: "Описание инструмента." }] }), "### 2. Как устроить работу", chart, "### 3. Большое изображение в своём разделе", fence("malik-cards", { type: "hero", item: { title: "Контрольный экран", image: 1, text: "Иллюстрация из источника." } }), "### 4. Сравнение результатов", "### 5. Условия и цены"].join("\n\n"), "Сравни ChatGPT и Claude и предложи AI-архитектуру для бизнеса", sources)
assert.equal(count(software, "data-malik-reference-topic="), 0, "structured software answers retain their own images without decorative searches")
assert.equal(subjectCitationUrl("Медеу", [{ title: "Другой объект", url: "https://example.com/other" }]), "")
assert.equal(subjectCitationUrl("iPhone 16 Pro", [{ title: "iPhone 16", url: "https://example.com/phone" }]), "")
assert.equal(subjectCitationUrl("Медеу", [{ title: "Медеу", url: "javascript:alert(1)" }]), "")
const policy = load(path.join(root, "lib/ai/reference-visual-policy.ts"))
const hints = load(path.join(root, "lib/ai/answer-photo-hints.ts"))
const nvidiaQuestion = "Как зарегистрироваться в NVIDIA?"
const nvidiaPlan = policy.planReferenceVisuals(nvidiaQuestion)
assert.equal(nvidiaPlan.kind, "tutorial")
assert.ok(nvidiaPlan.visualDevice.includes("nvidia"))
assert.ok(nvidiaPlan.queries.every((q) => q.includes("NVIDIA")))
const registration = render("### Как зарегистрироваться\n\n1. **Регистрация**: нажмите Sign Up.\n2. Подтвердите почту.", nvidiaQuestion)
assert.doesNotMatch(registration, /data-malik-reference-topic="Регистрация"/)
for (const generic of ["Регистрация", "Sign Up", "Настройки", "Итог"]) {
  assert.equal(policy.isAbstractPhotoSubject(generic), true)
  const subjects = hints.parseAnswerPhotoHints(JSON.stringify({ version: 1, subjects: [{ name: generic, query: generic, kind: "topic" }] }))
  assert.equal(hints.groundedAnswerPhotoPlans(subjects, "Расскажи про NVIDIA", generic).length, 0)
}
const catalog = load(path.join(root, "lib/media/reference-catalog.ts"))
const originalFetch = globalThis.fetch
try {
  globalThis.fetch = async () => Response.json({ query: { pages: [{ title: "File:Registration historical document.jpg", imageinfo: [{ mime: "image/jpeg", thumburl: "https://upload.wikimedia.org/register.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Registration.jpg" }] }] } })
  assert.deepEqual(await catalog.lookupReferenceImages(nvidiaPlan), [], "a historical register is not an NVIDIA account screenshot")
} finally { globalThis.fetch = originalFetch }
console.log("PASS real answer renderer: full inline descriptions, metadata before/between prose, no duplicate hero, mixed chart/photo answers, partial hints, exact section links and opt-out")
console.log("PASS NVIDIA registration context: generic action hints rejected, exact app/feature preserved, unrelated document rejected")
