import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"
import { createRequire } from "node:module"

const require_ = createRequire(import.meta.url)
const React = require_("react")
const { renderToStaticMarkup } = require_("react-dom/server")

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

const box = { exports: {} }
new Function("require", "module", "exports", "React", js.replace(/require\("react"\)/g, "React"))(
  (name) => { throw new Error(`unexpected require(${name})`) }, box, box.exports, React,
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
    console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`)
  }
}

console.log("\nan answer arrives as structure, not as a wall of text")

check("paragraphs separated by a blank line become separate paragraphs", () => {
  const html = render("Первый абзац.\n\nВторой абзац.")
  assert.equal((html.match(/<p /g) || []).length, 2)
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
  assert.match(html, /npm run build/)
  const css = fs.readFileSync("app/titan-chat.css", "utf8")
  assert.match(css, /malik-md-pre[\s\S]{0,400}overflow-x: auto/, "a long line must not widen the conversation")
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
  assert.match(html, /const a = 1/)
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

console.log(failures ? `\n${failures} failing\n` : "\nall answer format checks passed\n")
process.exit(failures ? 1 : 0)
