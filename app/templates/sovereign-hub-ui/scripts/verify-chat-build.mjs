// A site, game or app built in the chat is shown as its build: real server
// steps one by one, then the result card and the Live Preview beside the chat.
import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import {
  BUILD_FIRST_STEP, chatBuildFacts, chatBuildFiles, chatBuildFolder, chatBuildIsEdit, chatBuildIsProse, chatBuildKind,
  chatBuildKindFromContent, chatBuildKindFromTrace, chatBuildPrimary, chatBuildSteps, chatBuildTotalMs, chatBuildWriting, formatBuildSeconds, ruCount,
} from "../lib/ai/chat-build.ts"

test("only requests to build something runnable become a build", () => {
  assert.equal(chatBuildKind("создай сайт для кофейни в Алматы"), "site")
  assert.equal(chatBuildKind("Сделай лендинг для SaaS"), "site")
  assert.equal(chatBuildKind("Create a landing page for a bakery"), "site")
  assert.equal(chatBuildKind("сделай игру змейка"), "game")
  assert.equal(chatBuildKind("Создай полноценный клон Minecraft в 3D с крафтом и биомами"), "game")
  assert.equal(chatBuildKind("создай 3D battle royale как pubg"), "game")
  assert.equal(chatBuildKind("исправь игру: враги слишком быстрые"), "game", "a change to a game is a build too")
  assert.equal(chatBuildKind("добавь на сайт раздел с отзывами"), "site")
  assert.equal(chatBuildKind("сделай калькулятор ипотеки на html"), "app")
  for (const plain of [
    "как сделать сайт?", "Почему игра лагает", "привет", "напиши игру на python", "создай игру на Unity",
    "создай презентацию про наш сайт", "сделай telegram бот для сайта", "напиши функцию сортировки на javascript",
    "расскажи про игру престолов", "что такое лендинг",
  ]) assert.equal(chatBuildKind(plain), null, plain)
})

test("a build the request did not name is known by its server stages or its page", () => {
  const trace = (title) => ({ version: 1, id: "t", startedAt: 0, state: "running", steps: [{ id: "a", title, kind: "status", state: "completed", startedAt: 1, endedAt: 1 }] })
  assert.equal(chatBuildKindFromTrace(trace("Проектирую игру: жанр, механики, уровни и стиль")), "game")
  assert.equal(chatBuildKindFromTrace(trace("Проектирую композицию под вашу задачу")), "site")
  assert.equal(chatBuildKindFromTrace(trace("Подбираю фотографии по теме")), "site")
  assert.equal(chatBuildKindFromTrace(trace("Проверка актуальных источников")), null)
  assert.equal(chatBuildKindFromTrace(undefined), null)
  assert.equal(chatBuildKindFromContent('```html filename=index.html\n<script id="malik-game-plan" type="application/json">{}</script>\n```'), "game")
  assert.equal(chatBuildKindFromContent('<main id="malik-site" data-generator="malik-forge/v1">'), "site")
  assert.equal(chatBuildKindFromContent("Обычный ответ"), null)
})

test("the delivered files are read from the answer's fences", () => {
  const answer = [
    "Готово!", "", "```html filename=index.html", "<!doctype html><html><head><title>Кофе</title></head><body></body></html>", "```",
    "```css:assets/style.css", "body{margin:0}", "```", "```js", "console.log(1)", "```",
    "```text", "project/", "  index.html", "```", "```malik-cards", "{}", "```", "```html", "<div>второй</div>",
  ].join("\n")
  const files = chatBuildFiles(answer)
  assert.deepEqual(files.map((file) => [file.name, file.language, file.closed]), [
    ["index.html", "html", true], ["assets/style.css", "css", true], ["script.js", "javascript", true], ["index-2.html", "html", false],
  ], "a tree drawing and the chat's own blocks are not files; a fence still being written is open")
  assert.equal(files[0].lines, 1)
  assert.ok(files[0].bytes > 60)
  assert.equal(chatBuildPrimary(files)?.name, "index.html", "the whole HTML document opens in the preview")
  assert.equal(chatBuildPrimary([files[3]]), undefined, "an unfinished file is not previewed")
  const writing = chatBuildWriting(answer)
  assert.deepEqual([writing.started, writing.files, writing.current], [true, 4, "index-2.html"])
  assert.equal(chatBuildWriting("Сейчас напишу").started, false)
  assert.equal(chatBuildIsProse("а".repeat(1300)), true, "long text without code is an ordinary answer")
  assert.equal(chatBuildIsProse("а".repeat(1300) + "\n```html\n<div>"), false)
  assert.equal(chatBuildIsProse("коротко"), false)
})

