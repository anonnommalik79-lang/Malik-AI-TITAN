// The answer sheet: which requests open a document page, which answers can
// be opened on one, and that the page is wired into the chat.
//
//   node --experimental-strip-types --no-warnings scripts/verify-answer-sheet.mjs

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (file) => readFileSync(`${root}${file}`, "utf8")
const sheet = await import(`${root}lib/ai/answer-sheet.ts`)

let failures = 0
let count = 0
function check(name, fn) {
  count += 1
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${name}\n       ${String(error.message).split("\n")[0]}`)
  }
}

check("a request for a written document opens the sheet", () => {
  for (const text of [
    "Напиши бизнес-план кофейни у метро",
    "Составь резюме для junior frontend разработчика",
    "сделай доклад про изменение климата на 5 минут",
    "Напиши статью про ИИ в медицине",
    "напиши письмо арендодателю о снижении аренды",
    "Бизнес-план кофейни на 12 месяцев",
    "составь план тренировок на месяц",
    "Напиши ТЗ на мобильное приложение для доставки",
    "Подготовь коммерческое предложение для клиники",
    "write an essay about climate change",
    "Draft a cover letter for a PM role",
    "Кофейня туралы мақала жаз",
  ]) assert.equal(sheet.isSheetRequest(text), true, text)
})

check("questions, code, sites, decks and pictures stay where they are", () => {
  for (const text of [
    "что такое бизнес-план?",
    "как написать резюме",
    "Как составить бизнес-план?",
    "What is a business plan?",
    "Сделай презентацию про кофейню",
    "напиши код на python для парсинга",
    "напиши функцию сортировки",
    "сделай сайт для кофейни",
    "сделай лендинг с планом тарифов",
    "напиши бота для телеграма с планом подписки",
    "нарисуй кофейню",
    "Сделай картинку для поста",
    "привет",
  ]) assert.equal(sheet.isSheetRequest(text), false, text)
})

check("only a long, organised answer offers the sheet", () => {
  const organised = `# План\n\n## Рынок\n\n${"Текст абзаца про рынок. ".repeat(30)}\n\n## Деньги\n\n- раз\n- два\n- три\n\n${"Ещё текст. ".repeat(20)}`
  assert.equal(sheet.isSheetWorthy(organised), true)
  assert.equal(sheet.isSheetWorthy("Короткий ответ."), false)
  assert.equal(sheet.isSheetWorthy("```js\n" + "const a = 1\n".repeat(200) + "```\n\n## Итог\n\n## Ещё"), false, "mostly code is not a document")
})

check("the title comes from the document, then from the request", () => {
  assert.equal(sheet.sheetTitle("# Бизнес-план: **Кофейня**\n\ntext", "x"), "Бизнес-план: Кофейня")
  assert.equal(sheet.sheetTitle("", "Напиши бизнес-план кофейни у метро"), "Бизнес-план кофейни у метро")
  assert.equal(sheet.sheetFileName("Бизнес-план: Кофейня / 2026?"), "Бизнес-план-Кофейня-2026.md")
})

check("a long document is written faster, never slower than its budget", () => {
  const blocks = Array.from({ length: 80 }, (_, i) => ({ kind: i % 5 ? "p" : "h", size: 400 }))
  const timeline = sheet.sheetTimeline(blocks, 9000)
  const last = timeline[timeline.length - 1]
  assert.ok(last.start + last.duration <= 9001, `ends at ${last.start + last.duration}ms`)
  assert.ok(timeline.every((item, i) => i === 0 || item.start >= timeline[i - 1].start), "in reading order")
})

check("the chat opens the sheet for document requests and offers it on long answers", () => {
  const chat = read("components/sovereign/chat-view.tsx")
  assert.match(chat, /import \{ AnswerSheet \} from "\.\/answer-sheet\/AnswerSheet"/)
  assert.match(chat, /isSheetRequest\(request\.content\)/)
  assert.match(chat, /title="Открыть на листе"/)
  assert.match(chat, /closedSheets\.current\.has\(lastMessage\.id\)/, "a closed sheet does not pop open again")
})

check("the sheet is a whole black-and-white page, safe from the app's dialog rules", () => {
  const css = read("components/sovereign/answer-sheet/answer-sheet.css")
  assert.match(css, /\.malik-sheet\.malik-sheet\[role="dialog"\] \{[\s\S]*?max-width: none !important;/)
  for (const colour of css.match(/#[0-9a-fA-F]{6}\b/g) || []) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16))
    assert.ok(r === g && g === b, `${colour} is not a neutral grey`)
  }
  assert.match(css, /prefers-reduced-motion: reduce/)
  const component = read("components/sovereign/answer-sheet/AnswerSheet.tsx")
  assert.match(component, /createPortal\(/)
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/)
})

console.log(failures ? `\n${failures} check(s) failed\n` : `\nanswer sheet: all ${count} checks passed\n`)
process.exit(failures ? 1 : 0)
