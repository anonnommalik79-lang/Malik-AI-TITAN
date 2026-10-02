import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"
import { createRequire } from "node:module"

const require_ = createRequire(import.meta.url)
const React = require_("react")
const { renderToStaticMarkup } = require_("react-dom/server")
const icon = (name) => function TestIcon() { return React.createElement("svg", { "data-icon": name }) }
const lucide = { Archive: icon("archive"), Check: icon("check"), Copy: icon("copy"), Download: icon("download"), ExternalLink: icon("external"), Eye: icon("eye"), RefreshCw: icon("refresh") }

/**
 * The chat printed the model's reply into a `whitespace-pre-wrap` div, so every
 * answer arrived as one unbroken wall of prose. Headings, lists and code all
 * landed as the same run of text, and markdown the model did produce showed up
 * as literal asterisks. Two answers of identical quality read completely
 * differently depending only on that.
 *
 * The renderer is parsed into React elements rather than HTML: the text comes
 * from a model, so it can contain anything, and `dangerouslySetInnerHTML` here
 * would be an injection route straight from a prompt to the page.
 */

function codeOf(file) {
  return fs.readFileSync(file, "utf8")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
}

const source = fs.readFileSync("components/sovereign/MalikMarkdown.tsx", "utf8")
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
}).outputText

// The formula renderer is a sibling module; it is transpiled the same way.
const texBox = { exports: {} }
new Function("require", "module", "exports", "React", ts.transpileModule(fs.readFileSync("components/sovereign/malik-tex.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
}).outputText.replace(/require\("react"\)/g, "React"))(
  (name) => {
    if (name === "./malik-tex.css") return {}
    throw new Error(`unexpected require(${name})`)
  }, texBox, texBox.exports, React,
)