test("steps are the server's own stages, timed by the gap to the next one", () => {
  const status = (id, title, at, kind = "status") => ({ id, title, kind, state: "completed", startedAt: at, endedAt: at })
  const game = {
    version: 1, id: "g", startedAt: 1000, state: "completed", endedAt: 41_000, steps: [
      { id: "m:request", title: "Отправка запроса", kind: "status", state: "completed", startedAt: 900, endedAt: 1000 },
      { id: "g:1", title: "Обработка запроса", kind: "status", state: "completed", startedAt: 1000, endedAt: 41_000 },
      status("g:2", "Проектирую игру: жанр, механики, уровни и стиль", 2200),
      status("g:3", "Пишу код игры", 6000),
      status("g:4", "Проверяю синтаксис и безопасность кода", 30_000),
      status("g:5", "Запускаю игру в изолированной песочнице: 600 кадров с управлением", 30_500),
      status("g:6", "Собираю страницу игры", 39_000),
      status("g:7", "Ответ поступает в чат", 40_500),
      { id: "g:8", title: "Создание игры", kind: "code", state: "completed", startedAt: 40_400, endedAt: 40_400 },
    ],
  }
  const steps = chatBuildSteps(game, { kind: "game", now: 50_000 })
  assert.deepEqual(steps.map((step) => step.title), [
    BUILD_FIRST_STEP, "Проектирую игру: жанр, механики, уровни и стиль", "Пишу код игры", "Проверяю синтаксис и безопасность кода",
    "Запускаю игру в изолированной песочнице: 600 кадров с управлением", "Собираю страницу игры",
  ], "bookkeeping is hidden and a game's «answer arrives» is not a second writing step")
  assert.deepEqual(steps.map((step) => step.ms), [1200, 3800, 24_000, 500, 8500, 2000])
  assert.ok(steps.every((step) => step.state === "done"))
  assert.equal(chatBuildTotalMs(game), 40_000)

  const site = { version: 1, id: "s", startedAt: 0, state: "running", steps: [
    status("s:1", "Malik AI принял запрос", 10),
    status("s:2", "Проектирую композицию под вашу задачу", 800),
    status("s:3", "Подбираю изображения по теме без загрузки файлов на сервер", 2100),
    { id: "s:4", title: "Подготовка ответа моделью", kind: "model", state: "running", startedAt: 3000 },
    status("s:5", "Ответ поступает в чат", 5200),
    { id: "s:6", title: "Проверка актуальных источников", kind: "search", state: "completed", startedAt: 2500, endedAt: 2900 },
  ] }
  const live = chatBuildSteps(site, { kind: "site", now: 9000 })
  assert.deepEqual(live.map((step) => [step.title, step.state, step.ms]), [
    [BUILD_FIRST_STEP, "done", 800],
    ["Проектирую композицию под вашу задачу", "done", 1300],
    ["Подбираю изображения по теме без загрузки файлов на сервер", "done", 400],
    ["Изучаю источники", "done", 500],
    ["Пишу код", "running", 6000],
  ], "the model call and the first characters are one writing step; the last step runs on the clock")
  assert.equal(chatBuildTotalMs(site, 12_345), 12_345, "a running trace has no total of its own")
  const stopped = chatBuildSteps({ ...site, state: "failed", endedAt: 9500 }, { kind: "site", now: 0 })
  assert.equal(stopped.at(-1).state, "failed")
  assert.equal(stopped.at(-1).ms, 6500)
  assert.deepEqual(chatBuildSteps({ version: 1, id: "x", startedAt: 5, state: "running", steps: [] }, { kind: "app", now: 1 }).map((step) => [step.state, step.ms]), [["running", 0]], "a clock behind the server never shows negative time")
  assert.deepEqual(chatBuildSteps(undefined, { kind: "app", now: 1 }), [])
})

test("the result card states what the files contain", () => {
  const plan = JSON.stringify({ title: "Neon Drift", genre: "racing", engine: "3d", levels: 5 }).replace(/</g, "\\u003c")
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>x</title><style>@media (max-width:600px){}</style></head><body><canvas></canvas><script id="malik-game-plan" type="application/json">${plan}</script><script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script><script>new THREE.WebGLRenderer();new AudioContext()</script></body></html>`
  const files = chatBuildFiles("```html filename=index.html\n" + html + "\n```")
  const facts = chatBuildFacts(files, files[0])
  assert.equal(facts.title, "Neon Drift")
  assert.deepEqual(facts.game, { genre: "racing", engine: "3D · three.js", levels: 5 })
  assert.deepEqual(facts.technologies, ["HTML5", "CSS3", "JavaScript", "Three.js", "WebGL", "Web Audio"])
  assert.equal(facts.responsive, true)
  const site = chatBuildFiles("```html filename=index.html\n<html><head><title>Кофейня &amp; Ко</title></head><body><section></section><section></section><div data-page=\"home\"></div><div data-page=\"menu\"></div><div data-page=\"404\"></div></body></html>\n```")
  const siteFacts = chatBuildFacts(site, site[0])
  assert.deepEqual([siteFacts.title, siteFacts.sections, siteFacts.pages, siteFacts.responsive], ["Кофейня & Ко", 2, 2, false])
  assert.equal(chatBuildFolder("Кофейня & Ко", "site"), "кофейня-ко")
  assert.equal(chatBuildFolder("", "game"), "game")
  assert.equal(formatBuildSeconds(17_500), "17,5 сек")
  assert.equal(formatBuildSeconds(340_000), "340 сек")
  assert.equal(formatBuildSeconds(2_000, true), "2.0 s")
  const lines = ["строка", "строки", "строк"]
  assert.deepEqual([1, 3, 11, 12, 21, 25, 104].map((count) => ruCount(count, lines)), ["1 строка", "3 строки", "11 строк", "12 строк", "21 строка", "25 строк", "104 строки"])
  assert.equal(chatBuildIsEdit("исправь игру"), true)
  assert.equal(chatBuildIsEdit("создай игру и добавь врагов"), false)
})

test("the chat shows the build instead of the code and opens the preview beside it", () => {
  const view = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
  const markdown = fs.readFileSync("components/sovereign/MalikMarkdown.tsx", "utf8")
  const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
  const panel = fs.readFileSync("components/sovereign/ChatBuildPreview.tsx", "utf8")
  const card = fs.readFileSync("components/sovereign/ChatBuild.tsx", "utf8")
  assert.match(view, /buildLive && buildKind \? \(\s*<ChatBuildSteps[^>]*live content=\{displayContent\}/, "while it is written, the steps stand where the code would stream")
  assert.match(view, /!isUser && !buildLive && !buildDone \? <ChatExecution/, "the steps replace «Ход работы» for a build")
  assert.match(view, /collapseCode=\{buildDone\}/, "the finished code stays one click away")
  assert.match(markdown, /collapsed=\{collapseCode\}/)
  assert.match(markdown, /\{!codeShown \? null : tree/)
  assert.match(dashboard, /closeBuildPreview\(\) \}, \[activeChatId, workspaceMode, activeView\]/, "another chat closes the preview")
  assert.match(dashboard, /<ChatBuildPreviewPanel variant="aside" \/>/)
  for (const source of [panel, card]) assert.doesNotMatch(source, /allow-same-origin/, "generated code never gets Malik AI's origin")
  assert.match(card, /sandbox=\{kind === "game" \? "" : "allow-scripts"\}/, "a game's thumbnail does not start a second game with sound")
  assert.match(card, /buildPreviewCanAutoOpen\(\)/, "the panel opens by itself only beside the main chat on a wide screen")
})