const box = { exports: {} }
function loadPure(file) {
  const module = { exports: {} }
  const javascript = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function("module", "exports", javascript)(module, module.exports)
  return module.exports
}
const catalog = loadPure("lib/media/reference-catalog.ts")
const entities = loadPure("lib/ai/answer-entities.ts")
new Function("require", "module", "exports", "React", js.replace(/require\("react"\)/g, "React"))(
  (name) => {
    if (name === "lucide-react") return lucide
    if (name === "@/lib/business/project-zip") return { downloadProjectZip() {} }
    if (name === "@/lib/canvas-preview") return { buildCanvasSrcDoc: (code) => code, buildCanvasProjectSrcDoc: (files, filename) => files.find((file) => file.name === filename)?.content || "", createCanvasBlobUrl: () => "blob:test" }
    if (name === "./malik-tex") return texBox.exports
    if (name === "./MalikVisualGallery") return { isSafeVisualUrl: catalog.isSafeVisualUrl, MalikVisualGallery: () => React.createElement("section", { "data-test-gallery": true }) }
    if (name === "@/lib/ai/answer-entities") return entities
    throw new Error(`unexpected require(${name})`)
  }, box, box.exports, React,
)
const { MalikMarkdown } = box.exports
const render = (text) => renderToStaticMarkup(React.createElement(MalikMarkdown, { text }))

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${error.message}`)
  }
}

console.log("\nan answer arrives as structure, not as a wall of text")

check("paragraphs separated by a blank line become separate paragraphs", () => {
  const html = render("Первый абзац.\n\nВторой абзац.")
  assert.equal((html.match(/<p /g) || []).length, 2)
})
check("entity rows preserve real descriptions once, including the final paragraph", () => {
  const html = render("## Metricool\n\nПланирование публикаций.\n\n## Canva\n\nСоздание графики.")
  assert.equal((html.match(/data-malik-answer-entity/g) || []).length, 2)
  assert.equal((html.match(/Планирование публикаций/g) || []).length, 1)
  assert.equal((html.match(/Создание графики/g) || []).length, 1)
})
check("chat can forbid model-invented image links while keeping text", () => {
  const html = renderToStaticMarkup(React.createElement(MalikMarkdown, { text: "Описание.\n\n![Фото](https://thumb.wikimedia.org/example.jpg)", allowImages: false }))
  assert.ok(html.includes("Описание."))
  assert.ok(!html.includes("data-test-gallery"))
})

check("bullets become a list", () => {
  const html = render("Из чего:\n\n- геометрия\n- материалы\n- свет")
  assert.match(html, /<ul/)
  assert.equal((html.match(/<li>/g) || []).length, 3)
})

check("numbered steps keep their numbering", () => {
  const html = render("Шаги:\n\n1. первый\n2. второй\n3. третий")
  assert.match(html, /<ol/)
  assert.equal((html.match(/<li>/g) || []).length, 3)
})

check("bold, italic and inline code are rendered, not printed as symbols", () => {
  const html = render("**Рендер** это *визуализация* через `blender`")
  assert.match(html, /<strong[^>]*>Рендер<\/strong>/)
  assert.match(html, /<em[^>]*>визуализация<\/em>/)
  assert.match(html, /<code[^>]*>blender<\/code>/)
  assert.ok(!html.includes("**"), "no stray asterisks may survive")
})

check("a fenced block becomes a code block with its own scroll", () => {
  const html = render("Команда:\n\n```bash\nnpm run build\n```")
  assert.match(html, /<pre[^>]*class="malik-md-pre"/)
  assert.match(html, /class="malik-md-codebar"/)
  assert.match(html, /Копировать/)
  assert.match(html, /npm run build/)
  const css = fs.readFileSync("app/titan-chat.css", "utf8")
  assert.match(css, /malik-md-pre[\s\S]{0,400}overflow-x: auto/, "a long line must not widen the conversation")
})

check("a Markdown comparison becomes an accessible table", () => {
  const html = render("| Модель | Скорость |\n| --- | --- |\n| Fast | Высокая |\n| Pro | Средняя |")
  assert.match(html, /<table class="malik-md-table">/)
  assert.equal((html.match(/<th/g) || []).length, 3) // thead + two header cells
  assert.equal((html.match(/<td/g) || []).length, 4)
})

check("headings become headings", () => {
  const html = render("## Где применяется\n\nтекст")
  assert.match(html, /<h3[^>]*class="malik-md-h/)
})

check("model text is never injected as HTML", () => {
  const component = codeOf("components/sovereign/MalikMarkdown.tsx")
  assert.ok(!component.includes("dangerouslySetInnerHTML"), "a prompt must not be able to reach the DOM as markup")
  const html = render("<img src=x onerror=alert(1)>")
  assert.ok(!html.includes("<img"), "raw HTML in the answer stays text")
})

check("an unterminated code fence does not swallow the rest of the answer", () => {
  // Streaming answers get cut off mid-block all the time.
  const html = render("Вот код:\n\n```js\nconst a = 1")
  assert.match(html, /token-keyword">const/)
  assert.match(html, / a = /)
  assert.match(html, /token-number">1/)
})

check("a plain one-line answer stays one plain paragraph", () => {
  const html = render("Да, работает.")
  assert.equal((html.match(/<p /g) || []).length, 1)
  assert.ok(!html.includes("<ul"))
})

console.log("\nwiring")

check("the chat renders the assistant reply through it", () => {
  const chat = codeOf("components/sovereign/chat-view.tsx")
  assert.match(chat, /MalikMarkdown/, "the component must be used")
  assert.ok(!/malik-message-card-assistant whitespace-pre-wrap/.test(chat),
    "pre-wrap on the assistant card would double the spacing the blocks already have")
})

check("the model is told to structure its answer", () => {
  const persona = fs.readFileSync("lib/ai/persona.ts", "utf8")
  assert.match(persona, /Never answer with one unbroken block of text/)
  assert.match(persona, /bulleted list/)
  assert.match(persona, /blank line before and after every list/)
  // A short answer must not get headings bolted onto it.
  assert.match(persona, /one-sentence answer stays one sentence/)
})

console.log("\nformulas, nested lists and numbering, like ChatGPT")

check("display maths is typeset, not shown as LaTeX", () => {
  const html = render("Формула:\n\n$$\\frac{a}{b} + \\sqrt{x^2 + 1}$$\n\nГотово.")
  assert.match(html, /class="mtx mtx-display"/)
  assert.match(html, /class="mtx-frac"/)
  assert.match(html, /class="mtx-sqrt"/)
  assert.match(html, /<sup>/)
  assert.doesNotMatch(html.replace(/aria-label="[^"]*"/g, ""), /\\frac/)
})

check("multi-line \\[ … \\] blocks and inline $…$ are typeset", () => {
  const html = render("Площадь круга $S = \\pi r^2$, а сумма:\n\\[\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n\\]")
  assert.match(html, /class="mtx"/)
  assert.match(html, /π/)
  assert.match(html, /class="mtx-limits"/)
  assert.match(html, /∑/)
})

check("$$…$$ in the middle of a line is set as a display formula", () => {
  const html = render("Сумма первых $n$ чисел: $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$ — это формула Гаусса.")
  assert.match(html, /class="mtx mtx-display"/)
  assert.doesNotMatch(html.replace(/aria-label="[^"]*"/g, ""), /\\sum|\$\$/)
})

check("prices are not mistaken for maths", () => {
  const html = render("Тариф стоит $5, а годовой $50.")
  assert.doesNotMatch(html, /class="mtx/)
  assert.match(html, /\$5, а годовой \$50/)
})

check("code spans keep their dollar signs", () => {
  const html = render("Переменная `$HOME` и `$PATH`.")
  assert.doesNotMatch(html, /class="mtx/)
  assert.match(html, /<code class="malik-md-code">\$HOME<\/code>/)
})

check("an unfinished formula while streaming stays as text", () => {
  const html = render("Решение:\n\n$$\\frac{a}{")
  assert.doesNotMatch(html, /mtx-display/)
})

check("matrices, cases, Greek letters and \\text render", () => {
  const html = render("$$A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}, \\alpha \\leq \\beta, \\text{где } x \\in \\mathbb{R}$$")
  assert.match(html, /mtx-matrix/)
  assert.match(html, /α/)
  assert.match(html, /≤/)
  assert.match(html, /ℝ/)
  assert.match(html, /где/)
})

check("indented items become a nested list", () => {
  const html = render("- Фрукты\n  - Яблоко\n  - Груша\n- Овощи")
  assert.match(html, /<ul class="malik-md-ul"><li>Фрукты<ul class="malik-md-ul"><li>Яблоко<\/li><li>Груша<\/li><\/ul><\/li><li>Овощи<\/li><\/ul>/)
})

check("a numbered list split by blank lines keeps counting", () => {
  const html = render("1. Первый шаг\n\n2. Второй шаг\n\n3. Третий шаг")
  assert.equal((html.match(/<ol/g) || []).length, 1)
  const later = render("Продолжение:\n\n4. Четвёртый шаг")
  assert.match(later, /<ol class="malik-md-ol" start="4">/)
})

check("task lists show checked and open boxes", () => {
  const html = render("- [x] Сделано\n- [ ] Осталось")
  assert.match(html, /malik-md-check is-checked/)
  assert.equal((html.match(/malik-md-task/g) || []).length, 2)
})

check("any mix of lines finishes rendering (no endless loop)", () => {
  const pieces = ["$$", "\\[", "\\]", "- a", "  - b", "1. x", "", "text $x$", "| a | b |", "|---|---|", "```", "> q", "# h", "$$x$$", "\\frac{", "  continued", "- [x] t", "3) y", "+ z"]
  let seed = 7
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (let round = 0; round < 400; round += 1) {
    const lines = Array.from({ length: 1 + Math.floor(random() * 14) }, () => pieces[Math.floor(random() * pieces.length)])
    render(lines.join("\n"))
  }
})

console.log(failures ? `\n${failures} failing\n` : "\nall answer format checks passed\n")
process.exit(failures ? 1 : 0)
